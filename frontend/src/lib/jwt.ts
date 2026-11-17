/** Decodes base64url text (used by JWTs and by the Google redirect fragment) into a UTF-8 string. */
export function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * True only when the token clearly carries an `exp` in the past. A token we can't read is NOT
 * treated as expired: the server is the authority and a 401 will log the user out anyway.
 */
export function isTokenExpired(token: string, now: number = Date.now()): boolean {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= now;
  } catch {
    return false;
  }
}
