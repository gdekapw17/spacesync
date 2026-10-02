import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Query parameters DTO for filtering and paginating room reservations.
 */
export class QueryBookingsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page harus berupa integer' })
  @Min(1, { message: 'Page minimal bernilai 1' })
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit harus berupa integer' })
  @Min(1, { message: 'Limit minimal bernilai 1' })
  limit: number = 10;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'Filter status reservasi',
  })
  @IsOptional()
  @IsEnum(BookingStatus, { message: 'Status booking tidak valid' })
  status?: BookingStatus;

  @ApiPropertyOptional({
    example: 'a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0',
    description: 'Filter spesifik ID ruangan (UUID v4)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'roomId harus berupa format UUID v4 yang valid' })
  roomId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Rentang awal tanggal pencarian (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Format startDate harus YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Rentang akhir tanggal pencarian (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Format endDate harus YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional({
    example: 'e2a9b340-9a2c-4734-9271-4fb24e883832',
    description: 'Filter pengguna tertentu (Khusus SUPER_ADMIN)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId harus berupa format UUID v4 yang valid' })
  userId?: string;
}
