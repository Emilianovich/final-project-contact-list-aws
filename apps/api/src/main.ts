import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
const app=await createApp();await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'),'0.0.0.0');
