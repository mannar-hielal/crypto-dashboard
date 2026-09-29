import { test } from '../../fixtures';
import { runScenario } from '../../steps/runScenario';
import { perpMarketLong } from '@guide/scenarios/perpMarketLong';

test(`[1.1.2][1.1.3][1.1.4][20.4] ${perpMarketLong.title} @smoke @mobile`, async ({
  page,
  seededUser,
  feed,
  hooks,
}) => {
  await runScenario(page, perpMarketLong, { user: seededUser, feed, hooks });
});
