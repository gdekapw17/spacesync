import { Role } from '@prisma/client';

/**
 * Access Token JWT claims payload structure.
 */
export interface JwtPayload {
  /**
   * User identifier (UUID v4).
   */
  sub: string;

  /**
   * Registered institutional user email.
   */
  email: string;

  /**
   * Assigned authorization role.
   */
  role: Role;

  /**
   * Token issuance timestamp (UNIX epoch seconds).
   */
  iat?: number;

  /**
   * Token expiration timestamp (UNIX epoch seconds).
   */
  exp?: number;
}

/**
 * Refresh Token JWT claims payload structure.
 */
export interface JwtRefreshPayload {
  /**
   * User identifier (UUID v4).
   */
  sub: string;

  /**
   * Registered institutional user email.
   */
  email: string;

  /**
   * Token issuance timestamp (UNIX epoch seconds).
   */
  iat?: number;

  /**
   * Token expiration timestamp (UNIX epoch seconds).
   */
  exp?: number;
}

/**
 * Resolved authenticated user entity attached to Express request (req.user).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Resolved refresh user entity attached to request on token rotation.
 */
export interface AuthenticatedRefreshUser extends AuthenticatedUser {
  refreshToken: string;
}
