import { AuthUser } from '../types/auth';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const USER_KEY = 'auth.user';

// The refresh token is NOT stored here - it lives in an httpOnly cookie set
// by auth-service, invisible to JS entirely (see
// services/auth-service/src/lib/refresh-token-cookie.ts). Only the access
// token and user profile live in localStorage: per-browser, wiped on
// logout/token failure, and readable by any script on the page - acceptable
// for the access token given its short (15 min) lifetime, not for the
// refresh token.
export function getStoredAuth(): { accessToken: string; user: AuthUser } | null {
  if (typeof window === 'undefined') return null;

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const userJson = window.localStorage.getItem(USER_KEY);
  if (!accessToken || !userJson) return null;

  try {
    return { accessToken, user: JSON.parse(userJson) };
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: { accessToken: string; user: AuthUser }): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function setStoredAccessToken(accessToken: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearStoredAuth(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
