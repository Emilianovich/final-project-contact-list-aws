import { pgTable, uuid, text, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
  id:uuid('id').defaultRandom().primaryKey(), email:text('email').notNull(), passwordHash:text('password_hash').notNull(),
  theme:text('theme').notNull().default('light'), createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(), updatedAt:timestamp('updated_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
}, t=>[uniqueIndex('users_email_unique').on(t.email)]);
export const countries=pgTable('countries',{code:varchar('code',{length:2}).primaryKey(),name:text('name').notNull(),callingCode:varchar('calling_code',{length:4}).notNull()});
export const contacts=pgTable('contacts',{
  id:uuid('id').defaultRandom().primaryKey(),userId:uuid('user_id').notNull().references(()=>users.id), name:text('name').notNull(),email:text('email').notNull(),country:varchar('country_code',{length:2}).notNull().references(()=>countries.code),phoneE164:varchar('phone_e164',{length:16}).notNull(),
  createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),deletedAt:timestamp('deleted_at',{withTimezone:true,mode:'string'}),
},t=>[uniqueIndex('contacts_user_phone_unique').on(t.userId,t.phoneE164),index('contacts_user_country_status_idx').on(t.userId,t.country,t.deletedAt)]);
export const authSessions=pgTable('auth_sessions',{
  id:uuid('id').primaryKey(),userId:uuid('user_id').notNull().references(()=>users.id), refreshHash:text('refresh_hash').notNull(), expiresAt:timestamp('expires_at',{withTimezone:true,mode:'string'}).notNull(), revokedAt:timestamp('revoked_at',{withTimezone:true,mode:'string'}),createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
},t=>[index('auth_sessions_user_idx').on(t.userId)]);
