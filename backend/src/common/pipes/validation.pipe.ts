import { BadRequestException, Injectable, ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiFieldError } from '../interfaces/api-response.interface';

/**
 * Recursively extracts and flattens validation constraints from class-validator ValidationError objects.
 * Supports nested DTOs by constructing dot-notation field paths (e.g., 'profile.phoneNumber').
 *
 * @param errors Array of ValidationError instances produced by class-validator.
 * @param parentField Accumulated parent path for nested properties.
 * @returns Flattened array of ApiFieldError containing specific issue descriptions.
 */
function extractValidationErrors(errors: ValidationError[], parentField = ''): ApiFieldError[] {
  const fieldErrors: ApiFieldError[] = [];

  for (const error of errors) {
    const fieldPath = parentField ? `${parentField}.${error.property}` : error.property;

    if (error.constraints) {
      for (const constraintKey of Object.keys(error.constraints)) {
        fieldErrors.push({
          field: fieldPath,
          issue: error.constraints[constraintKey],
        });
      }
    }

    // Traverse nested children validation errors recursively
    if (error.children && error.children.length > 0) {
      fieldErrors.push(...extractValidationErrors(error.children, fieldPath));
    }
  }

  return fieldErrors;
}

/**
 * Enterprise strict validation pipe configured for zero-trust input sanitization.
 * Strips non-whitelisted properties, enforces strict typing, and maps issues to ApiFieldError[].
 */
@Injectable()
export class StrictValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      exceptionFactory: (validationErrors: ValidationError[] = []) => {
        const errors = extractValidationErrors(validationErrors);
        return new BadRequestException({
          message: 'Validasi input gagal',
          errors,
        });
      },
    });
  }
}
