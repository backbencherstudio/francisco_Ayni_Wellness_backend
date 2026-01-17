import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  [key: string]: any;
}

@Injectable()
export class HttpResponseInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // If data is null or undefined, return empty success response
        if (data === null || data === undefined) {
          response.status(HttpStatus.NO_CONTENT);
          return {
            success: true,
            statusCode: HttpStatus.NO_CONTENT,
          };
        }

        // If response already has success field, use it
        if (typeof data === 'object' && 'success' in data) {
          const hasError = data.success === false;
          
          // Determine appropriate HTTP status code
          let statusCode = data.statusCode || response.statusCode;
          
          // If success is false and no statusCode is set, determine from message or default to 400
          if (hasError && !data.statusCode) {
            statusCode = this.determineErrorStatusCode(data.message);
          }
          
          // If success is true and no statusCode is set, default to 200
          if (!hasError && !data.statusCode) {
            statusCode = HttpStatus.OK;
          }

          response.status(statusCode);
          
          return {
            success: data.success,
            statusCode,
            ...data,
          };
        }

        // If response has an error message but no success field
        if (typeof data === 'object' && 'message' in data && this.seemsLikeError(data)) {
          const statusCode = data.statusCode || this.determineErrorStatusCode(data.message);
          response.status(statusCode);
          
          return {
            success: false,
            statusCode,
            ...data,
          };
        }

        // Default successful response
        const statusCode = data.statusCode || response.statusCode || HttpStatus.OK;
        response.status(statusCode);
        
        return {
          success: true,
          statusCode,
          ...(typeof data === 'object' ? data : { data }),
        };
      }),
    );
  }

  /**
   * Determine if response object seems like an error based on its properties
   */
  private seemsLikeError(data: any): boolean {
    if (!data.message) return false;
    
    const errorKeywords = [
      'error',
      'fail',
      'invalid',
      'not found',
      'unauthorized',
      'forbidden',
      'bad request',
      'already exist',
      'required',
      'denied',
    ];
    
    const message = String(data.message).toLowerCase();
    return errorKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Determine appropriate HTTP status code from error message
   */
  private determineErrorStatusCode(message?: string): number {
    if (!message) return HttpStatus.BAD_REQUEST;

    const msg = String(message).toLowerCase();

    // Authentication & Authorization errors
    if (
      msg.includes('unauthorized') ||
      msg.includes('not authenticated') ||
      msg.includes('token') ||
      msg.includes('credentials')
    ) {
      return HttpStatus.UNAUTHORIZED;
    }

    if (msg.includes('forbidden') || msg.includes('permission')) {
      return HttpStatus.FORBIDDEN;
    }

    // Resource errors
    if (msg.includes('not found') || msg.includes('does not exist')) {
      return HttpStatus.NOT_FOUND;
    }

    if (
      msg.includes('already exist') ||
      msg.includes('duplicate') ||
      msg.includes('conflict')
    ) {
      return HttpStatus.CONFLICT;
    }

    // Validation errors
    if (
      msg.includes('invalid') ||
      msg.includes('required') ||
      msg.includes('must be') ||
      msg.includes('validation')
    ) {
      return HttpStatus.BAD_REQUEST;
    }

    // Rate limiting
    if (msg.includes('too many') || msg.includes('rate limit')) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }

    // Server errors
    if (msg.includes('internal') || msg.includes('server error')) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    // Default to bad request for other errors
    return HttpStatus.BAD_REQUEST;
  }
}
