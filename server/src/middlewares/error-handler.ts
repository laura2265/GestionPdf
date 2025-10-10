import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('ERROR_HANDLER:', err);
  const status = err?.statusCode ?? err?.status ?? 500;
  res.status(status).json({
    message: err?.message ?? 'Internal Server Error',
    code: err?.code,
  });
}
