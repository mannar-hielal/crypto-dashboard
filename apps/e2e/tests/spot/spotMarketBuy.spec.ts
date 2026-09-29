import { test } from '../../fixtures';
import { runScenario } from '../../steps/runScenario';
import { spotMarketBuy } from '@guide/scenarios/spotMarketBuy';

test(`[14.6.1][14.6.8] ${spotMarketBuy.title} @smoke`, async ({
  page,
  seededUser,
  feed,
  hooks,
}) => {
  await runScenario(page, spotMarketBuy, { user: seededUser, feed, hooks });
});
