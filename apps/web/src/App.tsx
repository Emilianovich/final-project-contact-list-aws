import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import * as Dialog from '@radix-ui/react-dialog';
import { Toaster, toast } from 'sonner';
import { UsersRound, Trash2, Plus, Search, Globe2, ArrowUpRight, X, Pencil, RotateCcw, Mail, Phone, BookOpen, ChevronRight, Palette, Check, LogOut } from 'lucide-react';
import { getCountryCallingCode, parsePhoneNumberFromString, getExampleNumber, type CountryCode } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';
import { countryCodes, contactInputSchema, themes, type Contact, type ContactInput } from '@contactos/contracts';
import { repository, filterContacts, DuplicateContactError, formatDate } from './data';
import { CountryPicker } from './CountryPicker';
import { usePreferences } from './store';
import { logout, useAuth } from './auth';

const names = new Intl.DisplayNames(['es'],{type:'region'});
const countries = countryCodes.map(code=>({code,name:names.of(code) ?? code})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
const flag = (code:string)=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
const initials = (name:string)=>name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const blank: ContactInput = {name:'',email:'',country:'PA',phone:''};

function Modal({title,description,children,onClose,wide=false}:{title:string;description:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  return <Dialog.Root open onOpenChange={open=>{if(!open) onClose();}}>
    <Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className={'modal '+(wide?'wide':'')}>
      <div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div>
      <button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20}/></button></div>{children}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function ContactForm({contact,onClose,onSaved}:{contact?:Contact;onClose:()=>void;onSaved:()=>void}) {
  const [duplicate,setDuplicate] = useState<Contact|null>(null);
  const [conflict,setConflict] = useState('');
  const [discard,setDiscard] = useState(false);
  const client = useQueryClient();
  const defaults:ContactInput = contact ? {name:contact.name,email:contact.email,country:contact.country,
    phone:parsePhoneNumberFromString(contact.phoneE164)?.formatNational() ?? contact.phoneE164} : blank;
  const save = useMutation({mutationFn:(value:ContactInput)=>repository.save(value,contact?.id),
    onSuccess:async()=>{await client.invalidateQueries({queryKey:['contacts']});toast.success(contact?'Contacto actualizado':'Contacto creado');onSaved();},
    onError:error=>{if(error instanceof DuplicateContactError) {
      if(error.contact.deletedAt) setDuplicate(error.contact); else setConflict(error.message);
    } else toast.error('No pudimos guardar el contacto. Inténtalo de nuevo.');}});
  const restore = useMutation({mutationFn:(id:string)=>repository.restore(id),onSuccess:async()=>{
    await client.invalidateQueries({queryKey:['contacts']});toast.success('Contacto restaurado');onSaved();
  },onError:()=>toast.error('No pudimos restaurar el contacto.')});
  const form = useForm({defaultValues:defaults,validators:{onSubmit:contactInputSchema},onSubmit:async({value})=>{setConflict('');await save.mutateAsync(value).catch(()=>{});}});
  const close = ()=>{if(save.isPending || restore.isPending)return;if(form.state.isDirty) setDiscard(true);else onClose();};
  return <>
    <Modal title={contact?'Editar contacto':'Una persona más cerca'} description={contact?'Actualiza los datos de tu contacto.':'Guarda sus datos para encontrarlos cuando los necesites.'} onClose={close}>
      <form noValidate onSubmit={e=>{e.preventDefault();e.stopPropagation();void form.handleSubmit();}}>
        {(['name','email'] as const).map(key=><form.Field key={key} name={key}>{field=><label className="field">
          {key==='name'?'Nombre completo':'Correo electrónico'}
          <input autoFocus={key==='name'} autoComplete={key==='name'?'name':'email'} type={key==='email'?'email':'text'}
            placeholder={key==='name'?'Ej. Ana Martínez':'ana@ejemplo.com'} value={field.state.value}
            aria-invalid={field.state.meta.errors.length>0} aria-describedby={key+'-error'}
            onChange={e=>field.handleChange(e.target.value)} onBlur={field.handleBlur}/>
          <span id={key+'-error'} className="field-error">{field.state.meta.errors.map(e=>e?.message).join(' ')}</span>
        </label>}</form.Field>)}
        <form.Field name="country">{field=><CountryPicker value={field.state.value}
          onChange={value=>{field.handleChange(value);setConflict('');}} onBlur={field.handleBlur}/>}</form.Field>
        <form.Subscribe selector={state=>state.values.country}>{country=><form.Field name="phone">{field=><label className="field">
          Número de teléfono
          <div className="phone-input"><span>+{getCountryCallingCode(country as CountryCode)}</span>
          <input type="tel" autoComplete="tel-national" value={field.state.value}
            placeholder={getExampleNumber(country as CountryCode,examples)?.formatNational() ?? 'Número local'}
            aria-invalid={field.state.meta.errors.length>0 || !!conflict} aria-describedby="phone-error"
            onChange={e=>{field.handleChange(e.target.value);setConflict('');}} onBlur={field.handleBlur}/></div>
          <span className="field-error" id="phone-error">{conflict || field.state.meta.errors.map(e=>e?.message).join(' ')}</span>
          <small>Escribe el número local, sin repetir el prefijo.</small>
        </label>}</form.Field>}</form.Subscribe>
        <div className="modal-actions contact-form-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button>
          <button className="button primary" disabled={save.isPending || restore.isPending}>{save.isPending?'Guardando…':contact?'Guardar cambios':'Crear contacto'}<Check size={17}/></button></div>
      </form>
    </Modal>
    {duplicate && <Modal title="Este contacto está en la papelera" description="Puedes recuperar el contacto existente. Sus datos originales se conservarán." onClose={()=>setDuplicate(null)}>
      <div className="duplicate-card"><strong>{duplicate.name}</strong><span>{duplicate.email}</span><span>{duplicate.phoneE164}</span></div>
      <div className="modal-actions"><button className="button secondary" onClick={()=>setDuplicate(null)}>Volver</button><button className="button primary" disabled={restore.isPending} onClick={()=>restore.mutate(duplicate.id)}>Restaurar contacto</button></div>
    </Modal>}
    {discard && <Modal title="¿Descartar los cambios?" description="Los cambios que no hayas guardado se perderán." onClose={()=>setDiscard(false)}>
      <div className="modal-actions"><button className="button secondary" onClick={()=>setDiscard(false)}>Seguir editando</button><button className="button danger" onClick={onClose}>Descartar</button></div>
    </Modal>}
  </>;
}

export function App({trash}:{trash:boolean}) {
  const {q,country} = useSearch({strict:false}) as {q:string;country:string};
  const navigate = useNavigate();
  const client = useQueryClient();
  const {theme,setTheme} = usePreferences();
  const session=useAuth(state=>state.session);
  const [editor,setEditor] = useState<Contact|'new'|null>(null);
  const [detail,setDetail] = useState<Contact|null>(null);
  const [deleting,setDeleting] = useState<Contact|null>(null);
  const [themeOpen,setThemeOpen] = useState(false);
  const contacts = useQuery({queryKey:['contacts'],queryFn:repository.list});
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  useEffect(()=>{const refresh=()=>void client.invalidateQueries({queryKey:['contacts']});window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[client]);
  const updateSearch = (next:{q?:string;country?:string})=>void navigate({to:trash?'/papelera':'/',search:{q,country,...next},replace:true});
  const mutation = useMutation({mutationFn:({id,restore}:{id:string;restore:boolean})=>restore?repository.restore(id):repository.remove(id),
    onSuccess:async(_,variables)=>{await client.invalidateQueries({queryKey:['contacts']});setDeleting(null);setDetail(null);
      toast.success(variables.restore?'Contacto restaurado':'Contacto movido a la papelera',variables.restore?undefined:{action:{label:'Deshacer',onClick:()=>mutation.mutate({id:variables.id,restore:true})}});},
    onError:()=>toast.error('No pudimos completar la acción. Inténtalo de nuevo.')});
  const all = contacts.data ?? [];
  const active = all.filter(c=>!c.deletedAt);
  const removed = all.filter(c=>c.deletedAt);
  const shown = filterContacts(all,trash,q ?? '',country ?? '');
  const selectedCountries = new Set((trash?removed:active).map(c=>c.country));
  return <div className="app">
    <aside className="sidebar">
      <Link to="/" search={{q:'',country:''}} className="brand"><span className="brand-mark">c<span>·</span></span>cerca<span className="brand-dot">.</span></Link>
      <div className="sidebar-label">TU LIBRETA PERSONAL</div>
      <nav aria-label="Navegación principal">
        <Link to="/" search={{q:'',country:''}} className={!trash?'nav-item selected':'nav-item'}><UsersRound size={20}/>Contactos<span className="nav-count">{active.length}</span></Link>
        <Link to="/papelera" search={{q:'',country:''}} className={trash?'nav-item selected':'nav-item'}><Trash2 size={19}/>Papelera<span className="nav-count">{removed.length}</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="theme-control"><button className="theme-button" onClick={()=>setThemeOpen(true)}><Palette size={19}/><span>Apariencia<small>{themes.find(([key])=>key===theme)?.[1]}</small></span><ChevronRight size={16}/></button></div>
        <button className="profile profile-button" onClick={()=>void logout()} title="Cerrar sesión"><div className="avatar mini">{session?.user.email.slice(0,2).toUpperCase()}</div><div>{session?.user.email}<small>Cerrar sesión</small></div><LogOut size={17}/></button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Mi espacio <ChevronRight size={14}/> <strong>{trash?'Papelera':'Contactos'}</strong></span><span className="local-label"><span/>Guardado en este dispositivo</span></header>
      <main>
        <div className="page-heading"><div><h1>{trash?'Tu papelera':'Tus personas, cerca.'}</h1><p>{trash?'Los contactos que eliminaste, listos para recuperar.':'Un lugar para todas las personas que forman parte de tu mundo.'}</p></div>
          {!trash && <button className="button primary" onClick={()=>setEditor('new')}><Plus size={19}/>Nuevo contacto</button>}
        </div>
        <div className="overview"><div className="overview-icon">{trash?<Trash2 size={26}/>:<BookOpen size={26}/>}</div>
          <div><strong>{trash?removed.length:active.length}</strong><span>{trash?'contactos en la papelera':'contactos en tu libreta'}</span></div><div className="overview-divider"/><Globe2 size={21}/><div><strong>{selectedCountries.size}</strong><span>{selectedCountries.size===1?'país':'países'}</span></div>
          <p>{trash?'Nada se pierde. Vuelve a conectar.':'Cada contacto, una conexión.'}<span>Tu mundo empieza con las personas.</span></p>
        </div>
        <section className="contact-section" aria-label={trash?'Contactos eliminados':'Lista de contactos'}>
          <div className="section-title"><h2>{trash?'Contactos eliminados':'Todos los contactos'}<span>{shown.length}</span></h2><span className="sort-label">Ordenados de la A a la Z</span></div>
          <div className="filters"><label className="search"><Search size={19}/><input aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo…" value={q??''} onChange={e=>updateSearch({q:e.target.value})}/>{q && <button aria-label="Limpiar búsqueda" onClick={()=>updateSearch({q:''})}><X size={16}/></button>}</label>
            <CountryPicker filter value={country??''} onChange={value=>updateSearch({country:value})}/>
          </div>
          {contacts.isPending?<div className="empty" role="status">Cargando tu libreta…</div>:contacts.isError?<div className="empty"><h3>No pudimos abrir tu libreta</h3><p>Comprueba que tu navegador permite guardar datos.</p><button className="button secondary" onClick={()=>void contacts.refetch()}>Reintentar</button></div>:shown.length===0?<div className="empty"><div className="empty-icon">{trash?<Trash2/>:<UsersRound/>}</div><h3>{q||country?'No encontramos coincidencias':trash?'Una papelera vacía, por ahora':'Tu próxima conexión empieza aquí'}</h3><p>{q||country?'Prueba otro nombre, correo o país.':trash?'Los contactos que elimines aparecerán aquí.':'Añade tu primer contacto y empieza a llenar tu libreta.'}</p>{q||country?<button className="button secondary" onClick={()=>updateSearch({q:'',country:''})}>Limpiar filtros</button>:!trash&&<button className="button primary" onClick={()=>setEditor('new')}><Plus size={17}/>Crear mi primer contacto</button>}</div>:
          <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo electrónico</th><th>Teléfono</th><th>País</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{shown.map((c,i)=><tr key={c.id}>
            <td><button className="name-cell" onClick={()=>setDetail(c)}><span className={'avatar tone-'+i%5}>{initials(c.name)}</span><span><strong>{c.name}</strong><small>{trash?'Eliminado el '+formatDate(c.deletedAt!):'Ver contacto'}{!trash&&<ArrowUpRight size={11}/>}</small></span></button></td>
            <td className="email-cell">{c.email}</td><td className="phone-cell">{parsePhoneNumberFromString(c.phoneE164)?.formatInternational()??c.phoneE164}</td><td><span className="country-badge">{flag(c.country)} {names.of(c.country)}</span></td>
            <td><div className="row-actions">{trash?<button className="icon-button" aria-label={'Restaurar a '+c.name} title="Restaurar" disabled={mutation.isPending} onClick={()=>mutation.mutate({id:c.id,restore:true})}><RotateCcw size={17}/></button>:<><button className="icon-button" aria-label={'Editar a '+c.name} title="Editar" onClick={()=>setEditor(c)}><Pencil size={16}/></button><button className="icon-button delete-button" aria-label={'Eliminar a '+c.name} title="Eliminar" onClick={()=>setDeleting(c)}><Trash2 size={16}/></button></>}</div></td>
          </tr>)}</tbody></table></div>}
          <div className="list-footer"><span>{shown.length} {shown.length===1?'contacto':'contactos'}{q||country?' encontrados':''}</span><span>{trash?'Recupera tus contactos cuando quieras.':'Hecho para mantenerte cerca.'}</span></div>
        </section>
        <footer className="page-footer"><span className="footer-brand">cerca.</span><span>Pequeña libreta. Grandes conexiones.</span><span>Tu espacio personal</span></footer>
      </main>
    </div>
    <Toaster position="bottom-right" richColors closeButton toastOptions={{className:'app-toast'}}/>
    {editor && <ContactForm contact={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={()=>setEditor(null)}/>}
    {detail && <Modal title={detail.name} description="Información del contacto" onClose={()=>setDetail(null)}>
      <div className="detail-avatar avatar">{initials(detail.name)}</div><dl className="details"><dt><Mail size={17}/>Correo electrónico</dt><dd><a href={'mailto:'+detail.email}>{detail.email}</a></dd><dt><Phone size={17}/>Teléfono</dt><dd><a href={'tel:'+detail.phoneE164}>{parsePhoneNumberFromString(detail.phoneE164)?.formatInternational()}</a></dd><dt><Globe2 size={17}/>País</dt><dd>{flag(detail.country)} {names.of(detail.country)}</dd><dt>Creado el</dt><dd>{formatDate(detail.createdAt)}</dd>{detail.deletedAt&&<><dt>Eliminado el</dt><dd>{formatDate(detail.deletedAt)}</dd></>}</dl>
      <div className="modal-actions">{detail.deletedAt?<button className="button primary" disabled={mutation.isPending} onClick={()=>mutation.mutate({id:detail.id,restore:true})}>Restaurar contacto</button>:<><button className="button secondary" onClick={()=>{setDeleting(detail);setDetail(null);}}>Eliminar</button><button className="button primary" onClick={()=>{setEditor(detail);setDetail(null);}}>Editar contacto</button></>}</div>
    </Modal>}
    {deleting && <Modal title="¿Mover a la papelera?" description={'El contacto de '+deleting.name+' se guardará en la papelera. Podrás restaurarlo cuando quieras.'} onClose={()=>{if(!mutation.isPending)setDeleting(null);}}>
      <div className="modal-actions"><button className="button secondary" disabled={mutation.isPending} onClick={()=>setDeleting(null)}>Cancelar</button><button className="button danger" disabled={mutation.isPending} onClick={()=>mutation.mutate({id:deleting.id,restore:false})}>{mutation.isPending?'Moviendo…':'Mover a la papelera'}</button></div>
    </Modal>}
    {themeOpen && <Modal title="A tu manera" description="Elige el ambiente de tu libreta." onClose={()=>setThemeOpen(false)} wide>
      <div className="theme-grid">{themes.map(([key,label])=><button key={key} className={'theme-option '+(theme===key?'active':'')} onClick={()=>{setTheme(key);toast.success('Tema '+label+' aplicado');}} aria-pressed={theme===key}><div className={'theme-preview preview-'+key}><span/><div><i/><i/><i/></div></div><span>{label}{theme===key&&<Check size={16}/>}</span></button>)}</div>
    </Modal>}
  </div>;
}
