import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { AuthenticatedRefreshUser } from './interfaces/jwt-payload.interface';

/**
 * Controller exposing endpoints for user registration, authentication lifecycle,
 * silent token refresh rotation, session termination, and profile self-discovery.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new institutional account.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Registrasi akun berhasil')
  @ApiOperation({
    summary: 'Register user baru',
    description:
      'Mendaftarkan akun internal baru. Pengguna baru secara default memperoleh peran USER.',
  })
  @ApiResponse({
    status: 201,
    description: 'Registrasi akun berhasil',
  })
  @ApiResponse({
    status: 400,
    description: 'Validasi input gagal',
  })
  @ApiResponse({
    status: 409,
    description: 'Email sudah terdaftar pada sistem',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticates user credentials and issues Dual-Token session.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Autentikasi berhasil')
  @ApiOperation({
    summary: 'Login akun pengguna',
    description:
      'Mengautentikasi pengguna menggunakan kredensial email dan password. Menghasilkan Access Token dan Set-Cookie HttpOnly Refresh Token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Autentikasi berhasil',
  })
  @ApiResponse({
    status: 400,
    description: 'Validasi input gagal',
  })
  @ApiResponse({
    status: 401,
    description: 'Kredensial yang diberikan tidak valid',
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  /**
   * Rotates session tokens using the HttpOnly refresh cookie.
   */
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token berhasil diperbarui')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Memperbarui pasangan token sesi. Refresh token diekstraksi dari HttpOnly cookie untuk mencegah XSS.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token berhasil diperbarui',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token kedaluwarsa atau tidak valid',
  })
  async refresh(
    @CurrentUser() user: AuthenticatedRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refreshTokens(user.id, user.refreshToken, res);
  }

  /**
   * Revokes current user session and clears cookie.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer-jwt')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Sesi berhasil diakhiri')
  @ApiOperation({
    summary: 'Logout pengguna',
    description:
      'Mengakhiri sesi pengguna aktif dengan menghapus hash refresh token di database serta membersihkan cookie HttpOnly di browser.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesi berhasil diakhiri',
  })
  @ApiResponse({
    status: 401,
    description: 'Akses ditolak: Access token tidak valid atau kedaluwarsa',
  })
  async logout(@CurrentUser('id') userId: string, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(userId, res);
  }

  /**
   * Retrieves active authenticated user identity and assigned management areas.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer-jwt')
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Profil pengguna berhasil dimuat')
  @ApiOperation({
    summary: 'Dapatkan profil pengguna aktif',
    description:
      'Mengembalikan data profil lengkap, penugasan unit ruangan (jika manager), dan identitas peran dari pengguna saat ini.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil pengguna berhasil dimuat',
  })
  @ApiResponse({
    status: 401,
    description: 'Akses ditolak: Access token tidak valid atau kedaluwarsa',
  })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  /**
   * Rotates active user account password and revokes all active sessions.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer-jwt')
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kredensial baru.')
  @ApiOperation({
    summary: 'Ganti password mandiri',
    description:
      'Memungkinkan pengguna terautentikasi melakukan rotasi kata sandi. Setelah berhasil, seluruh sesi aktif dicabut.',
  })
  @ApiResponse({
    status: 200,
    description: 'Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kredensial baru.',
  })
  @ApiResponse({
    status: 400,
    description: 'Kata sandi lama yang Anda masukkan tidak sesuai',
  })
  @ApiResponse({
    status: 401,
    description: 'Akses ditolak: Access token tidak valid atau kedaluwarsa',
  })
  @ApiResponse({
    status: 422,
    description: 'Kata sandi baru tidak boleh sama dengan kata sandi lama',
  })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.changePassword(userId, dto, res);
  }
}
