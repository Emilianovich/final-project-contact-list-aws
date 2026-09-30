import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
export function failure(status:number, code:string, message:string, extra:Record<string,unknown>={}) {return new HttpException({code,message,...extra},status);}
export function isUniqueViolation(error:unknown):boolean {return !!error && typeof error==='object' && (('code' in error && error.code==='23505') || ('cause' in error && isUniqueViolation(error.cause)));}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger=new Logger(ApiExceptionFilter.name);
  catch(error:unknown,host:ArgumentsHost){
    const response=host.switchToHttp().getResponse<Response>();
    if(error instanceof HttpException){const status=error.getStatus(); const body=error.getResponse();
      response.status(status).json(typeof body==='object' && 'code' in body ? body : {code:status===401?'UNAUTHORIZED':status===404?'NOT_FOUND':status===400?'VALIDATION_ERROR':'REQUEST_ERROR',message:status===401?'No autorizado.':typeof body==='string'?body:(body as {message?:string}).message ?? 'Solicitud inválida.'});
    }else{this.logger.error('Unhandled request failure');response.status(500).json({code:'INTERNAL_ERROR',message:'No se pudo completar la solicitud.'});}
  }
}
