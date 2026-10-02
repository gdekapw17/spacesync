import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Data Transfer Object for validating route parameters on maintenance operations.
 */
export class MaintenanceParamDto {
  @ApiProperty({
    description: 'ID Ruangan (UUID v4)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', { message: 'ID ruangan harus berupa UUID v4 yang valid' })
  id!: string;

  @ApiProperty({
    description: 'ID Blok Pemeliharaan (UUID v4)',
    example: 'b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d',
  })
  @IsUUID('4', {
    message: 'ID blok pemeliharaan harus berupa UUID v4 yang valid',
  })
  maintenanceId!: string;
}
