import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * 🔐 The "stop e-mailing me" link carried by every fill e-mail: `<userId>.<mac>`. Not a JWT on
 * purpose — it shares the signing secret, and a JWT-shaped token would pass `app.authenticate` as an
 * access token. This is an HMAC over a purpose string and the user id, so it can do one thing:
 * switch that user's fill e-mails off. It carries no expiry: an old e-mail's link must keep working.
 */
const PURPOSE = 'fill-email-unsubscribe:v1';

function mac(userId: string): string {
  return createHmac('sha256', config.jwtSecret).update(`${PURPOSE}:${userId}`).digest('hex');
}

export function makeUnsubscribeToken(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

/** The user id the token was made for, or null for anything else */
export function readUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'utf8');
  const expected = Buffer.from(mac(userId), 'utf8');
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}
