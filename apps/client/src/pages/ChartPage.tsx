import { SeoHead } from '@/components/SeoHead';
import { TradingSoundProvider } from '@/hooks/TradingSoundContext';
import { DashboardInner } from './DashboardPage';

export function ChartPage() {
  return (
    <>
      <SeoHead
        title="Live Crypto Chart — Free, No Signup Required"
        description="Trade BTC, ETH, SOL and more on a live, real-time crypto chart. No account, no signup — try it instantly."
        path="/chart"
      />
      <TradingSoundProvider>
        <DashboardInner />
      </TradingSoundProvider>
    </>
  );
}
