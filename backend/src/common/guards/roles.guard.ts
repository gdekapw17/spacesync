import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Role-Based Access Control (RBAC) Guard.
 * Evaluates whether the authenticated user possesses one of the required roles specified via @Roles().
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required on the endpoint, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user || !user.role) {
      throw new ForbiddenException(
        'Akses ditolak: Identitas peran pengguna tidak valid atau tidak ditemukan',
      );
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Akses ditolak: Anda tidak memiliki otoritas peran yang sesuai (${requiredRoles.join(', ')})`,
      );
    }

    return true;
  }
}
