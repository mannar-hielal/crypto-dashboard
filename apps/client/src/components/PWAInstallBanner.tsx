import { useState, useEffect, useRef } from 'react';

// BeforeInstallPromptEvent is not yet in standard TS DOM lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-banner-dismissed';

/**
 * Unified PWA install banner for iOS Safari and Android Chrome.
 *
 * iOS Safari:  no automatic prompt API exists — shows manual instructions
 *              (Share → "Add to Home Screen"). Dismissed state persisted to localStorage.
 *
 * Android / Chrome: intercepts `beforeinstallprompt`, prevents the default browser
 *              mini-infobar, and shows a custom branded banner with an Install button.
 *              Hides automatically on `appinstalled`.
 */
export function PWAInstallBanner() {
  const [platform, setPlatform] = useState<'ios' | 'ios-other' | 'android' | null>(null);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  // Track the android delay timer so it can be cleared on unmount (fix: timer leak)
  const androidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Non-Safari iOS browsers (Chrome/CriOS, Edge/EdgA/EdgiOS, Firefox/FxiOS, Opera/OPiOS)
    // cannot install PWAs — the Share sheet "Add to Home Screen" option only exists in Safari.
    // Tell the user to open the URL in Safari instead.
    const isNonSafariIOS = isIOS && /CriOS|EdgA|EdgiOS|FxiOS|OPiOS/i.test(ua);

    if (isIOS && !isInStandaloneMode) {
      const timer = setTimeout(() => setPlatform(isNonSafariIOS ? 'ios-other' : 'ios'), 2500);
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
    <div
      role="banner"
      aria-label="Install app"
      className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-border bg-card p-4 shadow-2xl"
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
        <img
          src="/pwa-192x192.png"
          alt="Crypto Dashboard"
          className="h-12 w-12 flex-shrink-0 rounded-xl"
        />

        <div className="flex-1">
          <p className="text-sm font-semibold">Install Crypto Dashboard</p>

          {platform === 'ios' ? (
            // ── iOS Safari: Share → Add to Home Screen ────────────────────────
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Tap{' '}
              <span aria-label="Share button" className="inline-block">
                <svg
                  viewBox="0 0 24 24"
                  className="mb-0.5 inline-block h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{' '}
              then <strong>"Add to Home Screen"</strong> to install this app on your iPhone.
            </p>
          ) : platform === 'ios-other' ? (
            // ── Chrome / Edge / Firefox on iOS: must use Safari ───────────────
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              To install this app, open this page in <strong>Safari</strong> — your current browser
              doesn&apos;t support PWA installation on iOS.
            </p>
          ) : (
            // ── Android / Chrome: real install button ─────────────────────────
            <>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Add to your home screen for a faster, full-screen experience.
              </p>
              <button
                onClick={() => void handleAndroidInstall()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors"
              >
                Install
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
