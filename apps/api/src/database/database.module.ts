import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { connectionConfig } from './connection.js';
import { validateEnvironment } from '../config/environment.js';
import * as schema from './schema.js';
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool:Pool;
  readonly db;
  constructor(config:ConfigService) {
    const keys=['NODE_ENV','PORT','FRONTEND_ORIGIN','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL','DB_SSL_CA_PATH','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','JWT_ACCESS_TTL','JWT_REFRESH_TTL'];
    const raw=Object.fromEntries(keys.map(key=>[key,config.get(key)]));
    raw.DB_SSL=String(raw.DB_SSL ?? false);
    this.pool=new Pool(connectionConfig(validateEnvironment(raw)));
    this.db=drizzle(this.pool,{schema});
  }
  async onApplicationShutdown(){await this.pool.end();}
}
@Global()
@Module({providers:[DatabaseService],exports:[DatabaseService]})
export class DatabaseModule {}
