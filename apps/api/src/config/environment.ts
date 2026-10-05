import { z } from 'zod';
const boolean = z.preprocess(
  value => typeof value === 'boolean' ? String(value) : value,
  z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
);
export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGIN: z.string().url().refine(v => { const u = new URL(v); return ['http:','https:'].includes(u.protocol) && u.origin === v; }, 'Expected an exact HTTP origin'),
  CORS_ALLOW_ANY_ORIGIN: boolean,
  DB_HOST: z.string().min(1), DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1), DB_USER: z.string().min(1), DB_PASSWORD: z.string().min(1),
  DB_SSL: boolean, DB_SSL_CA_PATH: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32), JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.literal('15m').default('15m'),
  JWT_REFRESH_TTL: z.literal('7d').default('7d'),
}).superRefine((v, ctx) => { if(v.JWT_ACCESS_SECRET === v.JWT_REFRESH_SECRET) ctx.addIssue({code:'custom',path:['JWT_REFRESH_SECRET'],message:'Use independent signing secrets'}); });
export type Environment = z.infer<typeof environmentSchema>;
export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return result.data;
}
