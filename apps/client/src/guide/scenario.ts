/**
 * Scenario steps — one definition used three ways (docs/TEST_IMPLEMENTATION_PLAN.md F5):
 * Playwright drives them (apps/e2e, planned), the plan prints them as the manual UI reproduction,
 * and the guided tour shows `explain` as a bubble on the step's anchor.
 *
 * Pure types and data: no React, no Playwright, so both the client (lazy-loaded tour) and the e2e
 * package can import scenarios.
 */

import type { GuideAnchor } from '@/lib/guideAnchors';

export type StepAction = 'navigate' | 'click' | 'type' | 'select' | 'observe' | 'control';

export type Expectation =
  | { anchor: GuideAnchor; key?: string; text: string | RegExp } // visible text
  | { anchor: GuideAnchor; key?: string; visible: boolean }
  | { anchor: GuideAnchor; key?: string; value: string } // an input's value
  | { anchor: GuideAnchor; key?: string; enabled: boolean }
  | { url: string | RegExp };

export interface ScenarioStep {
  /** `<scenario id>.<n>` — stable, cited in bug reports */
  id: string;
  action: StepAction;
  /** The element acted on and the bubble's target (not for navigate / control) */
  anchor?: GuideAnchor;
  /** `data-guide-key` of a row anchor */
  key?: string;
  /** Text to type, option to pick, URL, or the control command */
  value?: string;
  /** Asserted by Playwright; shown as "Expect" in the manual steps */
  expect?: Expectation[];
  /** One or two learner-friendly sentences: the bubble text */
  explain: string;
  /** How to judge the result on live prices (formula / tolerance) */
  liveNote?: string;
  /** Price-control steps: skipped by the tour, marked "(fake feed)" in the doc */
  testOnly?: boolean;
}

export type Precondition =
  | { kind: 'signedIn'; marginMode?: 'ISOLATED_MARGIN' | 'REGULAR_MARGIN' }
  | { kind: 'freshAccount' }
  | {
      kind: 'quote';
      category: 'spot' | 'linear';
      symbol: string;
      bid: number;
      ask: number;
      mark?: number;
    };

export type ScenarioTag = '@smoke' | '@full' | '@prod' | '@mobile';

export interface Scenario {
  /** kebab-case, e.g. 'spot-market-buy' */
  id: string;
  /** The tour title, e.g. 'Your first Spot market order' */
  title: string;
  /** Part B case IDs of docs/TRADING_TEST_PLAN.md this scenario covers */
  caseIds: string[];
  /** Path the scenario starts on, e.g. '/dashboard/spot/BTC/USDT' */
  startUrl: string;
  preconditions: Precondition[];
  steps: ScenarioStep[];
  tags: ScenarioTag[];
  /** Offered as a guided tour at this learning stage (TRADING_TEST_PLAN Part B); absent = not a tour */
  tour?: { stage: 0 | 1 | 2 | 3 | 4 | 5; order: number };
}

/** A step before it is numbered by `defineScenario`. */
export type StepDraft = Omit<ScenarioStep, 'id'>;

/**
 * Build a scenario from step drafts (builders may return one step or several): the steps are
 * flattened and numbered `<id>.1`, `<id>.2`, … in order.
 */
export function defineScenario(
  s: Omit<Scenario, 'steps'> & { steps: Array<StepDraft | StepDraft[]> }
): Scenario {
  const steps = s.steps.flat().map((step, i) => ({ id: `${s.id}.${i + 1}`, ...step }));
  return { ...s, steps };
}
