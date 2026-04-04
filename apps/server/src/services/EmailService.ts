/**
 * EmailService
 *
 * Wraps Resend for transactional emails.
 * In development (no RESEND_API_KEY set), falls back to logging the reset
 * link to stdout — no real email is sent, no API key needed locally.
 */

import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Lazy-initialise — avoids crashing on startup if key is missing in dev
let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!config.resendApiKey) return null;
  if (!resend) resend = new Resend(config.resendApiKey);
  return resend;
}

export const EmailService = {
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const client = getResend();

    // 🔧 Dev fallback: log to stdout so you can test the flow without a real key
    if (!client) {
      logger.info({ to, resetUrl }, '📧 [DEV] Password reset link (no RESEND_API_KEY set)');
      return;
    }

    const { error } = await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Reset your Crypto Dashboard password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <p>
          <a href="${resetUrl}"
             style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
            Reset Password
          </a>
        </p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <hr/>
        <small>This link expires in 1 hour and can only be used once.</small>
      `,
    });

    if (error) {
      // 🔐 Log server-side but never expose delivery errors to the caller
      logger.error({ err: error, to }, 'Failed to send password reset email');
      throw new Error('Email delivery failed');
    }
  },
};
