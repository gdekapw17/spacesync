import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, PaginationMeta } from '../interfaces/api-response.interface';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

/**
 * Global response interceptor that enforces the SpaceSync Envelope Pattern.
 * Intercepts outbound controller payloads and wraps them in a standardized ApiResponse<T>.
 */
@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();

    // Resolve custom message from route handler metadata if provided
    const customMessage = this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler());

    return next.handle().pipe(
      map((result: unknown): ApiResponse<T> => {
        const statusCode = response.statusCode;

        // Default fallback message based on standard HTTP status codes
        let message =
          customMessage ??
          (statusCode === 201
            ? 'Resource created successfully'
            : 'Operation completed successfully');

        let data: unknown = result;
        let meta: PaginationMeta | undefined = undefined;

        // Inspect result structure to avoid double-wrapping when service returns pre-structured data
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const record = result as Record<string, unknown>;

          // Case 1: Result already contains an explicit pagination structure
          if ('data' in record && ('meta' in record || 'message' in record)) {
            data = record.data;
            if (record.meta) {
              meta = record.meta as PaginationMeta;
            }
            if (record.message && typeof record.message === 'string') {
              message = record.message;
            }
          }
          // Case 2: Result is a single object with only a 'data' key
          else if ('data' in record && Object.keys(record).length === 1) {
            data = record.data;
          }
        }

        const envelope: ApiResponse<T> = {
          success: true,
          statusCode,
          message,
          data: (data ?? null) as T,
        };

        if (meta !== undefined) {
          envelope.meta = meta;
        }

        return envelope;
      }),
    );
  }
}
