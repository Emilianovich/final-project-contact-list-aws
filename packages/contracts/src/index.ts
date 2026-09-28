import { z } from 'zod';
import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export const countryCodes = getCountries();
export const contactInputSchema = z.object({
  name: z.string().trim().min(2, 'Escribe al menos 2 caracteres.').max(100, 'Máximo 100 caracteres.'),
  email: z.string().trim().pipe(z.email('Escribe un correo válido.').max(254)),
  country: z.string().refine(v => countryCodes.includes(v as CountryCode), 'Selecciona un país.'),
  phone: z.string().min(1, 'Escribe un teléfono.'),
}).superRefine((value, ctx) => {
  const number = parsePhoneNumberFromString(value.phone, value.country as CountryCode);
  if (!number?.isValid() || number.country !== value.country) {
    ctx.addIssue({code:'custom', path:['phone'], message:'El número no es válido para el país seleccionado.'});
  }
});
export type ContactInput = z.infer<typeof contactInputSchema>;
export interface Contact {
  id: string; userId: string; name: string; email: string;
  country: CountryCode; phoneE164: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
export function normalizeContact(input: ContactInput) {
  const value = contactInputSchema.parse(input);
  return { name: value.name, email: value.email.trim(), country: value.country as CountryCode,
    phoneE164: parsePhoneNumberFromString(value.phone, value.country as CountryCode)!.number as string };
}
export const themes = [
  ['light','Claro'],['dark','Oscuro'],['contrast','Alto contraste'],['sepia','Sepia / cálido'],
  ['vibrant','Marca vibrante'],['pastel','Pastel / suave'],['brutalist','Brutalista'],['terminal','Terminal / retro'],
] as const;
export type Theme = typeof themes[number][0];
