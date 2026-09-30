export class ApiError extends Error {
  constructor(public status:number,public code:string,message:string,public contactId?:string) {super(message);this.name='ApiError';}
}
interface ApiClientOptions {
  baseUrl:string;
  getAccessToken:()=>string|null;
  onUnauthorized:()=>void;
  fetch?:typeof globalThis.fetch;
}
export function createApiClient(options:ApiClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {async request<T>(path:string,init:RequestInit={}):Promise<T> {
    const headers = new Headers(init.headers);
    const token = options.getAccessToken();
    if(token) headers.set('Authorization','Bearer '+token);
    if(init.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const response = await fetcher(options.baseUrl.replace(/\/$/,'')+'/'+path.replace(/^\//,''),{...init,headers,credentials:'omit'});
    // Read a clone so even unusual fetch adapters that reuse a Response remain safe.
    const text = await response.clone().text();
    let body: any;
    try {body=text?JSON.parse(text):undefined;} catch {body=undefined;}
    if(!response.ok) {
      if(response.status===401) options.onUnauthorized();
      throw new ApiError(response.status,body?.code??'HTTP_ERROR',body?.message??'No pudimos completar la solicitud.',body?.contactId);
    }
    return body as T;
  }};
}
