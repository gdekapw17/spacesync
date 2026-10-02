import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * Query parameters DTO for retrieving aggregated timeline calendar intervals.
 */
export class QueryTimelineDto {
  @ApiProperty({
    description: 'Batas awal rentang waktu penarikan timeline (ISO-8601 UTC)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'startDate wajib disertakan' })
  @IsISO8601({ strict: true }, { message: 'startDate harus berformat ISO-8601 UTC yang valid' })
  startDate!: string;

  @ApiProperty({
    description: 'Batas akhir rentang waktu penarikan timeline (ISO-8601 UTC)',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsNotEmpty({ message: 'endDate wajib disertakan' })
  @IsISO8601({ strict: true }, { message: 'endDate harus berformat ISO-8601 UTC yang valid' })
  endDate!: string;

  @ApiPropertyOptional({
    description:
      'Filter spesifik ID ruangan (opsional, jika kosong mengambil seluruh ruangan aktif)',
    example: 'a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0',
  })
  @IsOptional()
  @IsUUID('4', { message: 'roomId harus berupa UUID v4 yang valid' })
  roomId?: string;
}
