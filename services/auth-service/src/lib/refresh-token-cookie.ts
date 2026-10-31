import { Request, Response } from 'express';

// The refresh token lives in an httpOnly cookie, not the response body or
// localStorage - JS on the page can't read it at all, so an XSS bug can't
// exfiltrate it (unlike the access token, which is short-lived enough that
// staying in-memory/localStorage is an accepted tradeoff - see
// infrastructure/api-gateway/README.md and docs/adr/ for the reasoning).
const COOKIE_NAME = 'refreshToken';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches REFRESH_TOKEN_EXPIRY_SECONDS in auth.service.ts

// SameSite=None + Secure is required for the cookie to be sent on a
// cross-origin request at all (web-app and api-gateway are different
// origins - different ports even in local dev). Secure normally means
// HTTPS-only, but Chrome/Firefox both treat "localhost" as a secure
// context, so this still works for local dev without HTTPS as long as
// web-app is reached via http://localhost:... - it won't work over a plain
// http:// LAN IP or a non-localhost hostname without HTTPS.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  path: '/',
};

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(COOKIE_NAME, refreshToken, { ...COOKIE_OPTIONS, maxAge: MAX_AGE_SECONDS * 1000 });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
}

export function getRefreshTokenFromCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null;
}
