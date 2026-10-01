import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';

/**
 * Data Transfer Object for user role mutation (Super Admin only).
 */
export class UpdateUserRoleDto {
  @ApiProperty({
    enum: Role,
    example: Role.ROOM_MANAGER,
    description: 'Peran hak akses baru yang diberikan kepada pengguna',
  })
  @IsNotEmpty({ message: 'Role tidak boleh kosong' })
  @IsEnum(Role, { message: 'Nilai role tidak valid' })
  role!: Role;
}
