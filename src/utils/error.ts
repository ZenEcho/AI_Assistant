/**
 * Returns a human-readable message string for any thrown value.
 * - For Error instances: returns `error.message`
 * - For everything else: returns `String(error)`
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns a stack trace string for any thrown value.
 * - For Error instances: returns `error.stack` (may be `undefined` in some environments)
 * - For everything else: returns `String(error)`
 *
 * Compatible with the `errorStack?: string | null` logger field.
 */
export function toErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : String(error);
}
