import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/errors.js';
export async function createApp(){
 const app=await NestFactory.create(AppModule);
 const config=app.get(ConfigService);
 const allowedOrigin=config.getOrThrow<string>('FRONTEND_ORIGIN');
 const allowAnyOrigin=config.getOrThrow<boolean>('CORS_ALLOW_ANY_ORIGIN');
 app.enableCors({origin:(origin:string|undefined,callback:(error:Error|null,allow?:boolean)=>void)=>callback(null,!origin||allowAnyOrigin||origin===allowedOrigin),credentials:false,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']});
 app.useGlobalFilters(new ApiExceptionFilter());
 app.enableShutdownHooks();return app;
}
