/**
 * BP-5 C (O6): risk-limit tier facts from the bundled snapshot — the leverage modal's tier line and
 * the Positions row's MMR hover. Must agree with the server (bybitSpec.tierFor / positionCap).
 */

import { describe, it, expect } from 'vitest';
import { riskTierInfo, riskTierLabel } from '@/lib/positionMath';

describe('riskTierInfo / riskTierLabel', () => {
  it('BTCUSDT: a small position is in tier 1, and the cap at 10× is 100,000,000 USDT', () => {
    const info = riskTierInfo('BTCUSDT', 5_000, 10);
    expect(info).toMatchObject({ tierNo: 1, mmr: 0.0033, limit: 300_000, cap: 100_000_000 });
    expect(riskTierLabel(info!)).toBe('Risk-limit tier 1 (up to 300,000 USDT) · MMR 0.33%');
  });

  it('BNBUSDT: a 20,000 USDT position is in tier 2 (its tier 1 ends at 10,000)', () => {
    expect(riskTierInfo('BNBUSDT', 20_000, 10)).toMatchObject({ tierNo: 2, limit: 50_000 });
    // The boundary belongs to the lower tier, as on the server (value ≤ limit)
    expect(riskTierInfo('BNBUSDT', 10_000, 10)?.tierNo).toBe(1);
  });

  it('is null for a symbol with no tier snapshot', () => {
    expect(riskTierInfo('FOOUSDT', 1, 10)).toBeNull();
  });
});
