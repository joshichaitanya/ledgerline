import { createContext, useContext, useEffect, useState } from 'react';
import * as authApi from '../lib/auth';
import { clearStoredAuth, getStoredAuth, setStoredAuth } from '../lib/authStorage';
import { AuthUser } from '../types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  logIn: (input: { email: string; password: string }) => Promise<void>;
  logOut: () => Promise<void>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setUser(stored.user);
      setAccessToken(stored.accessToken);
    }
    setLoading(false);
  }, []);

  async function signUp(input: { name: string; email: string; password: string }) {
    const result = await authApi.signUp(input);
    setStoredAuth(result);
    setUser(result.user);
    setAccessToken(result.accessToken);
  }

  async function logIn(input: { email: string; password: string }) {
    const result = await authApi.logIn(input);
    setStoredAuth(result);
    setUser(result.user);
    setAccessToken(result.accessToken);
  }

  async function logOut() {
    if (accessToken) {
      await authApi.logOut(accessToken).catch(() => {
        // Best-effort - clear local state regardless of whether the
        // server-side revocation succeeded.
      });
    }
    clearStoredAuth();
    setUser(null);
    setAccessToken(null);
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    if (!accessToken) throw new Error('Not logged in');
    await authApi.changePassword(accessToken, input);
    // Changing the password revokes every refresh token server-side
    // (see auth-service), including the one this session is using - so
    // this session gets logged out too rather than left holding a
    // refresh token that no longer works.
    await logOut();
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, signUp, logIn, logOut, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
