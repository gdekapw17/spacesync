import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as SwaggerApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUserPayload } from '../rooms/rooms.service';
import { CreateMaintenanceBlockDto, QueryMaintenanceDto } from './dto';
import { MaintenanceService } from './maintenance.service';

/**
 * Controller managing room maintenance block scheduling and operational cancellation.
 */
@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)
@Controller('rooms')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /**
   * Schedule a new maintenance block for a specific room.
   */
  @Post(':id/maintenance')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pembuatan Blok Pemeliharaan Ruangan (Maintenance Block)',
    description:
      'Memblokir ketersediaan ruangan untuk kegiatan pemeliharaan atau perbaikan, memvalidasi ketiadaan reservasi APPROVED yang bertubrukan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID Ruangan berbentuk UUID v4',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @SwaggerApiResponse({
    status: 201,
    description: 'Blok pemeliharaan ruangan berhasil dijadwalkan',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Waktu selesai pemeliharaan harus lebih besar dari waktu mulai',
  })
  @SwaggerApiResponse({
    status: 403,
    description: 'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
  })
  @SwaggerApiResponse({
    status: 404,
    description: 'Ruangan tidak ditemukan',
  })
  @SwaggerApiResponse({
    status: 409,
    description:
      'Jadwal pemeliharaan bertabrakan dengan jadwal reservasi yang sudah disetujui (APPROVED)',
  })
  @ResponseMessage('Blok pemeliharaan ruangan berhasil dijadwalkan')
  async create(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateMaintenanceBlockDto,
  ) {
    return this.maintenanceService.create(id, user, dto);
  }

  /**
   * Retrieve paginated maintenance history for a specific room.
   */
  @Get(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Riwayat Blok Pemeliharaan Ruangan',
    description:
      'Mengambil daftar seluruh jadwal pemeliharaan terdaftar pada ruangan spesifik dengan filter upcomingOnly.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID Ruangan berbentuk UUID v4',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Daftar jadwal pemeliharaan ruangan berhasil dimuat',
  })
  @SwaggerApiResponse({
    status: 403,
    description: 'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
  })
  @SwaggerApiResponse({
    status: 404,
    description: 'Ruangan dengan ID yang dituju tidak ditemukan',
  })
  @ResponseMessage('Daftar jadwal pemeliharaan ruangan berhasil dimuat')
  async findAllByRoom(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: QueryMaintenanceDto,
  ) {
    return this.maintenanceService.findAllByRoom(id, user, query);
  }

  /**
   * Cancel and delete a maintenance block.
   */
  @Delete(':id/maintenance/:maintenanceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batalkan / Hapus Blok Pemeliharaan Ruangan',
    description:
      'Membatalkan blok pemeliharaan ruangan agar slot ketersediaan kembali terbuka untuk reservasi umum.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID Ruangan berbentuk UUID v4',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiParam({
    name: 'maintenanceId',
    description: 'ID Blok Pemeliharaan berbentuk UUID v4',
    example: 'b7d2f10a-3c58-4e89-91a2-5e6f7a8b9c0d',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Blok pemeliharaan ruangan berhasil dibatalkan',
  })
  @SwaggerApiResponse({
    status: 403,
    description: 'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
  })
  @SwaggerApiResponse({
    status: 404,
    description: 'Blok pemeliharaan dengan ID yang dituju tidak ditemukan pada ruangan ini',
  })
  @ResponseMessage('Blok pemeliharaan ruangan berhasil dibatalkan')
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('maintenanceId', new ParseUUIDPipe({ version: '4' }))
    maintenanceId: string,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return this.maintenanceService.remove(id, maintenanceId, user);
  }
}
