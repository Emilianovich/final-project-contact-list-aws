import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.module.js';
import { authSessions } from '../database/schema.js';
import { UsersService } from '../users/users.module.js';
import { failure, isUniqueViolation } from '../common/errors.js';
import { hashPassword, verifyPassword } from './password.js';
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const claimsSchema=z.object({sub:z.uuid(),sid:z.uuid(),type:z.enum(['access','refresh']),exp:z.number(),iat:z.number()});
export type Principal={id:string;email:string;sessionId:string};
@Injectable()
export class AuthService {
 constructor(private readonly database:DatabaseService,private readonly users:UsersService,private readonly jwt:JwtService,private readonly config:ConfigService){}
 async register(email:string,password:string){
   let user;try{user=await this.users.create(email,await hashPassword(password));}catch(error){if(isUniqueViolation(error))throw failure(409,'EMAIL_EXISTS','Este correo ya está registrado.');throw error;}
   return this.startSession(user);
 }
 async login(email:string,password:string){
   const user=await this.users.findByEmail(email);
   // Equal-cost password derivation also for unknown users avoids an early timing shortcut.
   const valid=user?await verifyPassword(password,user.passwordHash):!!(await hashPassword(password))&&false;
   if(!user||!valid)throw failure(401,'UNAUTHORIZED','Credenciales inválidas.');
   return this.startSession({id:user.id,email:user.email});
 }
 private async pair(user:{id:string;email:string},sid:string,expiresAt:string){
   const exp=Math.floor(new Date(expiresAt).getTime()/1000);
   const accessToken=await this.jwt.signAsync({sub:user.id,sid,type:'access'},{secret:this.config.getOrThrow('JWT_ACCESS_SECRET'),algorithm:'HS256',expiresIn:900});
   const refreshToken=await this.jwt.signAsync({sub:user.id,sid,type:'refresh',jti:randomUUID(),exp},{secret:this.config.getOrThrow('JWT_REFRESH_SECRET'),algorithm:'HS256'});
   return {accessToken,refreshToken,user};
 }
 private async startSession(user:{id:string;email:string}){
   const sid=randomUUID();const expiresAt=new Date((Math.floor(Date.now()/1000)+604800)*1000).toISOString();
   const tokens=await this.pair(user,sid,expiresAt);
   await this.database.db.insert(authSessions).values({id:sid,userId:user.id,refreshHash:digest(tokens.refreshToken),expiresAt});
   return tokens;
 }
 private async claims(token:string,type:'access'|'refresh'){
   try{const decoded=await this.jwt.verifyAsync(token,{secret:this.config.getOrThrow(type==='access'?'JWT_ACCESS_SECRET':'JWT_REFRESH_SECRET'),algorithms:['HS256']});const value=claimsSchema.parse(decoded);if(value.type!==type)throw Error();return value;}catch{throw failure(401,'UNAUTHORIZED','La sesión no es válida.');}
 }
 async authenticate(token:string):Promise<Principal>{
   const claims=await this.claims(token,'access');
   const session=(await this.database.db.select().from(authSessions).where(and(eq(authSessions.id,claims.sid),eq(authSessions.userId,claims.sub),isNull(authSessions.revokedAt),gt(authSessions.expiresAt,new Date().toISOString()))).limit(1))[0];
   const user=session?await this.users.findById(claims.sub):undefined;
   if(!user)throw failure(401,'UNAUTHORIZED','La sesión no es válida.');
   return {...user,sessionId:claims.sid};
 }
 async refresh(token:string){
   const claims=await this.claims(token,'refresh');
   // Keep replay revocation committed: throwing inside the transaction would undo it.
   const result=await this.database.db.transaction(async tx=>{
     const session=(await tx.select().from(authSessions).where(and(eq(authSessions.id,claims.sid),eq(authSessions.userId,claims.sub))).for('update'))[0];
     if(!session||session.revokedAt||new Date(session.expiresAt).getTime()<=Date.now())return null;
     if(session.refreshHash!==digest(token)){await tx.update(authSessions).set({revokedAt:new Date().toISOString()}).where(eq(authSessions.id,session.id));return null;}
     const user=await this.users.findById(claims.sub);if(!user)return null;
     const tokens=await this.pair(user,session.id,session.expiresAt);
     await tx.update(authSessions).set({refreshHash:digest(tokens.refreshToken)}).where(eq(authSessions.id,session.id));return tokens;
   });
   if(!result)throw failure(401,'UNAUTHORIZED','La sesión no es válida.');return result;
 }
 async logout(token:string){const claims=await this.claims(token,'refresh');await this.database.db.update(authSessions).set({revokedAt:new Date().toISOString()}).where(and(eq(authSessions.id,claims.sid),eq(authSessions.userId,claims.sub)));}
}
