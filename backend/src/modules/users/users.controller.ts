import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

/**
 * Controller exposing profile mutation and institutional user administration endpoints.
 */
@ApiTags('Users')
@ApiBearerAuth('bearer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Updates personal profile attributes for the authenticated requester.
   */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Profil berhasil diperbarui')
  @ApiOperation({
    summary: 'Perbarui profil pengguna mandiri',
    description: 'Memperbarui data profil personal milik pengguna yang sedang terautentikasi.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil berhasil diperbarui',
  })
  @ApiResponse({
    status: 401,
    description: 'Akses ditolak: Access token tidak valid atau kedaluwarsa',
  })
  @ApiResponse({
    status: 404,
    description: 'Pengguna tidak ditemukan pada sistem',
  })
  async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * Lists all registered users with pagination and search filtering (Super Admin only).
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Data pengguna berhasil diambil')
  @ApiOperation({
    summary: 'Daftar pengguna global (Khusus Super Admin)',
    description:
      'Mengambil daftar seluruh pengguna sistem dengan mekanisme paginasi dan filter pencarian.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data pengguna berhasil diambil',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Anda tidak memiliki otoritas peran SUPER_ADMIN',
  })
  async findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  /**
   * Mutates the authority role assigned to a user (Super Admin only).
   */
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Peran pengguna berhasil diperbarui')
  @ApiOperation({
    summary: 'Mutasi peran pengguna (Khusus Super Admin)',
    description:
      'Mengubah peran hak akses pengguna secara eksplisit dengan proteksi pencegahan self-demotion.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID pengguna berbentuk UUID v4',
    example: 'e2a9b340-9a2c-4734-9271-4fb24e883832',
  })
  @ApiResponse({
    status: 200,
    description: 'Peran pengguna berhasil diperbarui',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (uuid v4 is expected)',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak: Anda tidak memiliki otoritas peran SUPER_ADMIN',
  })
  @ApiResponse({
    status: 404,
    description: 'Pengguna dengan ID yang dituju tidak ditemukan',
  })
  @ApiResponse({
    status: 422,
    description:
      'Super Admin tidak diperbolehkan menurunkan perannya sendiri demi integritas sistem',
  })
  async updateRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @CurrentUser('id') currentAdminId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(targetUserId, currentAdminId, dto);
  }
}
