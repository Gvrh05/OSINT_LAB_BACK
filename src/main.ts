import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo general de la API
  app.setGlobalPrefix('api');

  // Permitir conexión desde el frontend React/Vite
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;

  await app.listen(port);

  console.log(`OSINT API ejecutándose en http://localhost:${port}/api`);
}

bootstrap();
