import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Passport strategy to authenticate short-lived Access Tokens extracted from the Authorization header.
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_ACCESS_SECRET environment variable is not defined.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  /**
   * Validates the decoded JWT payload and verifies active existence in the database.
   *
   * @param payload - Decoded JWT access payload
   * @returns AuthenticatedUser instance attached to req.user
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Akses ditolak: Akun pengguna tidak ditemukan atau telah dinonaktifkan',
      );
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
