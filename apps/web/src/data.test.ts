import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { repository, DuplicateContactError, filterContacts } from './data';
import { contactInputSchema, normalizeContact } from '@contactos/contracts';

const ana = {name:'Ána Martínez',email:'ana@example.com',country:'PA',phone:'6123-4567'};
describe('Reglas de la libreta',()=>{
  it('normaliza variantes de un teléfono y valida el país',()=>{
    expect(normalizeContact(ana).phoneE164).toBe('+50761234567');
    expect(normalizeContact({...ana,phone:'+507 6123 4567'}).phoneE164).toBe('+50761234567');
    expect(contactInputSchema.safeParse({...ana,country:'ES'}).success).toBe(false);
    expect(contactInputSchema.safeParse({...ana,phone:'123'}).success).toBe(false);
  });
  it('conserva el contacto al borrar y restaurar; bloquea duplicados en papelera',async()=>{
    const c=await repository.save(ana);
    await expect(repository.save({...ana,name:'Otra persona'})).rejects.toBeInstanceOf(DuplicateContactError);
    await repository.remove(c.id);
    await expect(repository.save(ana)).rejects.toMatchObject({contact:{id:c.id,deletedAt:expect.any(String)}});
    await repository.restore(c.id);
    const restored=(await repository.list()).find(x=>x.id===c.id)!;
    expect(restored.deletedAt).toBeNull();
    expect(restored.createdAt).toBe(c.createdAt);
    expect((await repository.save({...ana,name:'Ana actualizada'},c.id)).id).toBe(c.id);
  });
  it('aplica búsqueda y país juntos, con separación de papelera',async()=>{
    const list=await repository.list();
    expect(filterContacts(list,false,'ANA','PA')).toHaveLength(1);
    expect(filterContacts(list,false,'example.com','ES')).toHaveLength(0);
    expect(filterContacts(list,true,'','PA')).toHaveLength(0);
    expect(filterContacts([{...list[0],name:'Ána'}],false,'ana','PA')).toHaveLength(1);
  });
  it('serializa creaciones concurrentes con el mismo teléfono',async()=>{
    const results=await Promise.allSettled([
      repository.save({...ana,phone:'6234-5678'}),
      repository.save({...ana,phone:'6234-5678'}),
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  });
  it('rechaza una edición que colisiona con un teléfono eliminado',async()=>{
    const original = (await repository.list()).find(c=>c.phoneE164==='+50761234567')!;
    const other = (await repository.list()).find(c=>c.phoneE164==='+50762345678')!;
    await repository.remove(other.id);
    await expect(repository.save({...ana,phone:'6234-5678'},original.id))
      .rejects.toMatchObject({contact:{id:other.id}});
    expect((await repository.list()).find(c=>c.id===original.id)?.phoneE164).toBe('+50761234567');
  });
});
