import { Injectable, Module } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.module.js';
import { users } from '../database/schema.js';
@Injectable()
export class UsersService {
 constructor(private readonly database:DatabaseService){}
 async findByEmail(email:string){return (await this.database.db.select().from(users).where(eq(users.email,email)).limit(1))[0];}
 async findById(id:string){return (await this.database.db.select({id:users.id,email:users.email}).from(users).where(eq(users.id,id)).limit(1))[0];}
 async create(email:string,passwordHash:string){return (await this.database.db.insert(users).values({email,passwordHash}).returning({id:users.id,email:users.email}))[0]!;}
}
@Module({providers:[UsersService],exports:[UsersService]})
export class UsersModule{}
