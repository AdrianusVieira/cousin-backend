export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ValidationError extends ApiError {
  constructor(fields: Record<string, string>, message = "Validation failed") {
    super(422, "VALIDATION_ERROR", message, fields);
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
