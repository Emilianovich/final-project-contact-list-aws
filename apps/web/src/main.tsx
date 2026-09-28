import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { z } from 'zod';
import { App } from './App';
import '@fontsource/arima/latin-400.css';
import '@fontsource/arima/latin-500.css';
import '@fontsource/arima/latin-600.css';
import '@fontsource/arima/latin-700.css';
import './styles.css';

const searchSchema = z.object({q:z.string().catch(''),country:z.string().catch('')});
const root = createRootRoute({component:()=> <Outlet/>});
const contacts = createRoute({getParentRoute:()=>root,path:'/',validateSearch:searchSchema,component:()=> <App trash={false}/>});
const trash = createRoute({getParentRoute:()=>root,path:'/papelera',validateSearch:searchSchema,component:()=> <App trash/>});
const router = createRouter({routeTree:root.addChildren([contacts,trash]),defaultNotFoundComponent:()=> <main><h1>Página no encontrada</h1><a href="/">Volver a contactos</a></main>});
declare module '@tanstack/react-router' {interface Register {router:typeof router}}
const client = new QueryClient({defaultOptions:{queries:{staleTime:1000,retry:1}}});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></React.StrictMode>
);
