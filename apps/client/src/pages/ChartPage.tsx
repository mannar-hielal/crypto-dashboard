import { SeoHead } from '@/components/SeoHead';
import { TradingSoundProvider } from '@/hooks/TradingSoundContext';
import { DashboardInner } from './DashboardPage';

export function ChartPage() {
  return (
    <>
      <SeoHead
        title="Live Crypto Chart — Free, No Signup Required"
        description="Live BTC, ETH, SOL and more crypto charts with indicators and drawing tools — free, no signup. Paper trading with a free account."
        path="/chart"
      />
      <TradingSoundProvider>
        <DashboardInner />
      </TradingSoundProvider>
    </>
  );
}
