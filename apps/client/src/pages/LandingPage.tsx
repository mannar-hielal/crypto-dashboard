import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { TrendingUp, Activity, Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/components/AuthLayout';
import { CtaSection } from '@/components/CtaSection';
import { bg, color, gradient, font } from '@/lib/tokens';
import macHeaderApp from '@/assets/hero-mac-app.png';
import chartImg from '@/assets/chart.svg';
import papertradingImg from '@/assets/papertrading.svg';
import cryptoPairsImg from '@/assets/9crypto.svg';
import realtimeDataImg from '@/assets/realtime-data.svg';
import visualBalanceImg from '@/assets/visual-balance.svg';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 } as const,
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
      <div
        className="absolute inset-0 rounded-2xl opacity-25 blur-xl"
        style={{ background: gradient.brand }}
      />
      <div
        className="relative z-10 flex h-full w-full items-center justify-center rounded-2xl"
        style={{
          background: `linear-gradient(135deg, ${color.purpleDark}40, ${color.purple}40)`,
          border: `1px solid ${color.purple}30`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AlternatingSection({
  title,
  desc,
  icon,
  graphic,
  reversed,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  graphic: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-10 lg:flex-row${reversed ? ' lg:flex-row-reverse' : ''}`}
    >
      <motion.div variants={itemVariants} className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-4">
          <SectionIcon>{icon}</SectionIcon>
          <div>
            <h3 className="text-xl font-bold text-white sm:text-2xl">{title}</h3>
          </div>
        </div>
        <p className="max-w-lg text-sm leading-relaxed sm:text-base" style={{ color: color.muted }}>
          {desc}
        </p>
        {(title === 'Advanced Charts' ||
          title === 'Paper Trading' ||
          title === 'Real-time Data') && (
          <div>
            <Button
              asChild
              size="sm"
              className="mt-1 h-9 rounded-full px-5 text-sm font-semibold text-white shadow-md"
              style={{ background: gradient.brand }}
            >
              <Link
                to={
                  title === 'Advanced Charts'
                    ? '/features#charts'
                    : title === 'Paper Trading'
                      ? '/features#trading'
                      : '/features#realtime'
                }
              >
                {title === 'Advanced Charts'
                  ? 'Discover Charts'
                  : title === 'Paper Trading'
                    ? 'Explore Paper Trading'
                    : 'Read More'}
              </Link>
            </Button>
          </div>
        )}
      </motion.div>
      <motion.div variants={itemVariants} className="flex flex-1 items-center justify-center">
        {graphic}
      </motion.div>
    </div>
  );
}

const learningSteps = [
  {
    step: '1',
    title: 'Learn',
    desc: 'Explore our charts, indicators, and order types in a risk-free environment.',
  },
  {
    step: '2',
    title: 'Practice',
    desc: 'Execute trades with $10K virtual balance. Refine your strategy without losing a cent.',
  },
  {
    step: '3',
    title: 'Grow',
    desc: 'Track your P&L, journal every trade, and build confidence before trading real money.',
  },
];

const alternatingSections = [
  {
    icon: <TrendingUp className="h-6 w-6" style={{ color: color.purple }} />,
    title: 'Advanced Charts',
    desc: 'Up to 4 multi-layout panes with 6 timeframes (1m, 5m, 15m, 1h, 4h, 1d). Sync symbol, interval, crosshair, and time range across panes. EMA9/20/200, VWAP, MACD indicators included — more added constantly. Drawing tools are under active development.',
    graphic: <img src={chartImg} alt="" className="w-full max-w-lg select-none" />,
  },
  {
    icon: <Activity className="h-6 w-6" style={{ color: color.purple }} />,
    title: 'Paper Trading',
    desc: 'Market orders fill instantly at the best available price. Limit orders let you name your price, executed when the market reaches your level. Stop orders trigger a market order once the price hits your stop — perfect for entries and exits. All with $10K virtual balance, take-profit and stop-loss on every position, and leverage 1–10x. No real money at risk.',
    graphic: (
      <img
        src={papertradingImg}
        alt=""
        className="w-full max-w-sm select-none object-contain"
        style={{ transform: 'translate(40px, -40px)' }}
      />
    ),
    reversed: true,
  },
  {
    icon: <Globe className="h-6 w-6" style={{ color: color.purple }} />,
    title: 'Real-time Data',
    desc: 'Live Bybit WebSocket feed across 9 crypto pairs. Bid/ask spread, connection health indicator, and automatic reconnection. Professional charting with real-time candlestick updates.',
    graphic: (
      <div className="flex flex-wrap items-center justify-center gap-4">
        {[
          { pair: 'BTC/USD', price: '83,412', chg: '+2.14%', up: true },
          { pair: 'ETH/USD', price: '1,582', chg: '+1.84%', up: true },
          { pair: 'SOL/USD', price: '120.45', chg: '-0.83%', up: false },
          { pair: 'XRP/USD', price: '2.20', chg: '+3.12%', up: true },
        ].map((t) => (
          <div
            key={t.pair}
            className="flex flex-col items-center gap-1 rounded-xl px-3 py-2"
            style={{ background: `${bg.surface}40`, minWidth: 80 }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: color.muted }}
            >
              {t.pair}
            </span>
            <span className="text-xs font-bold text-white">{t.price}</span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: t.up ? color.green : color.red }}
            >
              {t.chg}
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

export function LandingPage() {
  return (
    <AuthLayout>
      {/* Exgen Cover-style Hero — full-width gradient background */}
      <div
        className="relative w-full"
        style={{
          background: `linear-gradient(135deg, ${bg.deep} 0%, ${bg.page} 30%, ${bg.navy} 100%)`,
        }}
      >
        {/* Ambient glow blobs — Exgen-inspired */}
        <div
          className="pointer-events-none absolute -top-32 left-1/4 h-[600px] w-[600px] rounded-full opacity-20"
          style={{
            background: `radial-gradient(circle, ${color.glow} 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 right-0 h-[500px] w-[500px] rounded-full opacity-15"
          style={{
            background: `radial-gradient(circle, ${color.purpleDark} 0%, transparent 70%)`,
            filter: 'blur(50px)',
          }}
        />
        <div
          className="pointer-events-none absolute -top-20 right-1/3 h-[300px] w-[300px] rounded-full opacity-10"
          style={{
            background: `radial-gradient(circle, ${color.purple} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
        />

        <div
          className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-16 px-4 py-20 lg:flex-row lg:py-28"
          style={{ overflow: 'hidden' }}
        >
          {/* Hero content — left/center */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-1 flex-col items-start gap-4 text-center lg:items-start lg:text-left"
          >
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-3 rounded-full border border-white/10 px-4 py-1.5"
              style={{ background: `${color.glow}15` }}
            >
              <span className="flex h-2 w-2 rounded-full" style={{ background: color.green }} />
              <span
                className="text-xs font-medium tracking-wide uppercase"
                style={{ color: color.muted }}
              >
                Free Paper Trading Platform
              </span>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-5xl font-black leading-tight sm:text-6xl lg:text-7xl"
              style={{ fontFamily: font.sans }}
            >
              <span
                style={{
                  background: gradient.brand,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Paper trade crypto,{' '}
              </span>
              <span className="text-white uppercase">FREE</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-xl font-semibold text-white">
              Stop paying. Start learning.
            </motion.p>

            <motion.p
              variants={itemVariants}
              className="max-w-xl text-base leading-relaxed"
              style={{ color: color.muted }}
            >
              Real-time Bybit data, professional charts, and $10K virtual balance — no sign-up
              required.
            </motion.p>

            <motion.div variants={itemVariants} className="flex gap-4">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full px-8 text-base font-semibold text-white shadow-lg"
                style={{ background: gradient.brand }}
              >
                <Link to="/register">Start Paper Trading</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-white/20 px-8 text-base font-semibold"
                style={{ color: color.muted }}
              >
                <Link to="/features">See Features</Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Crypto coins graphic */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="flex flex-1 items-center justify-center"
          >
            <div className="overflow-hidden" style={{ width: '36rem', height: 'auto' }}>
              <img
                src={macHeaderApp}
                alt=""
                className="w-full select-none object-contain"
                style={{ objectPosition: 'center center' }}
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Stats strip ──────────────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-24 px-4 py-16">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {[
            {
              label: 'more are being added',
              value: '9 crypto pairs',
              icon: (
                <img
                  src={cryptoPairsImg}
                  alt=""
                  className="select-none"
                  style={{ marginBottom: '1rem' }}
                />
              ),
            },
            {
              label: 'Data Feed',
              value: 'Real-time Bybit',
              icon: <img src={realtimeDataImg} alt="" className="select-none" />,
            },
            {
              label: 'Virtual Balance',
              value: '$10,000',
              icon: <img src={visualBalanceImg} alt="" className="w-full select-none" />,
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className="relative overflow-hidden rounded-2xl border px-6 py-7 text-center transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(135deg, ${bg.panel} 0%, ${bg.page} 100%)`,
                borderColor: `${color.glow}20`,
                boxShadow: `0 4px 20px ${color.purpleDeep}20`,
              }}
            >
              <div
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  width: '12rem',
                  height: 'auto',
                  background: 'transparent',
                }}
              >
                {stat.icon}
              </div>
              <span
                className="mt-1 block text-3xl font-black"
                style={{
                  background: gradient.brand,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {stat.value}
              </span>
              <span className="mt-1 block text-sm" style={{ color: color.muted }}>
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Alternating feature sections ─────────────────────────────── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="flex w-full flex-col items-center gap-16"
        >
          <motion.div variants={itemVariants} className="text-center">
            <h2 className="text-3xl font-bold text-white">
              Everything you need to practice crypto trading
            </h2>
            <p className="mt-2 text-sm" style={{ color: color.muted }}>
              Built for beginners and experienced traders alike.
            </p>
          </motion.div>
          <div className="flex w-full flex-col gap-20">
            {alternatingSections.map((sec) => (
              <AlternatingSection key={sec.title} {...sec} />
            ))}
          </div>
        </motion.div>

        {/* ─── Learning Path — CPT Differentiator ─────────────────────── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex w-full flex-col items-center gap-8"
        >
          <motion.div variants={itemVariants} className="text-center">
            <div
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
              style={{ borderColor: `${color.glow}30`, background: `${color.glow}10` }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={color.purple}
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: color.purple }}
              >
                Zero to Trader
              </span>
            </div>
            <h2 className="text-3xl font-bold text-white">Your learning journey</h2>
            <p className="mt-2 text-sm" style={{ color: color.muted }}>
              Unlike TradingView, we're built for learning — not just charting.
            </p>
          </motion.div>
          <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
            {learningSteps.map((step, i) => (
              <motion.div key={step.step} variants={itemVariants} className="relative">
                {/* Connector line */}
                {i < learningSteps.length - 1 && (
                  <div
                    className="absolute -right-3 top-12 hidden h-px w-6 md:block"
                    style={{ background: `${color.glow}30` }}
                  />
                )}
                <div
                  className="flex flex-col items-center gap-4 rounded-2xl px-6 py-8 text-center transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: `linear-gradient(135deg, ${bg.panel}80 0%, ${bg.page}80 100%)`,
                    border: `1px solid ${color.glow}20`,
                  }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg"
                    style={{
                      background: gradient.brand,
                      boxShadow: `0 0 20px ${color.purpleDark}40`,
                    }}
                  >
                    {step.step}
                  </div>
                  <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: color.muted }}>
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ─── Dashboard preview ──────────────────────────────────────── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex w-full flex-col items-center gap-6"
        >
          <motion.div variants={itemVariants} className="text-center">
            <h2 className="text-3xl font-bold text-white">Designed for clarity, not clutter</h2>
            <p className="mt-2 text-sm" style={{ color: color.muted }}>
              Unlike traditional platforms, every pixel serves a purpose.
            </p>
          </motion.div>
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center gap-5 text-center"
          >
            <div
              className="relative rounded-2xl border p-2 shadow-2xl"
              style={{
                background: `linear-gradient(${bg.surface} 0%, rgb(33, 30, 73) 100%)`,
                boxShadow: `0 20px 60px ${color.purpleDeep}40`,
              }}
            >
              <div className="overflow-hidden rounded-xl" style={{ background: 'rgb(15, 14, 41)' }}>
                {/* Window title bar */}
                <div
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: `${bg.footer}cc` }}
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  <div
                    className="ml-3 flex-1 rounded-md px-3 py-1"
                    style={{ background: `${bg.surface}60` }}
                  >
                    <div
                      className="mx-auto h-2 w-40 rounded"
                      style={{ background: `${color.muted}30` }}
                    />
                  </div>
                </div>

                {/* Mock chart body */}
                <div className="p-4 sm:p-6">
                  {/* Header row */}
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${color.purpleDark}, ${color.purple})`,
                        }}
                      />
                      <div>
                        <div
                          className="h-3 w-16 rounded"
                          style={{ background: `${color.muted}30` }}
                        />
                        <div
                          className="mt-1 h-2 w-10 rounded"
                          style={{ background: `${color.muted}20` }}
                        />
                      </div>
                    </div>
                    <div
                      className="h-6 w-20 rounded-full"
                      style={{ background: `${color.green}20` }}
                    />
                  </div>

                  {/* Candlestick bars — volatile crypto price action */}
                  <div className="mt-3 flex items-end gap-1">
                    {[
                      { body: 5, top: 2, bottom: 1, up: false },
                      { body: 7, top: 1, bottom: 2, up: true },
                      { body: 3, top: 1, bottom: 1, up: false },
                      { body: 9, top: 2, bottom: 2, up: true },
                      { body: 11, top: 3, bottom: 1, up: false },
                      { body: 6, top: 1, bottom: 1, up: true },
                      { body: 4, top: 2, bottom: 2, up: false },
                      { body: 2, top: 1, bottom: 1, up: true },
                      { body: 15, top: 3, bottom: 2, up: false },
                      { body: 10, top: 2, bottom: 1, up: true },
                      { body: 8, top: 1, bottom: 3, up: false },
                      { body: 13, top: 2, bottom: 2, up: true },
                      { body: 6, top: 1, bottom: 1, up: false },
                      { body: 17, top: 4, bottom: 2, up: true },
                      { body: 5, top: 2, bottom: 1, up: false },
                      { body: 19, top: 3, bottom: 1, up: true },
                      { body: 14, top: 2, bottom: 2, up: true },
                      { body: 7, top: 1, bottom: 1, up: false },
                      { body: 21, top: 3, bottom: 2, up: true },
                      { body: 24, top: 2, bottom: 2, up: true },
                    ].map((c, i) => {
                      const clr = c.up ? color.green : color.red;
                      const totalH = c.body + c.top + c.bottom;
                      return (
                        <div
                          key={i}
                          className="relative flex items-center justify-center"
                          style={{ width: 8, height: totalH }}
                        >
                          {/* Wick */}
                          <div
                            className="absolute w-0.5 rounded-full"
                            style={{ height: '100%', background: clr }}
                          />
                          {/* Body */}
                          <div
                            className="absolute w-2 rounded-sm"
                            style={{
                              height: c.body,
                              bottom: c.bottom,
                              background: clr,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Price cards */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { pair: 'BTC/USD', price: '$51,667' },
                      { pair: 'ETH/USD', price: '$33,669' },
                      { pair: 'SOL/USD', price: '$25,515' },
                    ].map((c) => (
                      <div
                        key={c.pair}
                        className="rounded-lg px-2 py-2"
                        style={{ background: `${bg.surface}50` }}
                      >
                        <div className="text-[10px] font-medium" style={{ color: color.muted }}>
                          {c.pair}
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-white">{c.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm" style={{ color: color.muted }}>
              Clean, focused interface — log in to see live charts
            </p>
            <Button
              asChild
              size="lg"
              className="rounded-full px-8 text-base font-semibold text-white shadow-lg"
              style={{ background: gradient.brand }}
            >
              <Link to="/register">Try It Now</Link>
            </Button>
          </motion.div>
        </motion.div>

        {/* ─── Final CTA ─────────────────────────────────────────────── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="w-full"
        >
          <CtaSection />
        </motion.div>
      </div>
    </AuthLayout>
  );
}
