import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { RoomStatus } from '@prisma/client';

/**
 * Data Transfer Object for filtering and paginating rooms catalog queries.
 */
export class QueryRoomsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page harus berupa integer' })
  @Min(1, { message: 'Page minimal bernilai 1' })
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit harus berupa integer' })
  @Min(1, { message: 'Limit minimal bernilai 1' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Pencarian nama ruangan, kode, atau gedung/lantai',
  })
  @IsOptional()
  @IsString({ message: 'Search query harus berupa teks' })
  search?: string;

  @ApiPropertyOptional({
    example: 20,
    description: 'Filter kapasitas minimum peserta',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kapasitas harus berupa integer' })
  @Min(1, { message: 'Kapasitas minimal bernilai 1' })
  minCapacity?: number;

  @ApiPropertyOptional({
    enum: RoomStatus,
    description: 'Status ruangan (default: AVAILABLE jika tidak diset)',
  })
  @IsOptional()
  @IsEnum(RoomStatus, { message: 'Status ruangan tidak valid' })
  status?: RoomStatus;

  @ApiPropertyOptional({
    example: '2026-10-15',
    description: 'Filter ketersediaan berdasarkan tanggal (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal harus YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-10-15T09:00:00.000Z',
    description: 'Awal rentang waktu yang ingin diperiksa (Wajib UTC ISO-8601 jika endTime diisi)',
  })
  @ValidateIf((o: QueryRoomsDto) => o.endTime !== undefined)
  @IsISO8601({}, { message: 'startTime harus berupa format ISO-8601 UTC penuh' })
  startTime?: string;

  @ApiPropertyOptional({
    example: '2026-10-15T11:00:00.000Z',
    description:
      'Akhir rentang waktu yang ingin diperiksa (Wajib UTC ISO-8601 jika startTime diisi)',
  })
  @ValidateIf((o: QueryRoomsDto) => o.startTime !== undefined)
  @IsISO8601({}, { message: 'endTime harus berupa format ISO-8601 UTC penuh' })
  endTime?: string;
}
