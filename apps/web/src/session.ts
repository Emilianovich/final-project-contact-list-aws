import { z } from 'zod';

const sessionSchema = z.object({
  accessToken:z.string().min(1),
  refreshToken:z.string().min(1),
  user:z.object({id:z.string().min(1),email:z.string().email()}),
});
export type Session=z.infer<typeof sessionSchema>;
type Options={
  storage:Storage;
  request:<T>(path:string,init?:RequestInit)=>Promise<T>;
  onClear?:()=>void;
};

export function createSessionManager({storage,request,onClear}:Options){
  const key='cerca-session';
  let generation=0;
  let current:Session|null=read();
  let inflight:Promise<Session>|null=null;
  function read(){
    try {return sessionSchema.safeParse(JSON.parse(storage.getItem(key)??'null')).data??null;}
    catch {return null;}
  }
  function set(session:Session){
    current=sessionSchema.parse(session);generation++;storage.setItem(key,JSON.stringify(current));return current;
  }
  function clear(){
    const had=!!current||storage.getItem(key)!==null;current=null;generation++;storage.removeItem(key);if(had)onClear?.();
  }
  async function refresh(){
    if(inflight)return inflight;
    if(!current)throw new Error('No hay una sesión para renovar.');
    const snapshot=current,started=generation;
    inflight=request<Session>('/auth/refresh',{method:'POST',body:JSON.stringify({refreshToken:snapshot.refreshToken})})
      .then(value=>{const next=sessionSchema.parse(value);if(generation!==started||current?.refreshToken!==snapshot.refreshToken)throw new Error('La sesión cambió durante la renovación.');return set(next);})
      .catch(error=>{if(error?.status===401&&generation===started&&current?.refreshToken===snapshot.refreshToken)clear();throw error;})
      .finally(()=>{inflight=null;});
    return inflight;
  }
  return {get:()=>current,set,clear,refresh};
}
