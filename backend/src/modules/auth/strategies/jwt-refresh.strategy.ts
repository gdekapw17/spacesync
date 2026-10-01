import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { REFRESH_COOKIE_NAME } from '../constants/auth.constants';
import { AuthenticatedRefreshUser, JwtRefreshPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Passport strategy to authenticate long-lived Refresh Tokens extracted from HttpOnly cookies.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is not defined.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          let token: string | null = null;
          if (request && request.cookies) {
            token = request.cookies[REFRESH_COOKIE_NAME] || null;
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: refreshSecret,
      passReqToCallback: true,
    });
  }

  /**
   * Validates decoded refresh token payload and returns user data along with the raw cookie value.
   *
   * @param req - Native Express request object containing cookies
   * @param payload - Decoded JWT refresh payload
   * @returns AuthenticatedRefreshUser attached to req.user
   */
  async validate(req: Request, payload: JwtRefreshPayload): Promise<AuthenticatedRefreshUser> {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token tidak ditemukan pada cookie permintaan');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        hashedRefreshToken: true,
      },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Sesi refresh token tidak valid atau telah dicabut');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      refreshToken: rawRefreshToken,
    };
  }
}
