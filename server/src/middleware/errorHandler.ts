import { Request, Response, NextFunction } from 'express';

export interface ApiError {
  status: number;
  message: string;
  details?: any;
}

export function errorHandler(err: Error & Partial<ApiError>, _req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (status === 500) {
    console.error('[ErrorHandler]', err);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
