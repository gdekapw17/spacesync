import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Data Transfer Object for creating a new room maintenance schedule block.
 */
export class CreateMaintenanceBlockDto {
  @ApiProperty({
    example: 'Servis AC dan Penggantian Filter',
    description: 'Judul kegiatan pemeliharaan ruangan',
  })
  @IsString({ message: 'Judul pemeliharaan harus berupa teks string' })
  @IsNotEmpty({ message: 'Judul pemeliharaan wajib diisi' })
  @MaxLength(100, { message: 'Judul pemeliharaan maksimal 100 karakter' })
  title!: string;

  @ApiProperty({
    example: 'Pemeliharaan berkala unit pendingin udara ruangan',
    description: 'Alasan atau rincian pemeliharaan ruangan',
  })
  @IsString({ message: 'Alasan pemeliharaan harus berupa teks string' })
  @IsNotEmpty({ message: 'Alasan pemeliharaan wajib diisi' })
  @MaxLength(255, { message: 'Alasan pemeliharaan maksimal 255 karakter' })
  reason!: string;

  @ApiProperty({
    example: '2026-10-15T08:00:00.000Z',
    description: 'Waktu mulai pemeliharaan (ISO-8601 UTC)',
  })
  @IsISO8601({ strict: true }, { message: 'startTime harus berformat ISO-8601 UTC yang valid' })
  @IsNotEmpty({ message: 'startTime wajib diisi' })
  startTime!: string;

  @ApiProperty({
    example: '2026-10-15T12:00:00.000Z',
    description: 'Waktu selesai pemeliharaan (ISO-8601 UTC)',
  })
  @IsISO8601({ strict: true }, { message: 'endTime harus berformat ISO-8601 UTC yang valid' })
  @IsNotEmpty({ message: 'endTime wajib diisi' })
  endTime!: string;

  @ApiPropertyOptional({
    example: '2026-10-15T12:00:00.000Z',
    description:
      'Waktu selesai operasional (sterilisasi buffer) pemeliharaan (ISO-8601 UTC, default sama dengan endTime)',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'operationalEndTime harus berformat ISO-8601 UTC yang valid' },
  )
  operationalEndTime?: string;
}
