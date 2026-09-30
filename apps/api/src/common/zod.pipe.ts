import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { failure } from './errors.js';
@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema:z.ZodType){}
  transform(value:unknown){const parsed=this.schema.safeParse(value);if(!parsed.success)throw failure(400,'VALIDATION_ERROR','Revisa los datos enviados.',{details:parsed.error.issues.map(i=>({path:i.path,message:i.message}))});return parsed.data;}
}
