import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Route parameter DTO enforcing UUID v4 identification for booking entities.
 */
export class BookingParamDto {
  @ApiProperty({ description: 'ID Reservasi (UUID v4)' })
  @IsUUID('4', { message: 'ID reservasi harus berupa UUID v4 yang valid' })
  id!: string;
}
