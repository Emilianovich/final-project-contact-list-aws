import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {getCountries,getCountryCallingCode}=require('libphonenumber-js/max');
const names=new Intl.DisplayNames(['es'],{type:'region'});
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const values=getCountries().map(code=>`(${quote(code)},${quote(names.of(code)??code)},${quote(getCountryCallingCode(code))})`).join(',\n');
writeFileSync(new URL('../database/02-countries.sql',import.meta.url),`BEGIN;\nINSERT INTO countries(code,name,calling_code) VALUES\n${values}\nON CONFLICT(code) DO UPDATE SET name=excluded.name,calling_code=excluded.calling_code;\nCOMMIT;\n`);
