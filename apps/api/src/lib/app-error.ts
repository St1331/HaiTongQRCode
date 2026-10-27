export class AppError extends Error {
  public readonly code: string;
  public readonly details: unknown;
  public readonly statusCode: number;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
