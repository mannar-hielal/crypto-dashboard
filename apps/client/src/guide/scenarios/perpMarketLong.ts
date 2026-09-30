/**
 * "Your first long" — open a USDT Perpetual long at isolated 10×, watch it, close it at a profit
 * (test plan cases 1.1.2–1.1.4; docs/UI_REPRODUCTIONS.md Section 1, steps 1–5). Numbers at the
 * fake feed's 50,000 / 51,000; the worked example of Stage 3.
 */

import { defineScenario } from '../scenario';
import { chooseType, enterAmount, openTab, setIsolated, submit } from '../steps';

export const perpMarketLong = defineScenario({
  id: 'perp-market-long',
  title: 'Your first long',
  caseIds: ['1.1.2', '1.1.3', '1.1.4'],
  startUrl: '/dashboard/usdt/BTCUSDT',
  preconditions: [
    { kind: 'signedIn' },
    { kind: 'freshAccount' },
    {
      kind: 'quote',
      category: 'linear',
      symbol: 'BTCUSDT',
      bid: 49_999.9,
      ask: 50_000,
      mark: 50_000,
    },
  ],
  tags: ['@smoke'],
  tour: { stage: 3, order: 1 },
  steps: [
    setIsolated(10, {
      explain:
        'Isolated 10×: the position’s margin is its value ÷ 10, and only that margin is at risk.',
      expect: [{ anchor: 'trade.leverage-chip', text: 'Isolated 10x' }],
    }),
    chooseType('market'),
    enterAmount('0.1', 'coin', {
      explain: 'Long 0.1 BTC. The form shows the margin it takes and where it would be liquidated.',
      expect: [{ anchor: 'trade.preview.liq', text: '$45,149' }],
      liveNote: 'Liquidation ≈ entry × (1 − 1/10 + maintenance margin rate), on the tick.',
    }),
    submit({ expect: [{ anchor: 'trade.amount', value: '' }] }),
    openTab('positions', {
      explain: 'The long is open: 0.1 BTC entered at the ask, 50,000.',
      expect: [{ anchor: 'positions.row', key: 'linear:BTCUSDT', text: /50,000/ }],
    }),
    {
      action: 'control',
      value:
        'quote {"category":"linear","symbol":"BTCUSDT","bid":51000,"ask":51000.1,"last":51000,"mark":51000}',
      testOnly: true,
      explain: 'The price rises to 51,000.',
      expect: [{ anchor: 'positions.row.mark', text: /51,000/ }],
    },
    {
      action: 'click',
      anchor: 'positions.row.close',
      explain: 'Close the whole position at the market: it sells at the bid, 51,000.',
      expect: [{ anchor: 'positions.row', key: 'linear:BTCUSDT', visible: false }],
    },
    openTab('closedpnl', {
      explain:
        'Closed P&L: 0.1 × (51,000 − 50,000) = 100, less the open fee (2.75) and the close fee (2.805).',
      expect: [{ anchor: 'closed-pnl.value', text: /94\.44/ }],
      liveNote: 'Closed P&L = qty × (exit − entry) − open fee − close fee (0.055% of each side).',
    }),
  ],
});
