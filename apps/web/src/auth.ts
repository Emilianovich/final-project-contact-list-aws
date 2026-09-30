import { create } from 'zustand';
import { createApiClient,ApiError } from './api';
import { createSessionManager,type Session } from './session';

declare global {interface Window {__CERCA_CONFIG__?:{apiBaseUrl?:string}}}
const memory=new Map<string,string>();
const fallback:Storage={get length(){return memory.size},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v)},removeItem:k=>{memory.delete(k)},clear:()=>memory.clear()};
const storage=typeof sessionStorage==='undefined'?fallback:sessionStorage;
let sessionManager:ReturnType<typeof createSessionManager>;
const api=createApiClient({
  baseUrl:(typeof window!=='undefined'?window.__CERCA_CONFIG__?.apiBaseUrl:undefined)??'http://localhost:3000',
  getAccessToken:()=>sessionManager?.get()?.accessToken??null,
  onUnauthorized:()=>{},
});
sessionManager=createSessionManager({storage,request:api.request});

type AuthState={session:Session|null;setSession:(session:Session|null)=>void};
export const useAuth=create<AuthState>(set=>({
  session:sessionManager.get(),
  setSession:session=>{if(session)sessionManager.set(session);else sessionManager.clear();set({session});},
}));

export async function publicAuth(path:'/auth/login'|'/auth/register',email:string,password:string){
  const session=await api.request<Session>(path,{method:'POST',body:JSON.stringify({email,password})});
  useAuth.getState().setSession(session);return session;
}
export async function logout(){
  const current=sessionManager.get();
  try {if(current)await api.request('/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:current.refreshToken})});}
  finally {useAuth.getState().setSession(null);}
}
export async function request<T>(path:string,init?:RequestInit):Promise<T>{
  try{return await api.request<T>(path,init);}
  catch(error){
    if(!(error instanceof ApiError)||error.status!==401||path.startsWith('/auth/'))throw error;
    try {const renewed=await sessionManager.refresh();useAuth.setState({session:renewed});}
    catch {useAuth.getState().setSession(null);throw error;}
    return api.request<T>(path,init);
  }
}
