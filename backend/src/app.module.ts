import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { BookingsModule } from './modules/bookings/bookings.module';

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

    // In-memory decoupled domain event pipeline
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // Global database persistence layer
    PrismaModule,

    // Core feature modules
    AuthModule,
    UsersModule,
    RoomsModule,
    MaintenanceModule,
    BookingsModule,
    HealthModule,
  ],
})
export class AppModule {}
