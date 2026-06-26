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

type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

function logMissingResendKey(action: string, context: Record<string, unknown>) {
  if (config.nodeEnv !== 'production') {
    logger.info(context, `📧 [DEV] ${action} (no RESEND_API_KEY set)`);
    return;
  }

  // 🔐 Never log token-bearing URLs in production logs.
  const safeContext = { ...context };
  for (const key of Object.keys(safeContext)) {
    // key from Object.keys — safe iteration
    // eslint-disable-next-line security/detect-object-injection
    if (key.toLowerCase().endsWith('url')) delete safeContext[key];
  }

  logger.warn(
    safeContext,
    `RESEND_API_KEY not configured in production — ${action.toLowerCase()} not sent`
  );
}

async function sendEmail(
  client: Resend,
  payload: EmailPayload,
  errorMessage: string,
  context: Record<string, unknown>
): Promise<void> {
  const { error } = await client.emails.send(payload);

  if (error) {
    logger.error({ err: error, ...context }, errorMessage);
  }
}

export const EmailService = {
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const client = getResend();

    // 🔧 Dev fallback: log to stdout so you can test the flow without a real key.
    if (config.nodeEnv !== 'production') {
      logger.info({ to, resetUrl }, '📧 [DEV] Password reset link');
    }

    if (!client) {
      if (config.nodeEnv === 'production') {
        logMissingResendKey('Password reset link', { to });
      }
      return;
    }

    await sendEmail(
      client,
      {
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
      },
      'Failed to send password reset email',
      { to }
    );
  },

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const client = getResend();

    if (!client) {
      logMissingResendKey('Email verification link', { to, verificationUrl });
      return;
    }

    await sendEmail(
      client,
      {
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
      },
      'Failed to send verification email',
      { to }
    );
  },

  async sendEmailChangeVerification(to: string, verificationUrl: string): Promise<void> {
    const client = getResend();

    if (!client) {
      logMissingResendKey('Email change verification link', { to, verificationUrl });
      return;
    }

    await sendEmail(
      client,
      {
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
      },
      'Failed to send email change verification',
      { to }
    );
  },

  async sendEmailChangedSecurityAlert(
    to: string,
    oldEmail: string,
    newEmail: string
  ): Promise<void> {
    const client = getResend();

    if (!client) {
      logMissingResendKey('Email changed security alert', { to, oldEmail, newEmail });
      return;
    }

    await sendEmail(
      client,
      {
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
      },
      'Failed to send email changed security alert',
      { to, oldEmail, newEmail }
    );
  },

  async sendDeletionRequestedEmail(
    to: string,
    username: string,
    deletionDate: Date
  ): Promise<void> {
    const client = getResend();
    const dateStr = deletionDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (!client) {
      logMissingResendKey('Deletion requested email', { to, username, dateStr });
      return;
    }

    await sendEmail(
      client,
      {
        from: config.resendFromEmail,
        to,
        subject: 'Account deletion requested — cryptopapertrade.com',
        html: `
        <h2>Hi ${username},</h2>
        <p>This email confirms that your account has been placed into a <strong>30-day deletion period</strong> per our account security policy and your right to erasure under GDPR/nDSG.</p>
        
        <p>Your account is scheduled for permanent removal on <strong>${dateStr}</strong>.</p>
        
        <p><strong>What happens next?</strong><br/>
        During this 30-day window, your data remains intact and you can cancel this request at any time by logging in. After this period, your profile, paper trading history, and personal data will be <strong>permanently purged</strong> from our active databases. Some technical logs may persist for up to 60 days in our backups before being overwritten.</p>
        
        <p>If you wish to keep a copy of your trading data, please ensure you export or record your history before the deletion date.</p>
        
        <p>If you did not request this deletion, please log in immediately to secure your account or contact our privacy team at info@cryptopapertrade.com.</p>
      `,
      },
      'Failed to send deletion requested email',
      { to, username, dateStr }
    );
  },

  async sendDeletionCancelledEmail(to: string, username: string): Promise<void> {
    const client = getResend();

    if (!client) {
      logMissingResendKey('Deletion cancelled email', { to, username });
      return;
    }

    await sendEmail(
      client,
      {
        from: config.resendFromEmail,
        to,
        subject: 'Account deletion cancelled — cryptopapertrade.com',
        html: `
        <h2>Hi ${username},</h2>
        <p>Your account deletion request has been cancelled. Your account is now fully restored and will no longer be deleted.</p>
      `,
      },
      'Failed to send deletion cancelled email',
      { to, username }
    );
  },

  async sendDeletionWarningEmail(to: string, username: string, deletionDate: Date): Promise<void> {
    const client = getResend();
    const dateStr = deletionDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (!client) {
      logMissingResendKey('Deletion warning email', { to, username, dateStr });
      return;
    }

    await sendEmail(
      client,
      {
        from: config.resendFromEmail,
        to,
        subject: 'IMPORTANT: Your account will be deleted in 7 days',
        html: `
        <h2>Hi ${username},</h2>
        <p>This is a reminder that your cryptopapertrade.com account is scheduled for permanent deletion in <strong>7 days</strong> on <strong>${dateStr}</strong>.</p>
        <p>Once deleted, all your data will be permanently and irreversibly removed. If you wish to keep your account, please log in and cancel the deletion request now.</p>
      `,
      },
      'Failed to send deletion warning email',
      { to, username, dateStr }
    );
  },

  async sendDeletionCompletedEmail(to: string, username: string): Promise<void> {
    const client = getResend();

    if (!client) {
      logMissingResendKey('Deletion completed email', { to, username });
      return;
    }

    await sendEmail(
      client,
      {
        from: config.resendFromEmail,
        to,
        subject: 'Your account has been deleted',
        html: `
        <h2>Hi ${username},</h2>
        <p>As requested, your cryptopapertrade.com account and all associated personal data have been permanently deleted.</p>
        <p>We're sorry to see you go. If you ever change your mind, you're always welcome to register a new account.</p>
      `,
      },
      'Failed to send deletion completed email',
      { to, username }
    );
  },
};
