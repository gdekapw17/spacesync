import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

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
    // Global event emitter subsystem
    EventEmitterModule.forRoot(),
    // Global database persistence layer
    PrismaModule,
    // Health and observability probes
    HealthModule,
    // Authentication & Authorization Modules
    AuthModule,
    // User Management Modules
    UsersModule,
    // Room & Schedule Modules
    RoomsModule,
    // Maintenance Module
    MaintenanceModule,
  ],
})
export class AppModule {}
