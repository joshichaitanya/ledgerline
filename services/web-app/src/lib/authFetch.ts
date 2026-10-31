import { refreshTokens } from './auth';
import { clearStoredAuth, getStoredAuth, setStoredAccessToken } from './authStorage';

// Wraps fetch with the current access token, and if the backend rejects it
// with a 401 (expired), tries exactly one refresh + retry before giving up.
// The refresh itself needs no token passed in here - it's sent via the
// httpOnly cookie automatically (see lib/auth.ts's refreshTokens).
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const stored = getStoredAuth();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      ...(stored ? { Authorization: `Bearer ${stored.accessToken}` } : {}),
    },
  });

  if (response.status !== 401 || !stored) {
    return response;
  }

  try {
    const refreshed = await refreshTokens();
    setStoredAccessToken(refreshed.accessToken);
    return fetch(input, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${refreshed.accessToken}` },
    });
  } catch {
    // Refresh token is also invalid/expired (or its cookie is gone) -
    // nothing left to do but drop the session. Callers see the original
    // 401 response either way.
    clearStoredAuth();
    return response;
  }
}
