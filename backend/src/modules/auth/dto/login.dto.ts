import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Data Transfer Object for user authentication credentials.
 */
export class LoginDto {
  @ApiProperty({
    example: 'budi.santoso@institution.ac.id',
    description: 'Alamat email pengguna yang terdaftar',
  })
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email!: string;

  @ApiProperty({
    example: 'Rahasia123!',
    description: 'Kata sandi akun',
  })
  @IsString({ message: 'Password harus berupa string' })
  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;
}
