export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export const apiSuccess = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

export const apiFailure = (code: string, message: string): ApiFailure => ({
  success: false,
  error: { code, message }
});
