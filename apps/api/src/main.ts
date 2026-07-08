import 'reflect-metadata';
// Telemetrie zuerst initialisieren (vor allen instrumentierten Modulen).
import './telemetry';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // Standard-Body-Parser deaktivieren und JSON mit hoeherem Limit registrieren:
  // Foto-Uploads (Base64, Bild bis 2 MiB) sprengen das Express-Default von
  // 100 kB; 4 MB deckt den Base64-Overhead ab. Die API ist reines JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '4mb' });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ZodExceptionFilter());
  // CORS für Web-/Mobile-Frontends. Explizite Ursprünge in Produktion (env);
  // ohne Konfiguration wird der anfragende Ursprung reflektiert (nur lokal).
  app.enableCors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('ZeitVault API')
    .setDescription('Enterprise-Zeiterfassung - externe REST-API (OpenAPI). Intern: tRPC.')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT);
}

void bootstrap();
