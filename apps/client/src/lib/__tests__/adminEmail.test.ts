import { describe, expect, it } from 'vitest';
import { isAdminEmail } from '@/lib/adminEmail';

// VITE_ADMIN_EMAIL is "admin@example.com" in vitest.config.ts
describe('isAdminEmail', () => {
  it('should match the admin address however it is cased or padded', () => {
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail('  Admin@Example.COM ')).toBe(true);
  });

  it('should not match another address, nothing, or an empty string', () => {
    expect(isAdminEmail('someone@example.com')).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });
});
