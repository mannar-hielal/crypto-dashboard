import { SeoHead } from '@/components/SeoHead';
import { TradingSoundProvider } from '@/hooks/TradingSoundContext';
import { DashboardInner } from './DashboardPage';

export function ChartPage() {
  return (
    <>
      <SeoHead
        title="Charts"
        description="Cryptocurrency price charts with paper trading."
        path="/chart"
      />
      <TradingSoundProvider>
        <DashboardInner />
      </TradingSoundProvider>
    </>
  );
}
