import { motion } from 'framer-motion';
import { GraduationCap, Sparkles, Smartphone, Heart } from 'lucide-react';

import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { bg, color, gradient, font } from '@/lib/tokens';

const sections = [
  { id: 'charts', label: 'Charts' },
  { id: 'trading', label: 'Trading' },
  { id: 'account', label: 'Account' },
  { id: 'realtime', label: 'Real-time Data' },
  { id: 'crossplatform', label: 'Cross-platform' },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 } as const,
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: 'easeOut' as const },
  },
};

const sectionStyles = {
  border: '1px solid',
  borderColor: `${color.glow}20`,
} as const;

const detailCardStyles = {
  border: '1px solid',
  borderColor: `${color.glow}15`,
} as const;

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-white sm:text-3xl">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: color.muted }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function DetailCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        ...detailCardStyles,
        background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
        boxShadow: `0 2px 12px ${color.purpleDeep}15`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${color.purpleDark}30, ${color.purple}30)`,
            border: `1px solid ${color.purple}20`,
            color: color.purple,
          }}
        >
          <div
            className="absolute inset-0 rounded-xl opacity-20 blur-md"
            style={{ background: gradient.brand }}
          />
          <span className="relative z-10">{icon}</span>
        </div>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: color.muted }}>
        {desc}
      </p>
    </div>
  );
}

export function FeaturesPage() {
  return (
    <>
      {/* Sticky anchor nav */}
      <nav
        className="sticky top-0 z-50 hidden border-b md:block"
        style={{
          background: `linear-gradient(90deg, ${bg.page}E6 0%, ${bg.navy}E6 100%)`,
          backdropFilter: 'blur(12px)',
          borderColor: `${color.glow}15`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-8 px-4 py-3">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm font-medium transition-colors hover:text-white"
              style={{ color: color.muted }}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <AuthLayout>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex w-full max-w-6xl flex-col items-center gap-20 px-4 pb-16 pt-24 sm:pt-28"
        >
          {/* ─── Hero ─────────────────────────────────────────────────── */}
          <motion.div
            variants={itemVariants}
            id="hero"
            className="flex max-w-3xl flex-col items-center gap-4 text-center"
            style={{ scrollMarginTop: 80 }}
          >
            <h1
              className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl"
              style={{
                background: gradient.brand,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: font.sans,
              }}
            >
              Everything in one place
            </h1>
            <p className="max-w-xl text-base" style={{ color: color.muted }}>
              Professional-grade trading tools built for paper trading. No downloads, no setup, no
              risk.
            </p>
          </motion.div>

          {/* ─── Charts ───────────────────────────────────────────────── */}
          <motion.section
            id="charts"
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <SectionHeading
              title="Advanced Charts"
              subtitle="Analyze the markets with professional-grade charting tools."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 3v18" />
                  </svg>
                }
                title="Multi-layout"
                desc="5 layout modes — single, dual, triple, quad, and 1+3 grid. Switch instantly."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                }
                title="6 Timeframes"
                desc="1m, 5m, 15m, 1h, 4h, 1D — all powered by real Bybit data."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M3 3v18h18" />
                    <path d="M7 16l4-8 4 4 4-6" />
                  </svg>
                }
                title="Indicators"
                desc="EMA9/20/200, VWAP, and MACD with customizable histogram and signal lines."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M12 19V5m-7 7l7-7 7 7" />
                  </svg>
                }
                title="Drawing Tools"
                desc="Trend lines, Fibonacci retracements, rectangles, text labels, and freehand drawing."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
                title="Real-time Updates"
                desc="Candlesticks stream live via WebSocket. No page refresh needed."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
                title="Full-screen Mode"
                desc="Undistracted charting with a single click. All tools remain accessible."
              />
            </div>
          </motion.section>

          {/* ─── Trading ──────────────────────────────────────────────── */}
          <motion.section
            id="trading"
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <SectionHeading
              title="Paper Trading"
              subtitle="Practice every strategy without risking real money."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                }
                title="Order Types"
                desc="Market, limit, and stop orders. Full control over entry and exit."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                }
                title="TP / SL"
                desc="Set take-profit and stop-loss on every position. Auto-closes at your price."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
                title="$10K Virtual Balance"
                desc="Pre-funded paper account. Track P&L as if it were real."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M4 20h16M4 20V4m0 16l6-8 4 4 6-8" />
                  </svg>
                }
                title="Leverage 1–10x"
                desc="Adjust leverage per trade. See exactly how it affects your P&L."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                  </svg>
                }
                title="Position Netting"
                desc="One net position per pair. Simplifies tracking and avoids over-trading."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
                title="Order Book"
                desc="Live bid/ask quotes from the Bybit order book feed. See the spread before placing orders."
              />
            </div>
          </motion.section>

          {/* ─── Account ──────────────────────────────────────────────── */}
          <motion.section
            id="account"
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <SectionHeading
              title="Account Overview"
              subtitle="Full transparency into your trading activity."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
                title="Positions Table"
                desc="Open positions with real-time P&L, entry price, mark price, and liquidation price."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                }
                title="Order History"
                desc="Complete history of all filled, cancelled, and expired orders."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M4 20h16M4 20V4m0 16l6-8 4 4 6-8" />
                  </svg>
                }
                title="Balance Audit Trail"
                desc="Every credit and debit logged. Full reconciliation from day one."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                }
                title="Trading Journal"
                desc="Annotate every trade with notes and screenshots. Review and improve."
              />
            </div>
          </motion.section>

          {/* ─── Real-time Data ────────────────────────────────────────── */}
          <motion.section
            id="realtime"
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <SectionHeading
              title="Real-time Data"
              subtitle="Live market data powered by Bybit WebSocket API."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                }
                title="Bybit WebSocket Feed"
                desc="Direct WebSocket connection to Bybit. Sub-100ms latency on tick updates."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
                title="9 Crypto Pairs"
                desc="BTC, ETH, SOL, XRP, ADA, DOGE, DOT, AVAX, LINK. More pairs coming."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="2" y="2" width="20" height="8" rx="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" />
                    <path d="M6 6h.01M6 18h.01" />
                  </svg>
                }
                title="Bid / Ask Spread"
                desc="Live spread displayed per pair. Know the cost of entry before you trade."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                }
                title="Connection Status"
                desc="Visual indicator showing WebSocket health. Auto-reconnects on drop."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                }
                title="Market Overview"
                desc="Top-level dashboard showing all pairs, 24h change, and volume at a glance."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M3 3v18h18" />
                    <path d="M7 16l4-8 4 4 4-6" />
                  </svg>
                }
                title="OHLCV History"
                desc="Full historical data for backtesting and analysis. Chart every candle."
              />
            </div>
          </motion.section>

          {/* ─── Cross-platform ────────────────────────────────────────── */}
          <motion.section
            id="crossplatform"
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <SectionHeading
              title="Cross-platform"
              subtitle="Your trading setup, everywhere you go."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                }
                title="PWA Installable"
                desc="Add to home screen on iOS and Android. Feels like a native app."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
                  </svg>
                }
                title="Offline Support"
                desc="Service worker caches key assets. Works on flaky connections."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                }
                title="Synced Across Devices"
                desc="Settings and preferences sync. Login once, trade anywhere."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
                title="Responsive Design"
                desc="Optimized for desktop, tablet, and phone. Trade from any screen size."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                }
                title="No Download Required"
                desc="Open the browser, log in, and start trading. Zero installation."
              />
              <DetailCard
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                }
                title="HTTPS + Secure"
                desc="Served over HTTPS with httpOnly cookies. Your data stays safe."
              />
            </div>
          </motion.section>

          {/* ─── Why CPT — Differentiator ────────────────────────────── */}
          <motion.section
            variants={itemVariants}
            className="w-full rounded-2xl p-8 sm:p-10"
            style={{
              ...sectionStyles,
              background: `linear-gradient(135deg, ${bg.panel}80 0%, ${bg.page}80 100%)`,
              boxShadow: `0 4px 24px ${color.purpleDeep}20`,
              scrollMarginTop: 80,
            }}
          >
            <div className="mb-8 flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: gradient.brand,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Why CPT?</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: 'Built for Learning',
                  desc: 'Not another cluttered platform. Every feature is designed to help you understand the markets.',
                  icon: <GraduationCap className="mx-auto h-6 w-6" />,
                },
                {
                  title: 'Zero Bloat',
                  desc: 'No ads, no noise, no upselling. Just the tools you need to practice and improve.',
                  icon: <Sparkles className="mx-auto h-6 w-6" />,
                },
                {
                  title: 'PWA-First',
                  desc: 'Install on any device in seconds. No App Store, no download, no updates.',
                  icon: <Smartphone className="mx-auto h-6 w-6" />,
                },
                {
                  title: 'Free Forever',
                  desc: 'No credit card, no trial period, no hidden costs. Paper trading should be accessible to everyone.',
                  icon: <Heart className="mx-auto h-6 w-6" />,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-3 rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
                    border: `1px solid ${color.glow}15`,
                    boxShadow: `0 2px 12px ${color.purpleDeep}15`,
                  }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center"
                    style={{ color: color.purple }}
                  >
                    {item.icon}
                  </span>
                  <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: color.muted }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ─── CTA ───────────────────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="w-full">
            <CtaSection />
          </motion.div>

          {/* ─── Back to top ──────────────────────────────────────────── */}
          <motion.div variants={itemVariants}>
            <a
              href="#"
              className="inline-flex items-center gap-2 text-sm transition-colors hover:text-white"
              style={{ color: color.muted }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
              Back to top
            </a>
          </motion.div>
        </motion.div>
      </AuthLayout>
    </>
  );
}
