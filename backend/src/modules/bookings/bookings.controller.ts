import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CreateBookingDto, QueryBookingsDto, QueryTimelineDto, BookingParamDto } from './dto';
import {
  AuthenticatedUserPayload,
  BookingsService,
  PaginatedResult,
} from './services/bookings.service';

/**
 * Controller exposing RESTful HTTP endpoints for room booking lifecycle,
 * calendar timeline querying, and granular reservation details.
 */
@ApiTags('Reservasi Ruangan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Submit a new room booking reservation.
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
   * Aggregated calendar availability timeline across rooms.
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
   * Retrieve paginated list of bookings.
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
   * Retrieve single booking detail with audit log history.
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
}
