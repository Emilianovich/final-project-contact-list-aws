import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';
import type { Environment } from '../config/environment.js';
export function connectionConfig(env: Environment): PoolConfig {
  return { host:env.DB_HOST, port:env.DB_PORT, database:env.DB_NAME, user:env.DB_USER, password:env.DB_PASSWORD,
    ssl:env.DB_SSL ? {rejectUnauthorized:true, ...(env.DB_SSL_CA_PATH ? {ca:readFileSync(env.DB_SSL_CA_PATH,'utf8')} : {})} : false,
    max:10, connectionTimeoutMillis:5000, idleTimeoutMillis:30000 };
}
