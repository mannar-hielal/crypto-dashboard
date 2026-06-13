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

    // 🔧 Dev fallback: log to stdout so you can test the flow without a real key.
    // 🔐 Gated to non-production — never log raw reset URLs (contain live tokens) in prod.
    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, resetUrl }, '📧 [DEV] Password reset link (no RESEND_API_KEY set)');
      } else {
        logger.warn({ to }, 'RESEND_API_KEY not configured in production — email not sent');
      }
      return;
    }

    const { error } = await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Reset your cryptopapertrade.com password',
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
      // 🔐 Log server-side only — do not throw. Callers (e.g. /forgot-password) must
      //    return the same response regardless of delivery outcome to prevent enumeration.
      logger.error({ err: error, to }, 'Failed to send password reset email');
    }
  },

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const client = getResend();

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, verificationUrl }, '📧 [DEV] Email verification link (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Verify your cryptopapertrade.com email',
      html: `
        <h2>Welcome to cryptopapertrade.com!</h2>
        <p>Please verify your email address by clicking the link below. This link expires in <strong>24 hours</strong>.</p>
        <p>
          <a href="${verificationUrl}"
             style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
            Verify Email
          </a>
        </p>
        <hr/>
        <small>If you did not create an account, you can safely ignore this email.</small>
      `,
    });
  },

  async sendEmailChangeVerification(to: string, verificationUrl: string): Promise<void> {
    const client = getResend();

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, verificationUrl }, '📧 [DEV] Email change verification link (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Verify your new email address',
      html: `
        <h2>Email Change Request</h2>
        <p>You requested to change your email address. Please click the link below to verify your new email and complete the update.</p>
        <p>
          <a href="${verificationUrl}"
             style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
            Verify New Email
          </a>
        </p>
        <p><strong>Note:</strong> Once verified, you will be logged out of all active sessions for security.</p>
        <hr/>
        <small>If you did not request this change, please ignore this email.</small>
      `,
    });
  },

  async sendEmailChangedSecurityAlert(to: string, oldEmail: string, newEmail: string): Promise<void> {
    const client = getResend();

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, oldEmail, newEmail }, '📧 [DEV] Email changed security alert (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Security Alert: Your email address has been changed',
      html: `
        <h2>Security Alert</h2>
        <p>The email address associated with your cryptopapertrade.com account has been successfully changed.</p>
        <p><strong>Old Email:</strong> ${oldEmail}</p>
        <p><strong>New Email:</strong> ${newEmail}</p>
        <p>If you did not perform this action, please contact support and reset your password immediately, as your account may be compromised.</p>
      `,
    });
  },

  async sendDeletionRequestedEmail(to: string, username: string, deletionDate: Date): Promise<void> {
    const client = getResend();
    const dateStr = deletionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, username, dateStr }, '📧 [DEV] Deletion requested email (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Account deletion requested — cryptopapertrade.com',
      html: `
        <h2>Hi ${username},</h2>
        <p>As requested, your account has been scheduled for permanent deletion on <strong>${dateStr}</strong>.</p>
        <p>During this 30-day window, you can continue to log in and use the platform. If you change your mind, you can cancel the deletion at any time from your account settings.</p>
        <p>If you did not request this, please log in immediately to cancel the request and change your password.</p>
      `,
    });
  },

  async sendDeletionCancelledEmail(to: string, username: string): Promise<void> {
    const client = getResend();

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, username }, '📧 [DEV] Deletion cancelled email (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Account deletion cancelled — cryptopapertrade.com',
      html: `
        <h2>Hi ${username},</h2>
        <p>Your account deletion request has been cancelled. Your account is now fully restored and will no longer be deleted.</p>
      `,
    });
  },

  async sendDeletionWarningEmail(to: string, username: string, deletionDate: Date): Promise<void> {
    const client = getResend();
    const dateStr = deletionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, username, dateStr }, '📧 [DEV] Deletion warning email (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'IMPORTANT: Your account will be deleted in 7 days',
      html: `
        <h2>Hi ${username},</h2>
        <p>This is a reminder that your cryptopapertrade.com account is scheduled for permanent deletion in <strong>7 days</strong> on <strong>${dateStr}</strong>.</p>
        <p>Once deleted, all your data will be permanently and irreversibly removed. If you wish to keep your account, please log in and cancel the deletion request now.</p>
      `,
    });
  },

  async sendDeletionCompletedEmail(to: string, username: string): Promise<void> {
    const client = getResend();

    if (!client) {
      if (config.nodeEnv !== 'production') {
        logger.info({ to, username }, '📧 [DEV] Deletion completed email (no RESEND_API_KEY set)');
      }
      return;
    }

    await client.emails.send({
      from: config.resendFromEmail,
      to,
      subject: 'Your account has been deleted',
      html: `
        <h2>Hi ${username},</h2>
        <p>As requested, your cryptopapertrade.com account and all associated personal data have been permanently deleted.</p>
        <p>We're sorry to see you go. If you ever change your mind, you're always welcome to register a new account.</p>
      `,
    });
  },
};
