import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  CreateBookingDto,
  QueryBookingsDto,
  QueryTimelineDto,
  BookingParamDto,
  UpdateBookingStatusDto,
  CancelBookingDto,
  ForceCancelBookingDto,
} from './dto';
import {
  AuthenticatedUserPayload,
  BookingsService,
  PaginatedResult,
} from './services/bookings.service';

/**
 * Controller exposing RESTful HTTP endpoints for room booking lifecycle,
 * calendar timeline querying, approval workflows, and cancellations.
 */
@ApiTags('Reservasi Ruangan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Endpoint 4.1: Submit a new room booking reservation.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Permohonan reservasi berhasil diajukan')
  @ApiOperation({
    summary: 'Pembuatan reservasi baru',
    description:
      'Mengajukan permohonan reservasi ruangan dengan validasi ketersediaan zero-overlap dan buffer pembersihan otomatis.',
  })
  @ApiResponse({
    status: 201,
    description: 'Permohonan reservasi berhasil diajukan',
  })
  @ApiResponse({
    status: 400,
    description: 'Validasi input gagal atau ruangan tidak tersedia',
  })
  @ApiResponse({
    status: 409,
    description:
      'Slot waktu tidak tersedia karena bertubrukan dengan reservasi lain atau pemeliharaan',
  })
  async create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateBookingDto,
  ): Promise<unknown> {
    return await this.bookingsService.create(user.id, dto);
  }

  /**
   * Endpoint 4.3: Aggregated calendar availability timeline across rooms.
   * NOTE: Must be declared before route with dynamic param ':id' to prevent routing conflicts.
   */
  @Get('timeline')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Data timeline jadwal berhasil diambil')
  @ApiOperation({
    summary: 'Kalender agregat dan timeline ketersediaan seluruh ruangan',
    description:
      'Mengambil seluruh interval waktu terisi (reservasi aktif dan blok pemeliharaan) dalam rentang tanggal tertentu.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data timeline jadwal berhasil diambil',
  })
  @ApiResponse({
    status: 400,
    description: 'Rentang tanggal tidak valid (endDate <= startDate)',
  })
  async findTimeline(@Query() query: QueryTimelineDto): Promise<unknown[]> {
    return await this.bookingsService.findTimeline(query);
  }

  /**
   * Endpoint 4.2: Retrieve paginated list of bookings.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Daftar reservasi berhasil dimuat')
  @ApiOperation({
    summary: 'Daftar riwayat dan antrean reservasi terfilter',
    description:
      'Mengambil daftar reservasi dengan isolasi hak akses: Pengguna biasa (milik sendiri), Manajer (ruangan binaan), Admin (seluruh sistem).',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar reservasi berhasil dimuat',
  })
  async findAll(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: QueryBookingsDto,
  ): Promise<PaginatedResult<unknown>> {
    return await this.bookingsService.findAll(user, query);
  }

  /**
   * Endpoint 4.4: Retrieve single booking detail with audit log history.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Detail reservasi berhasil dimuat')
  @ApiOperation({
    summary: 'Detail komprehensif reservasi',
    description:
      'Mengambil informasi lengkap reservasi beserta rekam jejak mutasi status (audit logs).',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail reservasi berhasil dimuat',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Tidak memiliki wewenang atas reservasi ini',
  })
  @ApiResponse({
    status: 404,
    description: 'Reservasi tidak ditemukan',
  })
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
  ): Promise<unknown> {
    const _dtoValidationCheck: BookingParamDto = { id };
    return await this.bookingsService.findOne(_dtoValidationCheck.id, user);
  }

  /**
   * Endpoint 4.5: Approval engine workflow (Manager or Admin decision).
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)
  @ResponseMessage('Status reservasi berhasil diperbarui')
  @ApiOperation({
    summary: 'Workflow persetujuan reservasi (Approval Engine)',
    description:
      'Mengubah status permohonan reservasi PENDING menjadi APPROVED atau REJECTED dengan validasi ulang benturan slot secara transaksional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status reservasi berhasil diperbarui',
  })
  @ApiResponse({
    status: 400,
    description: 'Reservasi sudah bukan berstatus PENDING',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Tidak memiliki wewenang atas ruangan ini',
  })
  @ApiResponse({
    status: 409,
    description: 'Persetujuan gagal: Terjadi bentrok slot waktu dengan reservasi lain',
  })
  async updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<unknown> {
    const _dtoValidationCheck: BookingParamDto = { id };
    return await this.bookingsService.updateStatus(_dtoValidationCheck.id, user, dto);
  }

  /**
   * Endpoint 4.6: Self-cancellation by the applicant.
   */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Reservasi berhasil dibatalkan')
  @ApiOperation({
    summary: 'Pembatalan mandiri oleh pemohon',
    description:
      'Memungkinkan pemohon membatalkan reservasi aktif miliknya maksimal 2 jam sebelum waktu mulai acara.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservasi berhasil dibatalkan',
  })
  @ApiResponse({
    status: 400,
    description: 'Batas waktu pembatalan mandiri telah terlewati (maksimal 2 jam sebelum acara)',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Tidak memiliki wewenang membatalkan reservasi orang lain',
  })
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CancelBookingDto,
  ): Promise<unknown> {
    const _dtoValidationCheck: BookingParamDto = { id };
    return await this.bookingsService.cancelBooking(_dtoValidationCheck.id, user, dto);
  }

  /**
   * Endpoint 4.7: Emergency force-cancellation by Room Manager or Admin.
   */
  @Patch(':id/force-cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)
  @ResponseMessage('Reservasi berhasil dibatalkan secara darurat oleh manajer')
  @ApiOperation({
    summary: 'Pembatalan darurat oleh manajer (Force Cancel)',
    description:
      'Memungkinkan Room Manager atau Admin membatalkan reservasi aktif secara sepihak melewati batas waktu 2 jam dengan alasan wajib minimal 10 karakter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservasi berhasil dibatalkan secara darurat oleh manajer',
  })
  @ApiResponse({
    status: 400,
    description: 'Reservasi tidak dapat dibatalkan karena sudah CANCELLED atau COMPLETED',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Tidak memiliki wewenang manajerial atas ruangan ini',
  })
  async forceCancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: ForceCancelBookingDto,
  ): Promise<unknown> {
    const _dtoValidationCheck: BookingParamDto = { id };
    return await this.bookingsService.forceCancelBooking(_dtoValidationCheck.id, user, dto);
  }
}
