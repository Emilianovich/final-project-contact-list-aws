import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { HealthModule } from './health/health.module.js';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,cache:true,validate:validateEnvironment}),DatabaseModule,AuthModule,ContactsModule,HealthModule]})
export class AppModule{}
