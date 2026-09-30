import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform.interceptor';
import { StrictValidationPipe } from './common/pipes/validation.pipe';

/**
 * Enterprise bootstrap sequence for SpaceSync Backend Engine.
 * Configures CORS, global API versioning prefix, pipeline interceptors/filters,
 * OpenAPI documentation specifications, and graceful termination hooks.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('SpaceSyncBootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);

  // 1. Enable Graceful Shutdown hooks for database connection draining
  app.enableShutdownHooks();

  // 2. Configure standardized CORS policy
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        configService.get<string>('CLIENT_URL', 'http://localhost:3000'),
        'http://localhost:3000',
        'http://localhost:4000',
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS policy.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  });

  // 3. Set global API route prefix
  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

  // 4. Register global execution pipeline (Pipes, Interceptors, Filters)
  app.useGlobalPipes(new StrictValidationPipe());
  app.useGlobalInterceptors(new TransformResponseInterceptor(reflector));
  app.useGlobalFilters(new HttpExceptionFilter());

  // 5. Configure Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SpaceSync API')
    .setDescription(
      'RESTful API Contract & Interface Specification for SpaceSync — Shared Room & Facility Reservation Management System.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your Bearer Access Token in the format: Bearer <token>',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Health & Monitoring', 'Liveness and readiness probes for infrastructure monitoring')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // Expose Swagger UI on /api/docs and raw JSON spec on /api/docs-json
  SwaggerModule.setup('/api/docs', app, swaggerDocument, {
    jsonDocumentUrl: '/api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'SpaceSync API Documentation',
  });

  // 6. Start HTTP Server listener
  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);

  logger.log(`========================================================`);
  logger.log(`🚀 SpaceSync Backend Engine successfully initialized!`);
  logger.log(`📡 Application Base URL : http://localhost:${port}/${globalPrefix}`);
  logger.log(`📚 Swagger UI Docs     : http://localhost:${port}/api/docs`);
  logger.log(`📄 OpenAPI JSON Spec    : http://localhost:${port}/api/docs-json`);
  logger.log(`🩺 Health Probe Endpoint: http://localhost:${port}/${globalPrefix}/health`);
  logger.log(`========================================================`);
}

void bootstrap();
