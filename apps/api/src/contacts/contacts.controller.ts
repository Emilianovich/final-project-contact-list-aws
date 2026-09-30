import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode } from '@nestjs/common';
import { z } from 'zod';
import { contactInputSchema,countryCodes,type ContactInput } from '@contactos/contracts';
import { AuthGuard,CurrentUser } from '../auth/auth.guard.js';
import type { Principal } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContactsService,type ContactQuery } from './contacts.service.js';
const input=contactInputSchema.strict();
const query=z.strictObject({status:z.enum(['active','deleted']).default('active'),q:z.string().max(254).default(''),country:z.string().refine(v=>countryCodes.includes(v as typeof countryCodes[number])).optional()});
@Controller('contacts') @UseGuards(AuthGuard)
export class ContactsController{
 constructor(private readonly contacts:ContactsService){}
 @Get() list(@CurrentUser() user:Principal,@Query(new ZodPipe(query)) query:ContactQuery){return this.contacts.list(user.id,query);}
 @Post() create(@CurrentUser() user:Principal,@Body(new ZodPipe(input)) body:ContactInput){return this.contacts.create(user.id,body);}
 @Get(':id') get(@CurrentUser() user:Principal,@Param('id',new ZodPipe(z.uuid())) id:string){return this.contacts.get(user.id,id);}
 @Patch(':id') update(@CurrentUser() user:Principal,@Param('id',new ZodPipe(z.uuid())) id:string,@Body(new ZodPipe(input)) body:ContactInput){return this.contacts.update(user.id,id,body);}
 @Delete(':id') remove(@CurrentUser() user:Principal,@Param('id',new ZodPipe(z.uuid())) id:string){return this.contacts.remove(user.id,id);}
 @Post(':id/restore') @HttpCode(200) restore(@CurrentUser() user:Principal,@Param('id',new ZodPipe(z.uuid())) id:string){return this.contacts.restore(user.id,id);}
}
