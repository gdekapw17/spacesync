import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Metadata key used by RolesGuard to enforce role-based access control.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to assign required user roles to a controller or route handler.
 *
 * @param roles - One or more Prisma Role enum values (SUPER_ADMIN, ROOM_MANAGER, USER)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
