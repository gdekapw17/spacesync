import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiErrorResponse, ApiFieldError } from '../interfaces/api-response.interface';

/**
 * Advanced multi-layer exception filter for SpaceSync.
 * Harmonizes standard NestJS HttpExceptions, Prisma Client errors,
 * and PostgreSQL GiST exclusion violations into a deterministic ApiErrorResponse envelope.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const timestamp = new Date().toISOString();
    const path = request.url;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'InternalServerError';
    let message = 'Terjadi kesalahan internal pada server. Silakan hubungi administrator.';
    let errors: ApiFieldError[] | undefined = undefined;
    let dataPayload: unknown = undefined;

    // =========================================================================
    // LAYER 1: Standard NestJS HttpException Handling
    // =========================================================================
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, unknown>;

        error = (resObj.error as string) ?? exception.name;
        message = (resObj.message as string) ?? exception.message;

        // Extract structured field validation errors if provided by StrictValidationPipe
        if (Array.isArray(resObj.errors)) {
          errors = resObj.errors as ApiFieldError[];
        }

        // Support Terminus health check payload passthrough on 503 Service Unavailable
        if (resObj.details || resObj.status === 'error') {
          dataPayload = {
            status: resObj.status ?? 'error',
            info: resObj.info ?? {},
            error: resObj.error ?? {},
            details: resObj.details ?? {},
          };
          message = 'Pemeriksaan kesehatan sistem gagal: Satu atau lebih dependensi down';
        }
      }
    }

    // =========================================================================
    // LAYER 2: PostgreSQL Exclusion Constraint Violation (SQLSTATE 23P01)
    // =========================================================================
    else if (this.isPostgreSQLExclusionViolation(exception)) {
      statusCode = HttpStatus.CONFLICT;
      error = 'ConflictException';
      message =
        'Slot waktu tidak tersedia karena bertubrukan dengan reservasi lain atau masa pembersihan buffer.';

      this.logger.warn(
        `[GiST Exclusion Collision Caught] Path: ${path} | Detail: Database exclusion constraint violation (23P01)`,
      );
    }

    // =========================================================================
    // LAYER 3: Prisma ORM Known Request Errors
    // =========================================================================
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          statusCode = HttpStatus.CONFLICT;
          error = 'ConflictException';
          const target = Array.isArray(exception.meta?.target)
            ? (exception.meta?.target as string[]).join(', ')
            : 'data';
          message = `Entitas dengan ${target} tersebut sudah terdaftar pada sistem.`;
          break;
        }
        case 'P2025': {
          statusCode = HttpStatus.NOT_FOUND;
          error = 'NotFoundException';
          message = 'Entitas data yang diminta tidak ditemukan pada sistem.';
          break;
        }
        case 'P2003': {
          statusCode = HttpStatus.BAD_REQUEST;
          error = 'BadRequestException';
          message = 'Operasi gagal karena relasi data terkait tidak valid atau tidak ditemukan.';
          break;
        }
        default: {
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          error = 'DatabaseTransactionError';
          message = 'Terjadi kegagalan saat mengeksekusi transaksi basis data.';
          this.logger.error(
            `[Unhandled Prisma Error ${exception.code}] ${exception.message}`,
            exception.stack,
          );
          break;
        }
      }
    }

    // =========================================================================
    // LAYER 4: Unhandled Generic Errors & Safety Fallback
    // =========================================================================
    else {
      const err = exception as Error;
      this.logger.error(
        `[Unhandled System Exception] ${err?.message ?? 'Unknown error'}`,
        err?.stack,
      );
    }

    // Construct final standardized error payload
    const errorResponse: ApiErrorResponse = {
      success: false,
      statusCode,
      error,
      message,
      timestamp,
      path,
    };

    if (errors && errors.length > 0) {
      errorResponse.errors = errors;
    }

    if (dataPayload !== undefined) {
      errorResponse.data = dataPayload;
    }

    response.status(statusCode).json(errorResponse);
  }

  /**
   * Helper to detect native PostgreSQL exclusion constraint violations (SQLSTATE 23P01).
   * Catches violations emitted by btree_gist exclusion constraints on bookings and maintenance tables.
   */
  private isPostgreSQLExclusionViolation(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') {
      return false;
    }

    const err = exception as Record<string, unknown>;
    const errorMessage = String(err.message ?? '');

    // Direct string checks for SQLSTATE or constraint names
    const has23P01 = errorMessage.includes('23P01') || errorMessage.includes('exclusion_violation');
    const hasConstraintName =
      errorMessage.includes('no_overlapping_active_bookings') ||
      errorMessage.includes('no_overlapping_maintenance_blocks');

    // Nested metadata inspection for Prisma client exceptions
    let hasMetaCode = false;
    if (err.meta && typeof err.meta === 'object') {
      const meta = err.meta as Record<string, unknown>;
      hasMetaCode =
        meta.code === '23P01' ||
        String(meta.message ?? '').includes('23P01') ||
        String(meta.details ?? '').includes('23P01');
    }

    return has23P01 || hasConstraintName || hasMetaCode;
  }
}
