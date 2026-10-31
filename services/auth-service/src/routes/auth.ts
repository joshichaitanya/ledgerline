import { requireAuth } from '@scalable-demo/toolkit';
import { Router } from 'express';
import { pool } from '../db';
import { clearRefreshTokenCookie, getRefreshTokenFromCookie, setRefreshTokenCookie } from '../lib/refresh-token-cookie';
import {
  AuthService,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../services/auth.service';

const router = Router();
const jwtSecret = process.env.JWT_SECRET || '';
const authService = new AuthService(pool, jwtSecret);
const auth = requireAuth(jwtSecret);

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'name, email and password are required' });
      return;
    }

    const { user, accessToken, refreshToken } = await authService.signUp({ name, email, password });
    setRefreshTokenCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('Failed to sign up:', error);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    const { user, accessToken, refreshToken } = await authService.logIn({ email, password });
    setRefreshTokenCookie(res, refreshToken);
    res.status(200).json({ user, accessToken });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error('Failed to log in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromCookie(req);
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token cookie' });
      return;
    }

    const tokens = await authService.refresh(refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    res.status(200).json({ accessToken: tokens.accessToken });
  } catch (error) {
    if (error instanceof InvalidRefreshTokenError) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ error: error.message });
      return;
    }
    console.error('Failed to refresh token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromCookie(req);
    if (refreshToken) {
      await authService.logOut(refreshToken, req.auth!.userId);
    }
    clearRefreshTokenCookie(res);
    res.sendStatus(204);
  } catch (error) {
    console.error('Failed to log out:', error);
    res.status(500).json({ error: 'Failed to log out' });
  }
});

router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' });
      return;
    }

    await authService.changePassword(req.auth!.userId, currentPassword, newPassword);
    clearRefreshTokenCookie(res);
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error('Failed to change password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
