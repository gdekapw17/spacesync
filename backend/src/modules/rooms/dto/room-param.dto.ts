import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Data Transfer Object for validating room identifier route parameter.
 */
export class RoomParamDto {
  @ApiProperty({
    description: 'ID Ruangan berbentuk UUID v4',
    example: 'a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0',
  })
  @IsUUID('4', { message: 'ID ruangan harus berupa format UUID v4 yang valid' })
  id!: string;
}
