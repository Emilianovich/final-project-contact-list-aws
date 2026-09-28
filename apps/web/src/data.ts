import { openDB, type DBSchema } from 'idb';
import { Temporal } from '@js-temporal/polyfill';
import { normalizeContact, type Contact, type ContactInput } from '@contactos/contracts';

interface ContactDB extends DBSchema {
  contacts: { key: string; value: Contact; indexes: { 'owner-phone': [string,string] } };
}
const userId = 'local-demo';
export const now = () => Temporal.Now.instant().toString();
const db = () => openDB<ContactDB>('cerca-contacts', 1, { upgrade(db) {
  const store = db.createObjectStore('contacts', { keyPath: 'id' });
  store.createIndex('owner-phone', ['userId','phoneE164'], {unique:true});
}});
export class DuplicateContactError extends Error {
  constructor(public contact: Contact) { super(contact.deletedAt ? 'Este teléfono está en la papelera.' : 'Ya tienes un contacto con este teléfono.'); }
}
export interface ContactRepository {
  list(): Promise<Contact[]>;
  save(input: ContactInput, id?: string): Promise<Contact>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
export const repository: ContactRepository = {
  async list() { return (await (await db()).getAll('contacts')).filter(c => c.userId === userId); },
  async save(input, id) {
    const data = normalizeContact(input);
    const database = await db();
    const tx = database.transaction('contacts','readwrite');
    const duplicate = await tx.store.index('owner-phone').get([userId,data.phoneE164]);
    if (duplicate && duplicate.id !== id) {
      await tx.done;
      throw new DuplicateContactError(duplicate);
    }
    const existing = id ? await tx.store.get(id) : undefined;
    if (id && (!existing || existing.userId !== userId || existing.deletedAt)) {
      await tx.done; throw new Error('El contacto ya no está disponible.');
    }
    const stamp = now();
    const contact: Contact = { ...data, id: id ?? crypto.randomUUID(), userId,
      createdAt: existing?.createdAt ?? stamp, updatedAt: stamp, deletedAt: null };
    await tx.store.put(contact); await tx.done;
    return contact;
  },
  async remove(id) { await setDeleted(id, now()); },
  async restore(id) { await setDeleted(id, null); },
};
async function setDeleted(id: string, deletedAt: string | null) {
  const database = await db();
  const tx = database.transaction('contacts','readwrite');
  const contact = await tx.store.get(id);
  if (!contact || contact.userId !== userId) { await tx.done; throw new Error('No se encontró el contacto.'); }
  await tx.store.put({...contact, deletedAt, updatedAt:now()}); await tx.done;
}
export const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterContacts(contacts: Contact[], deleted: boolean, search: string, country: string) {
  const query = fold(search.trim());
  return contacts.filter(c => Boolean(c.deletedAt) === deleted
    && (!country || c.country === country)
    && (!query || fold(c.name).includes(query) || fold(c.email).includes(query)))
    .sort((a,b) => a.name.localeCompare(b.name,'es'));
}
export function formatDate(value: string) {
  return Temporal.Instant.from(value).toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString('es', {day:'numeric',month:'long',year:'numeric'});
}
