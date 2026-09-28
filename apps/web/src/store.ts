import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { themes, type Theme } from '@contactos/contracts';
export const usePreferences = create(persist<{theme:Theme;setTheme:(theme:Theme)=>void}>(
  set => ({theme:'light',setTheme:theme=>set({theme})}),
  {name:'cerca-preferences',merge:(saved,current)=>{
    const value = saved as {theme?:string}|undefined;
    return {...current,theme:themes.some(([key])=>key===value?.theme) ? value!.theme as Theme : 'light'};
  }}
));
