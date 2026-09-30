import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(32).toString('hex');return `scrypt$16384$8$1$${salt}$${(await derive(password,salt)).toString('hex')}`;}
export async function verifyPassword(password:string,hash:string){const parts=hash.split('$');if(parts.length!==6||parts[0]!=='scrypt')return false;const expected=Buffer.from(parts[5]!,'hex');const actual=await derive(password,parts[4]!);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
