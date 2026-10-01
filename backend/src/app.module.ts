import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

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
    // Authentication, Authorization & User Management Modules
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
