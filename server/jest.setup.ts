// Provide minimum-viable env values so config/env zod validation passes
// during tests. Tests should mock anything that actually hits these resources.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-test-secret';
process.env.CREDENTIALS_ENCRYPTION_KEY =
  process.env.CREDENTIALS_ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
