import {
  Body,
  Controller,
  Delete,
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
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRoomDto, QueryRoomsDto, RoomScheduleQueryDto, UpdateRoomDto } from './dto';
import { AuthenticatedUserPayload, RoomsService } from './rooms.service';

/**
 * REST controller managing public and administrative room inventory endpoints.
 */
@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Public rooms catalog with availability filter.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Daftar Ruangan Publik & Filter Ketersediaan',
    description:
      'Mengambil daftar seluruh ruangan dengan filter dinamis kapasitas, status, dan ketersediaan waktu.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar ruangan berhasil dimuat',
  })
  @ResponseMessage('Daftar ruangan berhasil dimuat')
  async findAll(@Query() query: QueryRoomsDto) {
    const result = await this.roomsService.findAll(query);
    return result.items;
  }

  /**
   * Detailed room specification and daily occupied schedules.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detail Ruangan & Jadwal Terisi Harian',
    description:
      'Mengambil spesifikasi rinci suatu ruangan beserta daftar reservasi aktif dan blok pemeliharaan harian.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail ruangan dan jadwal ketersediaan berhasil dimuat',
  })
  @ApiResponse({
    status: 404,
    description: 'Ruangan tidak ditemukan',
  })
  @ResponseMessage('Detail ruangan dan jadwal ketersediaan berhasil dimuat')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: RoomScheduleQueryDto,
  ) {
    return this.roomsService.findOne(id, query.date);
  }

  /**
   * Register a new physical room entity (Super Admin only).
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tambah Ruangan Baru (Admin Only)',
    description:
      'Mendaftarkan aset ruangan baru ke dalam sistem dengan kode unik dan penugasan manajer unit.',
  })
  @ApiResponse({
    status: 201,
    description: 'Ruangan berhasil didaftarkan',
  })
  @ApiResponse({
    status: 409,
    description: 'Kode ruangan sudah terdaftar pada sistem',
  })
  @ResponseMessage('Ruangan berhasil didaftarkan')
  async create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  /**
   * Update room technical data or operational status.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ROOM_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui Data & Status Operasional Ruangan',
    description:
      'Memperbarui data teknis, penanggung jawab, waktu buffer, atau mengubah status operasional ruangan.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data ruangan berhasil diperbarui',
  })
  @ApiResponse({
    status: 403,
    description: 'Anda tidak memiliki otoritas operasional untuk mengelola ruangan ini',
  })
  @ApiResponse({
    status: 404,
    description: 'Ruangan tidak ditemukan',
  })
  @ResponseMessage('Data ruangan berhasil diperbarui')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.update(id, user, dto);
  }

  /**
   * Soft-delete/deactivate room entity (Super Admin only).
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nonaktifkan / Soft Delete Ruangan (Admin Only)',
    description:
      'Menonaktifkan ruangan dari sistem peminjaman umum secara aman dengan mengubah status menjadi INACTIVE.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ruangan berhasil dinonaktifkan dari sistem peminjaman',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ruangan tidak dapat dinonaktifkan karena masih memiliki reservasi aktif di masa mendatang',
  })
  @ResponseMessage('Ruangan berhasil dinonaktifkan dari sistem peminjaman')
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.roomsService.remove(id);
  }
}
