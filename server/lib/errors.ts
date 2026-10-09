export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED') { super(message); }
}
export function ensure(condition: unknown, status: number, message: string, code?: string): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}
