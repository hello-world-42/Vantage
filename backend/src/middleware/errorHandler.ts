import type { ErrorRequestHandler } from "express";

/**
 * Last middleware in app.ts. Turns any error passed to next(err) into JSON.
 *
 * - Client errors that are safe to show (bad JSON body, body too large) keep
 *   their status and message, e.g. 400 { error: "Request body is not valid JSON." }.
 * - Everything else becomes 500 { error: "Something went wrong." }.
 * - The stack trace, file paths and upstream messages are only logged on the
 *   server, never sent to the browser.
 */
export interface ErrorHandlerOptions {
  /** Where server-side errors are logged. Defaults to console.error; tests pass a stub. */
  logError?: (message: string, error: unknown) => void;
}

interface HttpishError {
  status?: unknown;
  statusCode?: unknown;
  expose?: unknown;
  type?: unknown;
  message?: unknown;
}

function clientStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const { status, statusCode } = error as HttpishError;
  const code = typeof status === "number" ? status : typeof statusCode === "number" ? statusCode : null;
  return code !== null && code >= 400 && code < 500 ? code : null;
}

function clientMessage(error: unknown, status: number): string {
  const { type, expose, message } = error as HttpishError;
  if (type === "entity.parse.failed") return "Request body is not valid JSON.";
  if (type === "entity.too.large") return "Request body is too large.";
  // http-errors (used by express.json) marks messages that are safe to show with expose: true.
  if (expose === true && typeof message === "string" && message) return message;
  return status === 404 ? "Not found" : "Bad request";
}

export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const logError = options.logError ?? ((message, error) => console.error(message, error));

  return (error, req, res, next) => {
    // If a response already started streaming, Express has to close the connection itself.
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = clientStatus(error);
    if (status !== null) {
      res.status(status).json({ error: clientMessage(error, status) });
      return;
    }

    // Path only: query strings can hold one-time secrets (e.g. Google's ?code= on the OAuth callback).
    logError(`[error] ${req.method} ${req.originalUrl.split("?")[0]}`, error);
    res.status(500).json({ error: "Something went wrong." });
  };
}
