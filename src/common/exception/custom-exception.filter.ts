import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class CustomExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const { statusCode, message, details, errorCode } =
      this.normalizeException(exception);

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errorCode ? { errorCode } : {}),
      ...(details ? { details } : {}),
      path: request?.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    message: string;
    details?: any;
    errorCode?: string;
  } {
    // Standard NestJS / Http exceptions
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse() as any;

      if (typeof payload === 'string') {
        return { statusCode, message: payload };
      }

      if (payload && typeof payload === 'object') {
        const rawMessage = payload.message ?? exception.message;
        const message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : String(rawMessage || 'Request failed');
        const details = Array.isArray(payload.message)
          ? payload.message
          : payload.details;
        const errorCode = payload.code || payload.error;

        return { statusCode, message, details, errorCode };
      }

      return {
        statusCode,
        message: exception.message || 'Request failed',
      };
    }

    const err = exception as any;
    const code = err?.code as string | undefined;
    const msg = String(err?.message || 'Internal server error');

    // Prisma known request errors
    if (code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        message: 'Duplicate value violates unique constraint',
        details: err?.meta,
        errorCode: code,
      };
    }

    if (code === 'P2025') {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Requested resource was not found',
        details: err?.meta,
        errorCode: code,
      };
    }

    if (code === 'P2003' || code === 'P2014') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid relation or referenced resource',
        details: err?.meta,
        errorCode: code,
      };
    }

    // Prisma connection-ish errors
    if (code === 'P1001' || code === 'P1008') {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database service is temporarily unavailable',
        errorCode: code,
      };
    }

    // Network and timeout patterns
    if (
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED'
    ) {
      return {
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        message: 'Upstream service timeout',
        errorCode: code,
      };
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return {
        statusCode: HttpStatus.BAD_GATEWAY,
        message: 'Upstream service host could not be resolved',
        errorCode: code,
      };
    }

    // Syntax errors in request/body parsing
    if (exception instanceof SyntaxError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid request payload format',
      };
    }

    // Generic fallback
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: msg || 'Internal server error',
    };
  }
}
