import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type Principal } from './auth.service.js';
import { failure } from '../common/errors.js';
export type AuthRequest=Request & {user:Principal};
@Injectable()
export class AuthGuard implements CanActivate{
 constructor(private readonly auth:AuthService){}
 async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<AuthRequest>();const match=/^Bearer ([^\s]+)$/i.exec(request.headers.authorization??'');if(!match)throw failure(401,'UNAUTHORIZED','Inicia sesión para continuar.');request.user=await this.auth.authenticate(match[1]!);return true;}
}
export const CurrentUser=createParamDecorator((_data:unknown,context:ExecutionContext)=>context.switchToHttp().getRequest<AuthRequest>().user);
