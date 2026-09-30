import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module.js';
@Controller('health')
class HealthController{
 constructor(private readonly database:DatabaseService){}
 @Get() async check(){try{await this.database.pool.query('SELECT 1');return {status:'ok'};}catch{throw new ServiceUnavailableException('Database unavailable');}}
}
@Module({controllers:[HealthController]})
export class HealthModule{}
