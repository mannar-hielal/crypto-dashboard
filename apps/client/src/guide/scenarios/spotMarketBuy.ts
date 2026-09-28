/**
 * "Your first Spot market order" — test plan cases 14.6.1 and 14.6.8; the worked example of
 * docs/TEST_IMPLEMENTATION_PLAN.md F5. Numbers at the fake feed's ask 50,000.
 */

import { defineScenario } from '../scenario';
import { chooseType, enterAmount, openMarket, openTab, submit } from '../steps';

export const spotMarketBuy = defineScenario({
  id: 'spot-market-buy',
  title: 'Your first Spot market order',
  caseIds: ['14.6.1', '14.6.8'],
  startUrl: '/dashboard/spot/BTC/USDT',
  preconditions: [
    { kind: 'signedIn' },
    { kind: 'freshAccount' },
    { kind: 'quote', category: 'spot', symbol: 'BTCUSDT', bid: 49_999.9, ask: 50_000 },
  ],
  tags: ['@smoke', '@mobile'],
  tour: { stage: 1, order: 1 },
  steps: [
    openMarket('spot', { expect: [{ anchor: 'trade.leverage-chip', visible: false }] }),
    {
      action: 'observe',
      anchor: 'trade.side.buy',
      expect: [{ anchor: 'trade.side.buy', text: /50,000/ }],
      explain:
        'Buy shows the best ask — the lowest price a seller accepts right now. A market buy fills there.',
      liveNote:
        'On live prices the Buy button shows the current ask; it is one tick above Sell most of the time.',
    },
    chooseType('market'),
    enterAmount('0.1', 'coin', {
      explain: 'Buy 0.1 BTC. The form shows what it costs before you commit.',
      expect: [{ anchor: 'trade.preview.cost', text: /5,000\.00/ }],
      liveNote: 'Cost ≈ 0.1 × the Buy price.',
    }),
    submit({ expect: [{ anchor: 'trade.amount', value: '' }] }),
    openTab('assets', {
      explain: 'You received 0.0999 BTC: Spot takes its 0.1% fee in the coin you receive.',
      expect: [
        { anchor: 'assets.row.free', key: 'USDT', text: '5,000.00' },
        { anchor: 'assets.row.free', key: 'BTC', text: '0.0999' },
        { anchor: 'assets.row.avg-cost', key: 'BTC', text: '50,050.05' },
      ],
      liveNote:
        'BTC received = 0.1 × 0.999; avg cost = USDT spent ÷ BTC received; USDT = 10,000 − 0.1 × ask.',
    }),
  ],
});
