import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RoomStatus } from '@prisma/client';

/**
 * Data Transfer Object for registering a new physical room entity.
 */
export class CreateRoomDto {
  @ApiProperty({ example: 'Laboratorium Komputer 2', maxLength: 100 })
  @IsString({ message: 'Nama ruangan harus berupa teks' })
  @IsNotEmpty({ message: 'Nama ruangan tidak boleh kosong' })
  @MaxLength(100, { message: 'Nama ruangan maksimal 100 karakter' })
  name!: string;

  @ApiProperty({
    example: 'LAB-KOMP-02',
    maxLength: 30,
    description: 'Kode ruangan unik internal',
  })
  @IsString({ message: 'Kode ruangan harus berupa teks' })
  @IsNotEmpty({ message: 'Kode ruangan tidak boleh kosong' })
  @MaxLength(30, { message: 'Kode ruangan maksimal 30 karakter' })
  code!: string;

  @ApiProperty({ example: 40, description: 'Kapasitas maksimal orang' })
  @IsInt({ message: 'Kapasitas harus berupa bilangan bulat' })
  @Min(1, { message: 'Kapasitas minimal 1 orang' })
  @Max(1000, { message: 'Kapasitas melebihi batas wajar sistem (maks 1000)' })
  capacity!: number;

  @ApiProperty({
    example: 'Gedung Lab Terpadu Lt. 2, Sayap Barat',
    maxLength: 255,
  })
  @IsString({ message: 'Lokasi harus berupa teks' })
  @IsNotEmpty({ message: 'Lokasi gedung/lantai wajib diisi' })
  @MaxLength(255, { message: 'Lokasi maksimal 255 karakter' })
  location!: string;

  @ApiPropertyOptional({
    example: 'Asia/Jakarta',
    default: 'Asia/Jakarta',
    description: 'Zona waktu IANA operasional fisik ruangan',
  })
  @IsOptional()
  @IsTimeZone({
    message: 'Format zona waktu harus berupa IANA Timezone yang valid',
  })
  timezone?: string = 'Asia/Jakarta';

  @ApiPropertyOptional({
    example: 15,
    default: 15,
    description: 'Waktu jeda pembersihan pasca-reservasi dalam satuan menit',
  })
  @IsOptional()
  @IsInt({ message: 'Buffer minutes harus berupa bilangan bulat' })
  @Min(0, { message: 'Buffer minutes tidak boleh bernilai negatif' })
  @Max(120, { message: 'Buffer minutes maksimal 120 menit' })
  bufferMinutes?: number = 15;

  @ApiPropertyOptional({
    example: 'e2a9b340-9a2c-4734-9271-4fb24e883832',
    description: 'ID pengguna penanggung jawab (Role: ROOM_MANAGER)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'managerId harus berupa format UUID v4 yang valid' })
  managerId?: string;

  @ApiPropertyOptional({ enum: RoomStatus, default: RoomStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(RoomStatus, { message: 'Status ruangan tidak valid' })
  status?: RoomStatus = RoomStatus.AVAILABLE;
}
