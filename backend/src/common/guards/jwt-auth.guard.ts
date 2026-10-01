import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Access Token authentication guard. Bypasses route handlers decorated with @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Determines if the current request pipeline should proceed based on @Public() reflection metadata.
   */
  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Handles authentication result without using any, enforcing proper error encapsulation.
   */
  override handleRequest<TUser = AuthenticatedUser>(
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
        'Akses ditolak: Access token tidak valid, telah kedaluwarsa, atau tidak dilampirkan',
      );
    }

    return user;
  }
}
