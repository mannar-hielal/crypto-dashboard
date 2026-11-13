/**
 * Which requests the service worker's runtime cache may serve (vite.config.ts, Workbox
 * `runtimeCaching`). Workbox writes this function into the service worker as source text, so it
 * must stay self-contained: no imports, no outside variables.
 *
 * Same-origin static assets only (review on #287): the API is another origin
 * (api.cryptopapertrade.com), and its `/health` probe or any other response must never come from
 * a cache. `/api/*` stays excluded for a same-origin API (local development).
 */
export function isCacheableAsset({ url }: { url: URL }): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
    !url.pathname.startsWith('/api/')
  );
}
