/**
 * TradingSoundContext
 *
 * Provides a single shared instance of useTradingSound() to all dashboard
 * components via React context — ensures one AudioContext + one GainNode.
 *
 * NOTE: This file intentionally exports both a component (TradingSoundProvider)
 * and a hook (useTradingSoundCtx) — standard React context co-location pattern.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useTradingSound, type TradingSoundAPI } from './useTradingSound';
const TradingSoundContext = createContext<TradingSoundAPI | null>(null);
export function TradingSoundProvider({ children }: { children: ReactNode }) {
  const sound = useTradingSound();
  return <TradingSoundContext.Provider value={sound}>{children}</TradingSoundContext.Provider>;
}
/** Access the shared trading sound API inside <TradingSoundProvider>. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTradingSoundCtx(): TradingSoundAPI {
  const ctx = useContext(TradingSoundContext);
  if (!ctx) throw new Error('useTradingSoundCtx must be used within TradingSoundProvider');
  return ctx;
}
