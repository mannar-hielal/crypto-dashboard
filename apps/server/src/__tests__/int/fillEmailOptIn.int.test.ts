/**
 * The fill-e-mail opt-in on a real Postgres (plan unit U8): off by default, the consent time is
 * stored with the yes, and the unsubscribe update is a no-op for an account that no longer exists.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, createUser, integrationPrisma } from './db.js';

const db = integrationPrisma();

describe('User.fillEmailOptIn (Postgres)', () => {
  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await db.$disconnect();
  });

  it('is off, with no consent time, for a new account', async () => {
    const id = await createUser(db);
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    expect(user.fillEmailOptIn).toBe(false);
    expect(user.fillEmailOptInAt).toBeNull();
  });

  it('stores the consent time with a yes, and clears both with a no', async () => {
    const id = await createUser(db);
    const at = new Date('2026-10-12T10:00:00Z');
    await db.user.update({ where: { id }, data: { fillEmailOptIn: true, fillEmailOptInAt: at } });
    expect((await db.user.findUniqueOrThrow({ where: { id } })).fillEmailOptInAt).toEqual(at);

    await db.user.updateMany({
      where: { id },
      data: { fillEmailOptIn: false, fillEmailOptInAt: null },
    });
    const off = await db.user.findUniqueOrThrow({ where: { id } });
    expect(off.fillEmailOptIn).toBe(false);
    expect(off.fillEmailOptInAt).toBeNull();
  });

  it('treats an unsubscribe for a deleted account as a no-op, not an error', async () => {
    const result = await db.user.updateMany({
      where: { id: 'no-such-user' },
      data: { fillEmailOptIn: false, fillEmailOptInAt: null },
    });
    expect(result.count).toBe(0);
  });
});
