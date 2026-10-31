import { randomUUID } from 'crypto';
import { TokenPayload } from '@scalable-demo/toolkit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { User } from '../types/user';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Kong's JWT plugin (see infrastructure/api-gateway/) looks up which
// consumer/secret to verify against by this claim - it has to match the
// `key` on the Kong consumer's jwt credential exactly.
const TOKEN_ISSUER = 'scalable-demo';

export { TokenPayload };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class EmailAlreadyRegisteredError extends Error {}
export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}

export class AuthService {
  constructor(
    private pool: Pool,
    private jwtSecret: string
  ) {}

  async signUp(input: { name: string; email: string; password: string }): Promise<{ user: User } & TokenPair> {
    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [input.email]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new EmailAlreadyRegisteredError(`Email already registered: ${input.email}`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const result = await this.pool.query<User>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [input.name, input.email, passwordHash]
    );

    const user = result.rows[0];
    return { user, ...(await this.issueTokenPair(user)) };
  }

  async logIn(input: { email: string; password: string }): Promise<{ user: User } & TokenPair> {
    const user = await this.getUserWithPasswordHash(input.email);
    if (!user) {
      throw new InvalidCredentialsError('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError('Invalid email or password');
    }

    const { password_hash: _passwordHash, ...publicUser } = user;
    return { user: publicUser, ...(await this.issueTokenPair(publicUser)) };
  }

  // Verifies the refresh token, then rotates it: the old one is deleted and
  // a new access/refresh pair is issued. Rotating (instead of reusing the
  // same refresh token) means a stolen-and-replayed refresh token stops
  // working the moment the real client refreshes next, instead of staying
  // valid for its whole 30-day life.
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyToken(refreshToken);
    if (!payload) {
      throw new InvalidRefreshTokenError('Invalid or expired refresh token');
    }

    const deleted = await this.pool.query('DELETE FROM refresh_tokens WHERE jti = $1 RETURNING user_id', [
      payload.jti,
    ]);
    const userId = deleted.rows[0]?.user_id;
    if (userId === undefined) {
      throw new InvalidRefreshTokenError('Refresh token has already been used or revoked');
    }

    return this.issueTokenPair({ id: userId });
  }

  // "Logging out" a short-lived access token isn't necessary - it expires
  // in 15 minutes on its own. What actually needs revoking is the refresh
  // token, since that's the thing that can mint new access tokens for the
  // next 30 days. Deleting its row is the revocation.
  async logOut(refreshToken: string, userId: number): Promise<void> {
    const payload = this.verifyToken(refreshToken);
    if (!payload) {
      return;
    }
    await this.pool.query('DELETE FROM refresh_tokens WHERE jti = $1 AND user_id = $2', [payload.jti, userId]);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const result = await this.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new InvalidCredentialsError('User not found');
    }

    const passwordMatches = await bcrypt.compare(currentPassword, row.password_hash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

    // Changing the password is a "log out everywhere" moment - revoke every
    // outstanding refresh token for this user, not just the current one.
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }

  private async getUserWithPasswordHash(email: string): Promise<(User & { password_hash: string }) | null> {
    const result = await this.pool.query<User & { password_hash: string }>(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  private async issueTokenPair(user: Pick<User, 'id'>): Promise<TokenPair> {
    const accessToken = jwt.sign({ userId: user.id, jti: randomUUID(), iss: TOKEN_ISSUER }, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    });

    const refreshJti = randomUUID();
    const refreshToken = jwt.sign({ userId: user.id, jti: refreshJti, iss: TOKEN_ISSUER }, this.jwtSecret, {
      expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS,
    });
    await this.pool.query(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at)
       VALUES ($1, $2, now() + interval '${REFRESH_TOKEN_EXPIRY_SECONDS} seconds')`,
      [refreshJti, user.id]
    );

    return { accessToken, refreshToken };
  }

  private verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  }
}
