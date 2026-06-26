import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
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
