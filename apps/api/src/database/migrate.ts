import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { getCountries,getCountryCallingCode } from 'libphonenumber-js/max';
import { validateEnvironment } from '../config/environment.js';
import { connectionConfig } from './connection.js';

const env=validateEnvironment(process.env);
const pool=new Pool(connectionConfig(env));
try {
  const schema=await readFile(resolve(process.cwd(),'database/01-schema.sql'),'utf8');
  await pool.query(schema);
  const names=new Intl.DisplayNames(['es'],{type:'region'});
  for(const code of getCountries()){
    await pool.query(`INSERT INTO countries(code,name,calling_code) VALUES($1,$2,$3)
      ON CONFLICT(code) DO UPDATE SET name=excluded.name,calling_code=excluded.calling_code`,
      [code,names.of(code)??code,getCountryCallingCode(code)]);
  }
  console.log(`Database schema ready (${getCountries().length} countries).`);
} finally {await pool.end();}
