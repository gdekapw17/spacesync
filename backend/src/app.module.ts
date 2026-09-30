import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Root Application Module for SpaceSync.
 * Orchestrates configuration loading, persistence infrastructure, and feature domains.
 */
@Module({
  imports: [
    // Global environment configuration loader
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Global database persistence layer
    PrismaModule,
    // Health and observability probes
    HealthModule,
  ],
})
export class AppModule {}
