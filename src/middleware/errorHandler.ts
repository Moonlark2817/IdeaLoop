import type {
  ErrorRequestHandler,
  RequestHandler,
} from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
    },
  });
};

export function createErrorHandler(
  production: boolean
): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const candidate = error as {
      status?: unknown;
      type?: unknown;
      code?: unknown;
    } | null;

    if (candidate?.code === '23505') {
      res.status(409).json({
        error: {
          message: 'Username or email is already in use',
        },
      });

      return;
    }

    if (candidate?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: {
          message: 'Image must be 5 MB or smaller',
        },
      });

      return;
    }

    if (candidate?.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: {
          message: 'Only one image can be uploaded at a time',
        },
      });

      return;
    }

    const status =
      typeof candidate?.status === 'number' &&
      Number.isInteger(candidate.status) &&
      candidate.status >= 400 &&
      candidate.status < 500
        ? candidate.status
        : 500;

    if (status >= 500) {
      console.error('Request failed:', error);
    }

    const message =
      status === 500 && production
        ? 'Internal server error'
        : candidate?.type === 'entity.parse.failed'
          ? 'Invalid JSON body'
          : error instanceof Error
            ? error.message
            : 'Internal server error';

    res.status(status).json({
      error: {
        message,
      },
    });
  };
}
