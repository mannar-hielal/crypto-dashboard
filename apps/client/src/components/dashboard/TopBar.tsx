import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { LogOut, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { useMarketStore } from '@/store/marketStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

const INTERVAL_LABELS: Record<(typeof INTERVALS)[number], string> = {
  '1m': '1 Minute',
  '5m': '5 Minutes',
  '15m': '15 Minutes',
  '1h': '1 Hour',
  '4h': '4 Hours',
  '1d': '1 Day',
};

export function TopBar() {
  // Use individual selectors — TopBar only re-renders when these specific values change
  const symbol = useMarketStore((s) => s.symbol);
  const interval = useMarketStore((s) => s.interval);
  const changeInterval = useMarketStore((s) => s.setInterval); // renamed to avoid shadowing window.setInterval
  const latestPrice = useMarketStore((s) => s.latestPrice);
  const priceChange = useMarketStore((s) => s.priceChange);
  const isConnected = useMarketStore((s) => s.isConnected);

  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [menuOpen, setMenuOpen] = useState(false);

  // % change relative to previous bar close
  const prevClose = latestPrice !== null && priceChange !== null ? latestPrice - priceChange : null;
  const changePercent =
    prevClose !== null && prevClose !== 0 && priceChange !== null
      ? (priceChange / prevClose) * 100
      : null;
  const isPositive = (priceChange ?? 0) >= 0;

  async function handleLogout() {
    await authApi.logout();
    clearAuth();
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#1a1d2e] px-4 z-10">
      {/* ── Left: Logo · Symbol · Timeframes ───────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Logo mark */}
        <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500/20">
          <span className="text-[11px] font-bold tracking-tight text-indigo-400">CD</span>
        </div>

        {/* Symbol */}
        <span className="text-sm font-semibold text-white">{symbol}</span>

        {/* Timeframe buttons */}
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((tf) => (
            <button
              key={tf}
              onClick={() => changeInterval(tf)}
              title={INTERVAL_LABELS[tf]}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                interval === tf
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Price · Status · User ────────────────────────────────────── */}
      <div className="flex items-center gap-5">
        {/* Live price */}
        <div className="flex items-center gap-2 tabular-nums">
          {latestPrice !== null ? (
            <>
              <NumberFlow
                value={latestPrice}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                className="text-sm font-semibold text-white"
              />
              {changePercent !== null && (
                <span
                  className={`text-xs font-medium ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {changePercent.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-600">Loading…</span>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-slate-600" />
          )}
          <span
            className={`text-[10px] font-semibold tracking-wide ${
              isConnected ? 'text-emerald-400' : 'text-slate-600'
            }`}
          >
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            {/* Avatar initial */}
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/30">
              <span className="text-[9px] font-bold text-indigo-300">
                {user?.username?.charAt(0).toUpperCase() ?? '?'}
              </span>
            </div>
            <span>{user?.username}</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded border border-white/[0.08] bg-[#1a1d2e] py-1 shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void handleLogout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
