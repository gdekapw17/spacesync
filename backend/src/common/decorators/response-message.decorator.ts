import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for overriding the default success message in TransformResponseInterceptor.
 */
export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Custom decorator to assign a human-readable success message to an endpoint.
 *
 * @param message The descriptive message to be included in the ApiResponse envelope.
 * @example
 * @Get('profile')
 * @ResponseMessage('User profile retrieved successfully')
 * getProfile() { ... }
 */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);
