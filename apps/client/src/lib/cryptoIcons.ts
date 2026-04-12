/**
 * cryptoIcons — maps base symbol → bundled static SVG URL.
 *
 * The Vite `?url` suffix emits each SVG as a hashed static asset at build time.
 * Icons are offline-ready (PWA) and add zero runtime overhead — just an <img> src.
 * Source: cryptocurrency-icons (atomiclabs) — svg/color/*.svg
 *
 * To add more symbols: install no new packages — just import the SVG and add
 * the entry to CRYPTO_ICON_URLS below.
 */

// ─── URL imports (Vite bundles these as hashed static assets) ────────────────

import btcUrl from 'cryptocurrency-icons/svg/color/btc.svg?url';
import ethUrl from 'cryptocurrency-icons/svg/color/eth.svg?url';
import solUrl from 'cryptocurrency-icons/svg/color/sol.svg?url';
import bnbUrl from 'cryptocurrency-icons/svg/color/bnb.svg?url';
import xrpUrl from 'cryptocurrency-icons/svg/color/xrp.svg?url';
import dogeUrl from 'cryptocurrency-icons/svg/color/doge.svg?url';
import adaUrl from 'cryptocurrency-icons/svg/color/ada.svg?url';
import avaxUrl from 'cryptocurrency-icons/svg/color/avax.svg?url';
import linkUrl from 'cryptocurrency-icons/svg/color/link.svg?url';

// ─── Symbol → URL map ────────────────────────────────────────────────────────

export const CRYPTO_ICON_URLS: Record<string, string> = {
  BTC: btcUrl,
  ETH: ethUrl,
  SOL: solUrl,
  BNB: bnbUrl,
  XRP: xrpUrl,
  DOGE: dogeUrl,
  ADA: adaUrl,
  AVAX: avaxUrl,
  LINK: linkUrl,
} as const;
