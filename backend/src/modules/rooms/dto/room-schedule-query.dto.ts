import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Data Transfer Object for retrieving room occupancy schedule on a specific date.
 */
export class RoomScheduleQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-15',
    description:
      'Tanggal spesifik untuk mengambil daftar slot terisi (default: tanggal hari ini UTC)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal harus YYYY-MM-DD' })
  date?: string;
}
