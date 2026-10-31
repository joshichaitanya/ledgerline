import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from './types';

// Purely stateless: checks the JWT's signature and expiry only, no
// database lookup. That's enough here because access tokens are
// short-lived (15 minutes, see auth-service) - there's no separate
// "has this been revoked early" state to check, unlike a refresh token
// (which auth-service tracks in its own refresh_tokens table instead).
export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    try {
      req.auth = jwt.verify(token, jwtSecret) as TokenPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    next();
  };
}
