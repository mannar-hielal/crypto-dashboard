import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LogOut, ChevronDown, Settings, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';
import { bg, color, fontSize, gradient, radius } from '@/lib/tokens';
import { SettingsModal } from './SettingsModal';

/**
 * TopBar — App-level header (row 1)
 *
 * Contains only application-wide chrome:
 *   • Logo + app name + Beta badge  (left)
 *   • User avatar + logout dropdown (right)
 *
 * All trading-specific content (symbol, price, timeframes) lives in SymbolBar.
 */
export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleLogout() {
    await authApi.logout();
    clearAuth();
  }

  return (
    <header
      className="flex h-12 w-full shrink-0 items-center justify-between border-b border-white/6 px-4"
      style={{ background: bg.panel, zIndex: 20 }}
    >
      {/* ── Left: Logo + name + badge ──────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <motion.div whileHover={{ scale: 1.08 }} className="h-7 w-7 overflow-hidden rounded-md">
          <img src="/logo.svg" alt="CPT" className="h-full w-full" />
        </motion.div>

        <span className="text-sm font-bold tracking-tight text-white">cryptopapertrade.com</span>

        <span
          className="rounded px-1.5 py-0.5 font-bold uppercase tracking-widest"
          style={{
            fontSize: fontSize.xxs,
            background: `${color.purpleDark}20`,
            color: color.purple,
            border: `1px solid ${color.purpleDark}30`,
          }}
        >
          Beta
        </span>
      </div>

      {/* ── Right: User menu ───────────────────────────────────────────── */}
      <div className="relative">
        {user ? (
          <>
            <motion.button
              onClick={() => setMenuOpen((p) => !p)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
              style={{ background: menuOpen ? bg.surface : 'transparent' }}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full font-black text-white"
                style={{
                  fontSize: fontSize.xs10,
                  background: gradient.brand,
                }}
              >
                {user?.username?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <span style={{ fontSize: fontSize.xs11 }} className="font-medium text-white/70">
                {user?.username}
              </span>
              <ChevronDown
                className="h-3 w-3 transition-transform"
                style={{ color: color.muted, transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </motion.button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-1.5 w-40 overflow-hidden rounded-lg border border-white/8 shadow-2xl"
                    style={{ background: bg.panel }}
                  >
                    <motion.button
                      onClick={() => {
                        setMenuOpen(false);
                        setSettingsOpen(true);
                      }}
                      whileHover={{ background: bg.surface }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:text-white"
                      style={{
                        color: color.muted,
                        borderBottom: `1px solid color-mix(in srgb, ${color.white} 5%, transparent)`,
                      }}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Settings
                    </motion.button>
                    {user?.email === import.meta.env.VITE_ADMIN_EMAIL && (
                      <motion.button
                        onClick={() => {
                          setMenuOpen(false);
                          navigate('/admin/newsletter');
                        }}
                        whileHover={{ background: bg.surface }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:text-white"
                        style={{
                          color: color.muted,
                          borderBottom: `1px solid color-mix(in srgb, ${color.white} 5%, transparent)`,
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Admin
                      </motion.button>
                    )}
                    <motion.button
                      onClick={() => {
                        setMenuOpen(false);
                        void handleLogout();
                      }}
                      whileHover={{ background: bg.surface }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:text-white"
                      style={{ color: color.muted }}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </motion.button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        ) : (
          <motion.a
            href="/login"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors"
            style={{
              color: color.white,
              background: gradient.brand,
              borderRadius: radius.button,
            }}
          >
            Sign in
          </motion.a>
        )}

        </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
