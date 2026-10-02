import { Module } from '@nestjs/common';
import { PrismaModule } from '@/database/prisma.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './services/bookings.service';
import { ConflictEngineService } from './services/conflict-engine.service';

/**
 * Encapsulated feature module orchestrating room reservations,
 * mathematical zero-overlap conflict detection, approval workflows, and cancellations.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BookingsController],
  providers: [BookingsService, ConflictEngineService],
  exports: [BookingsService, ConflictEngineService],
})
export class BookingsModule {}
