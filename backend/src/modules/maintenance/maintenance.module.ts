import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * Encapsulated NestJS module managing room maintenance operations and schedule lockouts.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
