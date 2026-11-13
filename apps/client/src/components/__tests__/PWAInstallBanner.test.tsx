import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';
import { shareStep } from '@/lib/pwaInstall';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
};

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

function showBanner() {
  render(<PWAInstallBanner />);
  act(() => vi.advanceTimersByTime(2600));
}

describe('PWAInstallBanner', () => {
  const original = navigator.userAgent;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setUA(original);
  });

  it('should name the app CryptoPaperTrade and show Safari’s steps on an iPhone', () => {
    setUA(UA.iphoneSafari);
    showBanner();
    expect(screen.getByText('Install CryptoPaperTrade')).toBeTruthy();
    expect(document.body.textContent).toContain('at the bottom of Safari');
    expect(document.body.textContent).toContain('Add to Home Screen');
  });

  it('should give Chrome on iOS its own Share steps, never send it to Safari (owner 2026-11-13)', () => {
    setUA(UA.iphoneChrome);
    showBanner();
    expect(document.body.textContent).toContain('at the right of Chrome’s address bar');
    expect(document.body.textContent).not.toMatch(/open this page in Safari/i);
    expect(screen.getByRole('list', { name: 'How to install' }).children).toHaveLength(3);
  });

  it('should show Firefox on Android its menu steps, as it has no install prompt', () => {
    setUA(UA.androidFirefox);
    showBanner();
    expect(document.body.textContent).toContain('Firefox’s ⋮ menu');
    expect(document.body.textContent).toContain('Install');
  });

  it('should stay hidden once dismissed', () => {
    localStorage.setItem('pwa-install-banner-dismissed', 'true');
    setUA(UA.iphoneSafari);
    showBanner();
    expect(screen.queryByText('Install CryptoPaperTrade')).toBeNull();
  });

  it('should say where each iOS browser keeps its Share button', () => {
    expect(shareStep('ipad', UA.iphoneSafari)).toBe('in the top-right toolbar of Safari');
    expect(shareStep('ios-other', UA.iphoneFirefox)).toBe('in Firefox’s ☰ menu');
    expect(shareStep('ios-other', 'Mozilla/5.0 (iPhone) EdgiOS/131')).toBe('in Edge’s ⋯ menu');
    expect(shareStep('ios-other', 'Mozilla/5.0 (iPhone) OPiOS/5')).toBe(
      'in your browser’s toolbar or menu'
    );
  });
});
