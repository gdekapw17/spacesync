import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Custom constraint enforcing booking lead time constraints.
 * Reservation must be scheduled at least 24 hours (H+1) and at most 30 calendar days in advance.
 */
@ValidatorConstraint({ name: 'IsValidLeadTime', async: false })
export class IsValidLeadTimeConstraint implements ValidatorConstraintInterface {
  validate(startTimeValue: string, _args?: ValidationArguments): boolean {
    if (!startTimeValue) {
      return false;
    }

    const startTimestamp = new Date(startTimeValue).getTime();
    if (Number.isNaN(startTimestamp)) {
      return false;
    }

    const currentTimestamp = Date.now();
    const minimumLeadTime = currentTimestamp + 24 * 60 * 60 * 1000; // Minimum H+1 (24 hours)
    const maximumLeadTime = currentTimestamp + 30 * 24 * 60 * 60 * 1000; // Maximum H+30 calendar days

    return startTimestamp >= minimumLeadTime && startTimestamp <= maximumLeadTime;
  }

  defaultMessage(_args?: ValidationArguments): string {
    return 'Pemesanan harus diajukan minimal 24 jam dan maksimal 30 hari sebelum acara';
  }
}

/**
 * Custom constraint ensuring endTime is strictly greater than startTime.
 */
@ValidatorConstraint({ name: 'IsAfterStartTime', async: false })
export class IsAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(endTimeValue: string, args: ValidationArguments): boolean {
    const payload = args.object as CreateBookingDto;
    if (!payload.startTime || !endTimeValue) {
      return false;
    }

    const startTimestamp = new Date(payload.startTime).getTime();
    const endTimestamp = new Date(endTimeValue).getTime();

    if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
      return false;
    }

    return endTimestamp > startTimestamp;
  }

  defaultMessage(_args?: ValidationArguments): string {
    return 'endTime harus berada setelah startTime';
  }
}

/**
 * Custom constraint ensuring booking duration falls between 30 minutes and 8 hours (480 minutes).
 */
@ValidatorConstraint({ name: 'IsValidBookingDuration', async: false })
export class IsValidBookingDurationConstraint implements ValidatorConstraintInterface {
  validate(endTimeValue: string, args: ValidationArguments): boolean {
    const payload = args.object as CreateBookingDto;
    if (!payload.startTime || !endTimeValue) {
      return false;
    }

    const startTimestamp = new Date(payload.startTime).getTime();
    const endTimestamp = new Date(endTimeValue).getTime();

    if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
      return false;
    }

    const durationInMinutes = (endTimestamp - startTimestamp) / (1000 * 60);

    return durationInMinutes >= 30 && durationInMinutes <= 480;
  }

  defaultMessage(_args?: ValidationArguments): string {
    return 'Durasi reservasi minimal 30 menit dan maksimal 8 jam';
  }
}

/**
 * Request DTO for creating a new room booking reservation.
 */
export class CreateBookingDto {
  @ApiProperty({
    example: 'a3b98c3e-8f24-4f10-9111-ec6c3d52c2e0',
    description: 'ID target ruangan yang ingin dipinjam (UUID v4)',
  })
  @IsUUID('4', { message: 'roomId harus berupa format UUID v4 yang valid' })
  @IsNotEmpty({ message: 'roomId wajib diisi' })
  roomId!: string;

  @ApiProperty({
    example: 'Rapat Koordinasi Infrastruktur Cloud',
    maxLength: 150,
    description: 'Tujuan atau judul kegiatan',
  })
  @IsString({ message: 'Judul kegiatan harus berupa string' })
  @IsNotEmpty({ message: 'Judul kegiatan wajib diisi' })
  @MaxLength(150, { message: 'Judul kegiatan maksimal 150 karakter' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Agenda membahas migrasi database dan scaling pod worker',
    description: 'Catatan tambahan atau perlengkapan pendukung yang dibutuhkan',
  })
  @IsOptional()
  @IsString({ message: 'Deskripsi harus berupa string' })
  description?: string;

  @ApiProperty({
    example: '2026-10-15T09:00:00.000Z',
    description: 'Waktu mulai penggunaan ruangan dalam format ISO-8601 UTC penuh',
  })
  @IsISO8601(
    {},
    {
      message: 'startTime wajib berupa ISO-8601 UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    },
  )
  @IsNotEmpty({ message: 'startTime wajib diisi' })
  @Validate(IsValidLeadTimeConstraint)
  startTime!: string;

  @ApiProperty({
    example: '2026-10-15T11:00:00.000Z',
    description: 'Waktu selesai penggunaan ruangan dalam format ISO-8601 UTC penuh',
  })
  @IsISO8601(
    {},
    {
      message: 'endTime wajib berupa ISO-8601 UTC format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    },
  )
  @IsNotEmpty({ message: 'endTime wajib diisi' })
  @Validate(IsAfterStartTimeConstraint)
  @Validate(IsValidBookingDurationConstraint)
  endTime!: string;
}
