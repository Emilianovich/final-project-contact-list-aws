import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { getCountryCallingCode } from 'libphonenumber-js/max';
import { countryCodes } from '@contactos/contracts';
import { fold } from './data';

const names = new Intl.DisplayNames(['es'],{type:'region'});
const countries = countryCodes.map(code=>({code,name:names.of(code) ?? code})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
const flag = (code:string)=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));

export function CountryPicker({value,onChange,onBlur=()=>{},filter=false}:{value:string;onChange:(value:string)=>void;onBlur?:()=>void;filter?:boolean}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [active,setActive] = useState(0);
  const selected = countries.find(c=>c.code===value)!;
  const options = [...(filter?[{code:'',name:'Todos los países'}]:[]),...countries];
  const matches = options.filter(c=>fold(c.name).includes(fold(query.trim()))
    || c.code.toLowerCase().includes(query.trim().toLowerCase())
    || (!!c.code && ('+'+getCountryCallingCode(c.code as typeof countryCodes[number])).includes(query.trim())));
  useEffect(()=>{list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'});},[active,open]);
  const choose = (code:string)=>{onChange(code);setOpen(false);setQuery('');input.current?.focus();};
  return <div className={filter?"country-filter-picker":"field"}><label className={filter?"sr-only":undefined} htmlFor={id}>{filter?"Filtrar por país":"País"}</label>
    <div className="country-picker" onBlur={e=>{
      if(!e.currentTarget.contains(e.relatedTarget as Node|null)){setOpen(false);setQuery('');onBlur();}
    }}>
      <div className="country-combobox">
        <input ref={input} id={id} role="combobox" autoComplete="off"
          aria-expanded={open} aria-controls={open?id+'-list':undefined} aria-autocomplete="list"
          aria-activedescendant={open && matches[active]?id+'-'+matches[active].code:undefined}
          value={open?query:(selected?flag(selected.code)+' '+selected.name+(filter?'':' (+'+getCountryCallingCode(selected.code)+')'):'Todos los países')}
          placeholder="Escribe un país o prefijo…"
          onFocus={e=>e.currentTarget.select()}
          onClick={()=>{if(!open){setQuery('');setActive(0);setOpen(true);}}}
          onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true);}}
          onKeyDown={e=>{
            if(!open && e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
              e.preventDefault();setQuery(e.key);setActive(0);setOpen(true);
            } else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
              e.preventDefault();
              if(!open){setQuery('');setActive(0);setOpen(true);}
              else setActive(i=>Math.max(0,Math.min(matches.length-1,i+(e.key==='ArrowDown'?1:-1))));
            } else if(e.key==='Enter'&&open){e.preventDefault();if(matches[active])choose(matches[active].code);}
            else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);setQuery('');}
          }}/>
        <button type="button" tabIndex={-1} aria-label={open?'Cerrar países':'Mostrar países'}
          onMouseDown={e=>e.preventDefault()} onClick={()=>{setOpen(!open);setQuery('');setActive(0);input.current?.focus();}}>
          <ChevronDown size={18}/>
        </button>
      </div>
      {open && <div ref={list} id={id+'-list'} role="listbox" aria-label="Países" className="country-options">
        {matches.length?matches.map((c,index)=><div key={c.code} id={id+'-'+c.code} role="option"
          aria-selected={c.code===value} data-active={active===index} className="country-option"
          onMouseDown={e=>e.preventDefault()} onClick={()=>choose(c.code)}>
          <span>{c.code?flag(c.code):'🌐'} {c.name}{!filter&&c.code?' (+'+getCountryCallingCode(c.code as typeof countryCodes[number])+')':''}</span>{c.code===value&&<Check size={16}/>}
        </div>):<div className="country-no-results" role="status">No encontramos ese país.</div>}
      </div>}
    </div>
  </div>;
}
