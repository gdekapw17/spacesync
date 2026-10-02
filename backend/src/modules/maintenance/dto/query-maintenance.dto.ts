import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Data Transfer Object for querying maintenance blocks with pagination and timeline filtering.
 */
export class QueryMaintenanceDto {
  @ApiPropertyOptional({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page harus berupa integer' })
  @Min(1, { message: 'Page minimal bernilai 1' })
  page?: number = 1;

  @ApiPropertyOptional({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit harus berupa integer' })
  @Min(1, { message: 'Limit minimal bernilai 1' })
  limit?: number = 10;

  @ApiPropertyOptional({
    required: false,
    default: true,
    description:
      'Hanya ambil jadwal pemeliharaan mendatang (operationalEndTime >= NOW())',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'upcomingOnly harus berupa nilai boolean' })
  upcomingOnly?: boolean = true;
}