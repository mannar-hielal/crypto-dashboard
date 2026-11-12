import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { APP_NAME, shareStep, type InstallPlatform as Platform } from '@/lib/pwaInstall';

// BeforeInstallPromptEvent is not yet in standard TS DOM lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-banner-dismissed';

/** Stable keys for the three steps (each list has exactly three) */
const STEP_IDS = ['open', 'add', 'done'] as const;

/**
 * Unified PWA install banner: iOS (Safari and, since iOS 16.4, Chrome, Edge and Firefox), Android
 * Chrome / Samsung Internet, and Firefox on Android (its menu installs; no prompt event).
 *
 * iOS, Firefox on Android: no prompt API — shows the steps, with the Share button or menu where
 *              that browser keeps it. Dismissed state persisted to localStorage.
 *
 * Android / Chrome: intercepts `beforeinstallprompt`, prevents the default browser
 *              mini-infobar, and shows a custom branded banner with an Install button.
 *              Hides automatically on `appinstalled`.
 */
export function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const androidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Respect the OS "reduce motion" preference — disables the attention shake
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const isDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    if (isDismissed) return;

    // ── iOS detection ────────────────────────────────────────────────────────
    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ reports as MacIntel with touch support
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isInStandaloneMode =
      'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true;

    // Other iOS browsers (Chrome/CriOS, Edge/EdgiOS, Firefox/FxiOS, Opera/OPiOS): since iOS 16.4
    // they add to the Home Screen from their own Share menu, so they get the same steps, with the
    // Share button where that browser keeps it
    const isNonSafariIOS = isIOS && /CriOS|EdgA|EdgiOS|FxiOS|OPiOS/i.test(ua);

    // iPad detection: used to show correct Share button location in instructions.
    // On iPad, the Share button is in the top toolbar; on iPhone it's at the bottom.
    const isIPad =
      /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS && !isInStandaloneMode) {
      const timer = setTimeout(
        () => setPlatform(isNonSafariIOS ? 'ios-other' : isIPad ? 'ipad' : 'ios'),
        2500
      );
      return () => clearTimeout(timer);
    }

    // ── Firefox on Android: no beforeinstallprompt, but its menu installs ─────
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
    if (/Android/i.test(ua) && /Firefox/i.test(ua) && !isStandalone) {
      const timer = setTimeout(() => setPlatform('android-firefox'), 2500);
      return () => clearTimeout(timer);
    }

    // ── Android / Chrome: beforeinstallprompt ────────────────────────────────
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault(); // suppress the browser's default mini-infobar
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      // Re-check dismissed flag — user may have dismissed our banner between page load
      // and the moment beforeinstallprompt fired (fix: race condition)
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
      androidTimerRef.current = setTimeout(() => setPlatform('android'), 2500);
    };

    const handleInstalled = () => {
      // App was installed (e.g. via address bar button) — hide our banner too
      deferredPrompt.current = null;
      setPlatform(null);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      // Clear android timer on unmount to prevent state updates on unmounted component
      if (androidTimerRef.current) clearTimeout(androidTimerRef.current);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setPlatform(null);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
    if (outcome === 'accepted') {
      setPlatform(null); // installed — banner won't show again anyway
    } else {
      // User dismissed the native dialog — hide and persist so the banner
      // doesn't reappear with a dead Install button (no prompt to reuse)
      dismiss();
    }
  };

  if (!platform) return null;

  return (
    // Layer 1 — spring slide-up entrance from below the viewport
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-50"
    >
      {/* Layer 2 — periodic attention shake; pauses between each cycle */}
      <motion.div
        animate={
          prefersReducedMotion
            ? {}
            : {
                rotate: [0, -3, 3, -2, 2, -1, 0],
                x: [0, -6, 6, -4, 4, -2, 0],
              }
        }
        // Gate the transition as well — passing repeat:Infinity even with an empty animate{}
        // still schedules background animation timers, wasting CPU for users who prefer no motion.
        transition={
          prefersReducedMotion
            ? undefined
            : {
                duration: 0.55,
                repeat: Infinity,
                repeatDelay: 3.5,
                ease: 'easeInOut',
              }
        }
        role="banner"
        aria-label="Install app"
        className="rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        {/* Dismiss button */}
        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="text-muted-foreground hover:text-foreground absolute right-3 top-3 text-lg leading-none"
        >
          ✕
        </button>

        <div className="flex items-start gap-3 pr-6">
          {/* App icon */}
          <img src="/pwa-192x192.png" alt="" className="h-12 w-12 flex-shrink-0 rounded-xl" />

          <div className="flex-1">
            {platform !== 'android' ? (
              // ── iOS / iPadOS (any browser) and Firefox on Android: the steps ──
              // No JS API adds to the Home Screen there: the learner does it from the browser's
              // Share sheet or menu, so the steps say where that is in their browser
              <>
                <p className="text-sm font-semibold">Install {APP_NAME}</p>
                <ol className="mt-2 space-y-1.5" aria-label="How to install">
                  {(platform === 'android-firefox'
                    ? [
                        <>
                          Open Firefox’s <strong className="text-foreground">⋮</strong> menu
                        </>,
                        <>
                          Tap <strong className="text-foreground">“Install”</strong> (or “Add to
                          Home screen”)
                        </>,
                        <>
                          Tap <strong className="text-foreground">“Add”</strong> — done!
                        </>,
                      ]
                    : [
                        <>
                          Tap the{' '}
                          <span className="inline-flex items-center gap-0.5 font-medium">
                            Share
                            <svg
                              viewBox="0 0 24 24"
                              className="inline-block h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                          </span>{' '}
                          button {shareStep(platform, navigator.userAgent)}
                        </>,
                        <>
                          Scroll down and tap{' '}
                          <strong className="text-foreground">“Add to Home Screen”</strong>
                        </>,
                        <>
                          Tap <strong className="text-foreground">“Add”</strong> — done!
                        </>,
                      ]
                  ).map((step, i) => (
                    <li key={STEP_IDS[i]} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="bg-primary text-primary-foreground flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      >
                        {i + 1}
                      </span>
                      <p className="text-muted-foreground text-xs">{step}</p>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              // ── Android / Chrome: real install button ─────────────────────────
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Install {APP_NAME}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Add to your home screen for a faster, full-screen experience.
                  </p>
                </div>
                <button
                  onClick={() => void handleAndroidInstall()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors"
                >
                  Install
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
