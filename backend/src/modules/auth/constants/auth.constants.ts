import { CookieOptions, Response } from 'express';

/**
 * Standard cookie key identifier for the Refresh Token.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Default duration for refresh token cookie in milliseconds (7 days).
 */
export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Secure HTTP Cookie configuration adhering to OWASP guidelines.
 */
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
};

/**
 * Sets the HttpOnly refresh token cookie on the HTTP response.
 *
 * @param res - Native Express response object (injected via @Res({ passthrough: true }))
 * @param token - Raw JWT Refresh Token string
 */
export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

/**
 * Clears the HttpOnly refresh token cookie from the client browser.
 *
 * @param res - Native Express response object (injected via @Res({ passthrough: true }))
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: 0,
  });
}
