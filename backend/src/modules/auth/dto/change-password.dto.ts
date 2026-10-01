import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Data Transfer Object for authenticated password rotation.
 */
export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword123!',
    description: 'Kata sandi lama yang saat ini aktif',
  })
  @IsNotEmpty({ message: 'Kata sandi lama wajib diisi' })
  @IsString({ message: 'Kata sandi lama harus berupa string' })
  oldPassword!: string;

  @ApiProperty({
    example: 'NewSecurePassword456!',
    description: 'Kata sandi baru (minimal 8 karakter)',
  })
  @IsNotEmpty({ message: 'Kata sandi baru wajib diisi' })
  @IsString({ message: 'Kata sandi baru harus berupa string' })
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter' })
  newPassword!: string;
}
