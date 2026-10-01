import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';

/**
 * Data Transfer Object for paginated and filtered user queries (Super Admin only).
 */
export class QueryUsersDto {
  @ApiProperty({ required: false, default: 1, description: 'Nomor halaman' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Halaman harus berupa integer' })
  @Min(1, { message: 'Halaman minimal bernilai 1' })
  page?: number = 1;

  @ApiProperty({ required: false, default: 10, description: 'Jumlah item per halaman' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit harus berupa integer' })
  @Min(1, { message: 'Limit minimal bernilai 1' })
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Pencarian nama atau email pengguna' })
  @IsOptional()
  @IsString({ message: 'Parameter pencarian harus berupa string' })
  search?: string;

  @ApiProperty({ enum: Role, required: false, description: 'Filter berdasarkan peran pengguna' })
  @IsOptional()
  @IsEnum(Role, { message: 'Nilai filter role tidak valid' })
  role?: Role;
}
