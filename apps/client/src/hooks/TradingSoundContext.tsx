import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTradingSound, type TradingSoundAPI } from './useTradingSound';

/**
 * Split sound API into separate contexts to prevent re-renders in components
 * that only need to play sounds (actions) when settings (volume/mute) change.
 */
const SoundSettingsContext = createContext<{ volume: number; muted: boolean } | null>(null);
const SoundActionsContext = createContext<Omit<TradingSoundAPI, 'volume' | 'muted'> | null>(null);

export function TradingSoundProvider({ children }: { children: ReactNode }) {
  const {
    volume,
    muted,
    setVolume,
    toggleMute,
    playOrderPlaced,
    playOrderQueued,
    playOrderFilled,
    playProfit,
    playLoss,
    playLiquidation,
  } = useTradingSound();

  const settings = useMemo(() => ({ volume, muted }), [volume, muted]);
  const actions = useMemo(
    () => ({
      setVolume,
      toggleMute,
      playOrderPlaced,
      playOrderQueued,
      playOrderFilled,
      playProfit,
      playLoss,
      playLiquidation,
    }),
    [
      setVolume,
      toggleMute,
      playOrderPlaced,
      playOrderQueued,
      playOrderFilled,
      playProfit,
      playLoss,
      playLiquidation,
    ]
  );

  return (
    <SoundSettingsContext.Provider value={settings}>
      <SoundActionsContext.Provider value={actions}>{children}</SoundActionsContext.Provider>
    </SoundSettingsContext.Provider>
  );
}

/** Access only the sound settings (volume, muted). */
// eslint-disable-next-line react-refresh/only-export-components
export function useSoundSettings() {
  const ctx = useContext(SoundSettingsContext);
  if (!ctx) throw new Error('useSoundSettings must be used within TradingSoundProvider');
  return ctx;
}

/** Access sound playback actions (playProfit, etc.). Stable references. */
// eslint-disable-next-line react-refresh/only-export-components
export function useSoundActions() {
  const ctx = useContext(SoundActionsContext);
  if (!ctx) throw new Error('useSoundActions must be used within TradingSoundProvider');
  return ctx;
}

/** Legacy hook for backwards compatibility. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTradingSoundCtx(): TradingSoundAPI {
  const settings = useSoundSettings();
  const actions = useSoundActions();
  return { ...settings, ...actions };
}
