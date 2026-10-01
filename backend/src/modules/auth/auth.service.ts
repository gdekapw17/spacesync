import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from './constants/auth.constants';

/**
 * Core authentication service handling registration, credential validation,
 * token pair generation, secure token rotation, and credential revocation.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registers a new institutional user with encrypted password and profile initialization.
   *
   * @param dto - Account registration payload
   * @returns Newly created user record without confidential secrets
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar pada sistem');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const newUser = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          role: Role.USER,
          profile: {
            create: {
              fullName: dto.fullName.trim(),
              phoneNumber: dto.phoneNumber?.trim(),
              department: dto.department?.trim(),
            },
          },
        },
        select: {
          id: true,
          email: true,
          role: true,
          profile: {
            select: {
              fullName: true,
              phoneNumber: true,
              department: true,
            },
          },
          createdAt: true,
        },
      });
    });

    return newUser;
  }

  /**
   * Authenticates user credentials, issues Dual-Token pair, and secures Refresh Token in cookie.
   *
   * @param dto - Login credentials
   * @param res - Native Express response to inject HttpOnly cookie
   * @returns Short-lived Access Token and user presentation details
   */
  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('Kredensial yang diberikan tidak valid');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Kredensial yang diberikan tidak valid');
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    const saltRounds = 10;
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken },
    });

    setRefreshTokenCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.profile?.fullName ?? '',
      },
    };
  }

  /**
   * Performs zero-trust refresh token rotation, invalidating previous session tokens.
   *
   * @param userId - Extracted authenticated user identifier
   * @param rawRefreshToken - Unhashed refresh token received from incoming HttpOnly cookie
   * @param res - Native Express response to update HttpOnly cookie
   * @returns New rotated short-lived Access Token
   */
  async refreshTokens(userId: string, rawRefreshToken: string, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        hashedRefreshToken: true,
      },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Refresh token kedaluwarsa atau tidak valid');
    }

    const isTokenMatch = await bcrypt.compare(rawRefreshToken, user.hashedRefreshToken);

    if (!isTokenMatch) {
      throw new UnauthorizedException('Refresh token kedaluwarsa atau tidak valid');
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    const saltRounds = 10;
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken },
    });

    setRefreshTokenCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
    };
  }

  /**
   * Revokes active session persistence by clearing stored refresh token hash and client cookie.
   *
   * @param userId - Currently authenticated user identifier
   * @param res - Native Express response to clear client cookie
   * @returns null
   */
  async logout(userId: string, res: Response): Promise<null> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });

    clearRefreshTokenCookie(res);

    return null;
  }

  /**
   * Rotates account password, verifies previous secret, and revokes all active refresh tokens.
   *
   * @param userId - Currently authenticated user identifier
   * @param dto - Old and new password credentials
   * @param res - Native Express response to clear active session cookie
   * @returns null
   */
  async changePassword(userId: string, dto: ChangePasswordDto, res: Response): Promise<null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan pada sistem');
    }

    const isOldPasswordCorrect = await bcrypt.compare(dto.oldPassword, user.passwordHash);

    if (!isOldPasswordCorrect) {
      throw new BadRequestException('Kata sandi lama yang Anda masukkan tidak sesuai');
    }

    const isSameAsOldPassword = await bcrypt.compare(dto.newPassword, user.passwordHash);

    if (isSameAsOldPassword) {
      throw new UnprocessableEntityException(
        'Kata sandi baru tidak boleh sama dengan kata sandi lama',
      );
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        hashedRefreshToken: null,
      },
    });

    clearRefreshTokenCookie(res);

    return null;
  }

  /**
   * Retrieves profile, role assignment, and managed facilities for the current user.
   *
   * @param userId - Currently authenticated user identifier
   * @returns Comprehensive user identity profile
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        profile: {
          select: {
            fullName: true,
            phoneNumber: true,
            department: true,
          },
        },
        managedRooms: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Profil pengguna tidak ditemukan');
    }

    return user;
  }

  /**
   * Helper method to generate cryptographic Dual-Token pair with independent secret keys.
   */
  private async generateTokenPair(
    userId: string,
    email: string,
    role: Role,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      role,
    };

    const refreshPayload: JwtRefreshPayload = {
      sub: userId,
      email,
    };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secret keys are not configured in environment variables.');
    }

    const accessExpiration = this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m');
    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessExpiration as unknown as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiration as unknown as JwtSignOptions['expiresIn'],
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
