import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Request DTO for Room Manager emergency force-cancellation.
 */
export class ForceCancelBookingDto {
  @ApiProperty({
    example: 'Ruangan dialihkan mendadak untuk kegiatan akreditasi institusi',
    description: 'Alasan pembatalan darurat oleh manajer (minimal 10 karakter)',
  })
  @IsString({ message: 'Alasan pembatalan harus berupa teks string' })
  @IsNotEmpty({ message: 'Alasan pembatalan darurat wajib disertakan' })
  @MinLength(10, {
    message: 'Alasan pembatalan darurat minimal 10 karakter untuk keperluan audit',
  })
  reason!: string;
}
