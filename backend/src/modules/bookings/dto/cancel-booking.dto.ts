import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request DTO for applicant self-cancellation.
 */
export class CancelBookingDto {
  @ApiPropertyOptional({
    example: 'Kegiatan koordinasi diundur karena narasumber berhalangan',
    description: 'Alasan pembatalan reservasi',
  })
  @IsOptional()
  @IsString({ message: 'Alasan pembatalan harus berupa string' })
  @MaxLength(255, { message: 'Alasan pembatalan maksimal 255 karakter' })
  cancellationReason?: string;
}
