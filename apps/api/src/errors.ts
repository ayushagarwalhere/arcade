/** An error with an HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const unauthorized = (message = "Sign in to continue") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this") => new HttpError(403, "forbidden", message);
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
