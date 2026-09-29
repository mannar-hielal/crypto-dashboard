/** Every scenario, for the e2e runner, the tour menu and the consistency tests. */

import type { Scenario } from '../scenario';
import { perpMarketLong } from './perpMarketLong';
import { spotMarketBuy } from './spotMarketBuy';

export const SCENARIOS: readonly Scenario[] = [spotMarketBuy, perpMarketLong];
