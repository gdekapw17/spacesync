import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Permitted verification actions for booking approval workflow.
 */
export enum ApprovalAction {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Request DTO for Room Manager and Admin booking status decisions.
 */
export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: ApprovalAction,
    example: ApprovalAction.APPROVED,
    description: 'Keputusan verifikasi manajer',
  })
  @IsNotEmpty({ message: 'Status keputusan wajib disertakan' })
  @IsEnum(ApprovalAction, {
    message: 'Aksi status hanya diizinkan APPROVED atau REJECTED',
  })
  status!: ApprovalAction;

  @ApiPropertyOptional({
    example: 'Ruangan dialokasikan untuk pemeliharaan pendingin udara darurat',
    description: 'Wajib diisi jika status bernilai REJECTED',
  })
  @ValidateIf((o: UpdateBookingStatusDto) => o.status === ApprovalAction.REJECTED)
  @IsNotEmpty({
    message: 'Alasan penolakan (rejectionReason) wajib diisi jika status REJECTED',
  })
  @IsString({ message: 'Alasan penolakan harus berupa string' })
  @MaxLength(255, { message: 'Alasan penolakan maksimal 255 karakter' })
  @IsOptional()
  rejectionReason?: string;
}
