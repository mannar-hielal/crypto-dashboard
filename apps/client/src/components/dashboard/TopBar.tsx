import { useState } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@crypto-dashboard/sdk';

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
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await authApi.logout();
    clearAuth();
  }

  return (
    <header
      className="flex h-12 w-full shrink-0 items-center justify-between border-b border-white/[0.06] px-4"
      style={{ background: '#0b0c1a', zIndex: 20 }}
    >
      {/* ── Left: Logo + name + badge ──────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <motion.div
          whileHover={{ scale: 1.08 }}
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: 'linear-gradient(135deg, #7b2ff7 0%, #a855f7 100%)' }}
        >
          <span className="text-[11px] font-black tracking-tight text-white">CD</span>
        </motion.div>

        <span className="text-sm font-bold tracking-tight text-white">CryptoDash</span>

        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
          style={{
            background: '#7b2ff720',
            color: '#a855f7',
            border: '1px solid #7b2ff730',
          }}
        >
          Beta
        </span>
      </div>

      {/* ── Right: User menu ───────────────────────────────────────────── */}
      <div className="relative">
        <motion.button
          onClick={() => setMenuOpen((p) => !p)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
          style={{ background: menuOpen ? '#131628' : 'transparent' }}
        >
          {/* Avatar circle */}
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white"
            style={{ background: 'linear-gradient(135deg, #7b2ff7, #a855f7)' }}
          >
            {user?.username?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <span className="text-[11px] font-medium text-white/70">{user?.username}</span>
          <ChevronDown
            className="h-3 w-3 text-[#848e9c] transition-transform"
            style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
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
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-lg border border-white/[0.08] shadow-2xl"
                style={{ background: '#0f1020' }}
              >
                <motion.button
                  onClick={() => {
                    setMenuOpen(false);
                    void handleLogout();
                  }}
                  whileHover={{ background: '#131628' }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[#848e9c] transition-colors hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </motion.button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
