import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches } from 'class-validator';

/**
 * Data Transfer Object for institutional user account registration.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'budi.santoso@institution.ac.id',
    description: 'Email resmi pengguna',
  })
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email wajib diisi' })
  email!: string;

  @ApiProperty({
    example: 'Rahasia123!',
    description: 'Password minimal 8 karakter, kombinasi huruf & angka',
  })
  @IsString({ message: 'Password harus berupa string' })
  @MinLength(8, { message: 'Password minimal terdiri dari 8 karakter' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).*$/, {
    message: 'Password harus mengandung setidaknya satu huruf dan satu angka',
  })
  password!: string;

  @ApiProperty({
    example: 'Budi Santoso',
    description: 'Nama lengkap pengguna',
  })
  @IsString({ message: 'Nama lengkap harus berupa teks' })
  @IsNotEmpty({ message: 'Nama lengkap wajib diisi' })
  fullName!: string;

  @ApiProperty({
    example: '081234567890',
    required: false,
    description: 'Nomor telepon pengguna',
  })
  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa teks' })
  phoneNumber?: string;

  @ApiProperty({
    example: 'Teknologi Informasi',
    required: false,
    description: 'Departemen atau unit kerja pengguna',
  })
  @IsOptional()
  @IsString({ message: 'Departemen harus berupa teks' })
  department?: string;
}
