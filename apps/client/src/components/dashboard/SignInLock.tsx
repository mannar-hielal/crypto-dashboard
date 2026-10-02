/**
 * Sign-in lock — covers the order form and the Orders & Account panel for a signed-out visitor on
 * /chart, with one "Sign in to trade" button. Signed in, it renders its children untouched.
 *
 * 🔐 Layers, outside-in — the overlay is a convenience, not the security boundary:
 *   1. The server rejects every paper-trading route and the private WS without a valid token.
 *   2. paperStore's `token()` throws before any request is made; a visitor's store holds no data.
 *   3. Here: the panel itself is `inert` + `aria-hidden` (removing the overlay node alone leaves it
 *      dead), and a MutationObserver remounts the lock if either is tampered with in DevTools.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { guide } from '@/lib/guideAnchors';
import { useAuthStatus, useSignInToTrade } from '@/hooks/useSignIn';
import styles from './SignInLock.module.css';

interface SignInLockProps {
  children: ReactNode;
  /** Shown as ✕ on the overlay — the phone order sheet's own close button sits under it. */
  onClose?: () => void;
  /**
   * False: dim only, no message or button, sized to its content — for a strip whose prompt is
   * already on screen next to it (the phone Buy / Sell bar under the account panel's lock).
   */
  prompt?: boolean;
}

export function SignInLock({ children, onClose, prompt = true }: SignInLockProps) {
  const status = useAuthStatus();
  if (status === 'user') return <>{children}</>;
  return (
    <LockedPanel showPrompt={prompt && status === 'guest'} fit={!prompt} onClose={onClose}>
      {children}
    </LockedPanel>
  );
}

interface LockedPanelProps {
  children: ReactNode;
  /** False while the session is being restored: dim only, so a returning user sees no prompt flash. */
  showPrompt: boolean;
  /** Size to the content instead of filling the parent */
  fit: boolean;
  onClose?: () => void;
}

function LockedPanel({ children, showPrompt, fit, onClose }: LockedPanelProps) {
  const signIn = useSignInToTrade();
  // Bumped when the lock is tampered with — a new key remounts the wrapper, overlay and all
  const [generation, setGeneration] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 🔐 Restore the lock if DevTools removes the overlay, hides it, or strips `inert` from the panel
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    if (!wrapper || !content || !overlay) return;

    const isTampered = () =>
      !wrapper.contains(overlay) ||
      overlay.hasAttribute('hidden') ||
      overlay.style.length > 0 ||
      overlay.className !== styles.overlay ||
      !content.hasAttribute('inert') ||
      content.getAttribute('aria-hidden') !== 'true';

    const observer = new MutationObserver(() => {
      if (isTampered()) setGeneration((g) => g + 1);
    });
    observer.observe(wrapper, { childList: true });
    observer.observe(content, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
    observer.observe(overlay, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    return () => observer.disconnect();
  }, [generation]);

  return (
    <div
      key={generation}
      ref={wrapperRef}
      className={fit ? `${styles.wrapper} ${styles.fit}` : styles.wrapper}
    >
      <div ref={contentRef} className={styles.content} inert aria-hidden="true">
        {children}
      </div>
      <div ref={overlayRef} className={styles.overlay} {...guide('lock.overlay')}>
        {showPrompt && (
          <>
            <p className={styles.message}>Paper trading needs a free account.</p>
            <button
              type="button"
              className={styles.signIn}
              onClick={signIn}
              {...guide('lock.sign-in')}
            >
              Sign in to trade
            </button>
          </>
        )}
        {onClose && (
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
            {...guide('lock.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
