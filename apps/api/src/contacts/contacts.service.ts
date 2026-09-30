import { Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { normalizeContact, type ContactInput } from '@contactos/contracts';
import { DatabaseService } from '../database/database.module.js';
import { contacts } from '../database/schema.js';
import { failure, isUniqueViolation } from '../common/errors.js';
export type ContactQuery={status:'active'|'deleted';q:string;country?:string};
const escapeLike=(value:string)=>value.replace(/[\\%_]/g,'\\$&');
const serialize=(row:typeof contacts.$inferSelect)=>({...row,createdAt:new Date(row.createdAt).toISOString(),updatedAt:new Date(row.updatedAt).toISOString(),deletedAt:row.deletedAt?new Date(row.deletedAt).toISOString():null});
@Injectable()
export class ContactsService{
 constructor(private readonly database:DatabaseService){}
 async list(userId:string,query:ContactQuery){const search=query.q?`%${escapeLike(query.q)}%`:undefined;const rows=await this.database.db.select().from(contacts).where(and(eq(contacts.userId,userId),query.status==='active'?isNull(contacts.deletedAt):isNotNull(contacts.deletedAt),query.country?eq(contacts.country,query.country):undefined,search?or(ilike(contacts.name,search),ilike(contacts.email,search)):undefined)).orderBy(asc(contacts.name),asc(contacts.id));return {items:rows.map(serialize)};}
 async get(userId:string,id:string){const row=(await this.database.db.select().from(contacts).where(and(eq(contacts.id,id),eq(contacts.userId,userId))).limit(1))[0];if(!row)throw failure(404,'NOT_FOUND','Contacto no encontrado.');return serialize(row);}
 private async conflict(userId:string,phone:string,exclude?:string):Promise<never>{const row=(await this.database.db.select().from(contacts).where(and(eq(contacts.userId,userId),eq(contacts.phoneE164,phone),exclude?ne(contacts.id,exclude):undefined)).limit(1))[0];throw failure(409,row?.deletedAt?'PHONE_DELETED':'PHONE_EXISTS',row?.deletedAt?'Este teléfono está en la papelera.':'Este teléfono ya existe.',row?{contactId:row.id}:{});}
 async create(userId:string,input:ContactInput){const normalized=normalizeContact(input);try{return serialize((await this.database.db.insert(contacts).values({...normalized,userId}).returning())[0]!);}catch(error){if(isUniqueViolation(error))return this.conflict(userId,normalized.phoneE164);throw error;}}
 async update(userId:string,id:string,input:ContactInput){const normalized=normalizeContact(input);await this.get(userId,id);try{const row=(await this.database.db.update(contacts).set({...normalized,updatedAt:new Date().toISOString()}).where(and(eq(contacts.id,id),eq(contacts.userId,userId),isNull(contacts.deletedAt))).returning())[0];if(!row)throw failure(409,'CONTACT_DELETED','Restaura el contacto antes de editarlo.');return serialize(row);}catch(error){if(isUniqueViolation(error))return this.conflict(userId,normalized.phoneE164,id);throw error;}}
 async remove(userId:string,id:string){const now=new Date().toISOString();const row=(await this.database.db.update(contacts).set({deletedAt:now,updatedAt:now}).where(and(eq(contacts.id,id),eq(contacts.userId,userId),isNull(contacts.deletedAt))).returning())[0];return row?serialize(row):this.get(userId,id);}
 async restore(userId:string,id:string){const row=(await this.database.db.update(contacts).set({deletedAt:null,updatedAt:new Date().toISOString()}).where(and(eq(contacts.id,id),eq(contacts.userId,userId),isNotNull(contacts.deletedAt))).returning())[0];return row?serialize(row):this.get(userId,id);}
}
