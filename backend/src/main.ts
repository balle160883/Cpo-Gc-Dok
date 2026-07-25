import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const rawCorsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = rawCorsOrigin
    ? rawCorsOrigin.split(',').map((o) => o.trim())
    : null;

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir solicitudes sin origen (como aplicaciones móviles, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      // Si CORS_ORIGIN está configurado explícitamente y no incluye '*'
      if (allowedOrigins && !allowedOrigins.includes('*')) {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      }

      // Si CORS_ORIGIN no se configuró o incluye '*', permitir dinámicamente cualquier origen
      return callback(null, true);
    },
    credentials: true,
  });

  await app.listen(process.env.PORT || 4000);
}
bootstrap();

