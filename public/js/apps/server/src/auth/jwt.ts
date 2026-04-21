// ============================================================
// AUTH — JWT Utilities
// ============================================================

import jwt from 'jsonwebtoken';
import type { JWTPayload } from './auth.dto';

const JWT_SECRET     = process.env.JWT_SECRET     ?? 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'change-me-in-production') {
  throw new Error('❌ JWT_SECRET não definido em produção.');
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new Error('TOKEN_EXPIRED');
    throw new Error('TOKEN_INVALID');
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
