import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

/**
 * Encapsulated NestJS module managing rooms inventory and availability context.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
