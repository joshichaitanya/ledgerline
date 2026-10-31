import { API_GATEWAY_URL } from './api';
import { AuthResponse } from '../types/auth';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

// credentials: 'include' on every call here (not the general-purpose
// authFetch used elsewhere) - these are the only endpoints that set, send,
// or clear the httpOnly refresh-token cookie, and a cross-origin request
// (web-app and api-gateway are different origins) won't send/receive
// cookies at all without it.

export async function signUp(input: { name: string; email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch(`${API_GATEWAY_URL}/signup`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to sign up'));
  }

  return response.json();
}

export async function logIn(input: { email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch(`${API_GATEWAY_URL}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to log in'));
  }

  return response.json();
}

// No refreshToken argument - it's sent automatically via the httpOnly
// cookie, not something this code ever gets to see.
export async function refreshTokens(): Promise<{ accessToken: string }> {
  const response = await fetch(`${API_GATEWAY_URL}/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to refresh session'));
  }

  return response.json();
}

export async function logOut(accessToken: string): Promise<void> {
  await fetch(`${API_GATEWAY_URL}/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Best-effort: even if this fails (e.g. token already expired), the
  // caller clears local storage regardless - the user is logged out
  // client-side either way.
}

export async function changePassword(
  accessToken: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  const response = await fetch(`${API_GATEWAY_URL}/change-password`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to change password'));
  }
}
