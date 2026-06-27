import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { radius } from '@/lib/tokens';

const STORAGE_KEY = 'cd-cookie-notice-dismissed';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(STORAGE_KEY);
  });

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:right-4 md:w-96"
        >
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#16143a] p-4 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  We use a secure cookie required for login and localStorage to save your paper
                  trading data and layout. No tracking or advertising cookies are used.{' '}
                  <Link to="/privacy" className="underline underline-offset-2 hover:text-white">
                    Privacy Policy
                  </Link>
                </p>
                <button
                  onClick={handleDismiss}
                  className="rounded-full p-1 text-muted-foreground hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Button
                size="sm"
                onClick={handleDismiss}
                className="h-8 self-end px-4 text-[11px] font-bold"
                style={{ borderRadius: radius.button }}
              >
                Got it
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
