import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService, type Principal } from './auth.service.js';
import { AuthGuard, CurrentUser } from './auth.guard.js';
const credentials=z.strictObject({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),password:z.string().min(12).max(128)});
const refreshInput=z.strictObject({refreshToken:z.string().min(1).max(8192)});
@Controller('auth')
export class AuthController{
 constructor(private readonly auth:AuthService){}
 @Post('register') register(@Body(new ZodPipe(credentials)) body:z.infer<typeof credentials>){return this.auth.register(body.email,body.password);}
 @Post('login') @HttpCode(200) login(@Body(new ZodPipe(credentials)) body:z.infer<typeof credentials>){return this.auth.login(body.email,body.password);}
 @Get('me') @UseGuards(AuthGuard) me(@CurrentUser() user:Principal){return {id:user.id,email:user.email};}
 @Post('refresh') @HttpCode(200) refresh(@Body(new ZodPipe(refreshInput)) body:z.infer<typeof refreshInput>){return this.auth.refresh(body.refreshToken);}
 @Post('logout') @HttpCode(204) async logout(@Body(new ZodPipe(refreshInput)) body:z.infer<typeof refreshInput>){await this.auth.logout(body.refreshToken);}
}
