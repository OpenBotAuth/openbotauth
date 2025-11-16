/**
 * Session management utilities
 */

import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Get session expiration date (default: 30 days from now)
 */
export function getSessionExpiration(days: number = 30): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

/**
 * Parse session token from cookie string
 */
export function parseSessionCookie(cookieHeader: string | null, cookieName: string = 'session'): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith(`${cookieName}=`));
  
  if (!sessionCookie) return null;

  return sessionCookie.substring(cookieName.length + 1);
}

/**
 * Create session cookie string
 */
export function createSessionCookie(
  token: string,
  options: {
    name?: string;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
  } = {}
): string {
  const {
    name = 'session',
    maxAge = 30 * 24 * 60 * 60, // 30 days in seconds
    httpOnly = true,
    secure = true,
    sameSite = 'lax',
    path = '/',
  } = options;

  const parts = [
    `${name}=${token}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
  ];

  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');

  return parts.join('; ');
}

/**
 * Create session deletion cookie
 */
export function deleteSessionCookie(name: string = 'session', path: string = '/'): string {
  return `${name}=; Max-Age=0; Path=${path}`;
}

