import { useState } from 'react';
import { Check,LoaderCircle } from 'lucide-react';
import { publicAuth } from './auth';
import { ApiError } from './api';

export function AuthPage(){
  const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark">c<span>·</span></span><strong>cerca.</strong></div>
    <h1>{register?'Crea tu espacio':'Qué bueno verte.'}</h1>
    <p>{register?'Empieza tu libreta personal.':'Tus personas están a un paso.'}</p>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);try{await publicAuth(register?'/auth/register':'/auth/login',String(form.get('email')),String(form.get('password')));}catch(e){setError(e instanceof ApiError?e.message:'No pudimos conectar con el servidor.');}finally{setBusy(false);}}}>
      <label className="field">Correo electrónico<input name="email" type="email" autoComplete="email" required placeholder="tu@correo.com"/></label>
      <label className="field">Contraseña<input name="password" type="password" autoComplete={register?'new-password':'current-password'} required minLength={12} placeholder="Mínimo 12 caracteres"/></label>
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<Check size={18}/>} {register?'Crear cuenta':'Iniciar sesión'}</button>
    </form>
    <button className="auth-switch" onClick={()=>{setRegister(!register);setError('')}}>{register?'Ya tengo una cuenta':'Crear una cuenta nueva'}</button>
    <small>Sesión local de prueba. Usa datos ficticios mientras el servicio funcione por HTTP.</small>
  </section></main>;
}
