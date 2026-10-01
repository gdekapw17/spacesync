import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedRefreshUser } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Guard dedicated to authenticating requests against the HttpOnly refresh token cookie.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  /**
   * Handles refresh authentication failure and provides typed exception wrapping.
   */
  override handleRequest<TUser = AuthenticatedRefreshUser>(
    err: unknown,
    user: TUser | false | null | undefined,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      if (err instanceof Error) {
        throw err;
      }

      throw new UnauthorizedException(
        'Refresh token kedaluwarsa atau tidak valid. Silakan masuk kembali.',
      );
    }

    return user;
  }
}
