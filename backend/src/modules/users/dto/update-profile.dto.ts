import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Data Transfer Object for self profile update.
 */
export class UpdateProfileDto {
  @ApiProperty({
    example: 'Budi Santoso, M.Kom.',
    required: false,
    description: 'Nama lengkap pengguna yang diperbarui',
  })
  @IsOptional()
  @IsString({ message: 'Nama lengkap harus berupa string' })
  fullName?: string;

  @ApiProperty({
    example: '081298765432',
    required: false,
    description: 'Nomor kontak telepon pengguna',
  })
  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa string' })
  phoneNumber?: string;

  @ApiProperty({
    example: 'Pusat Data & Sistem Informasi',
    required: false,
    description: 'Nama departemen atau unit kerja pengguna',
  })
  @IsOptional()
  @IsString({ message: 'Departemen harus berupa string' })
  department?: string;
}
