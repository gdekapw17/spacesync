import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to mark routes accessible without JWT authentication.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to bypass global/local JwtAuthGuard for publicly accessible endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
