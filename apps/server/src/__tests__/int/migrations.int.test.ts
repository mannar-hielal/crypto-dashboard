/**
 * Migrations on a real Postgres (T2i, test plan roadmap P1): the database globalSetup rebuilt
 * from empty through every migration must be up to date and match prisma/schema.prisma exactly.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SERVER_DIR, prisma } from './prismaCli.js';
import { integrationPrisma } from './db.js';
import { Prisma } from '../../../generated/prisma/client.js';

const url = process.env.DATABASE_URL as string;
const db = integrationPrisma();

afterAll(async () => {
  await db.$disconnect();
});

describe('migrations from an empty database', () => {
  it('applies every committed migration and reports the schema up to date', () => {
    const status = prisma(['migrate', 'status'], url);
    expect(status.output).toContain('Database schema is up to date');
    expect(status.status).toBe(0);
  });

  it('leaves no drift: the migrated schema equals prisma/schema.prisma', () => {
    // --exit-code: 0 = no difference, 2 = a schema change without its migration
    const diff = prisma(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      url
    );
    expect(diff.output).not.toMatch(/\[\+\]|\[-\]|\[\*\]/);
    expect(diff.status).toBe(0);
  });

  it('creates a table for every model in the schema', async () => {
    const models = Object.values(Prisma.ModelName);
    expect(models.length).toBeGreaterThan(10);
    const delegates = db as unknown as Record<string, { count(): Promise<number> }>;
    for (const model of models) {
      const delegate = delegates[model.charAt(0).toLowerCase() + model.slice(1)];
      // A missing table would throw here (P2021); a fresh reset leaves every table empty
      await expect(delegate.count(), model).resolves.toBe(0);
    }
  });

  it('has a migration folder for every applied migration', () => {
    // A fixed path inside the repo (no input reaches it)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const folders = readdirSync(join(SERVER_DIR, 'prisma/migrations'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const status = prisma(['migrate', 'status'], url);
    expect(status.output).toContain(`${folders.length} migrations found`);
  });
});
