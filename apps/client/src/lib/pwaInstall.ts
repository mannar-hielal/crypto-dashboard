/**
 * The PWA install banner's wording, by browser (PWAInstallBanner.tsx). Pure: no React.
 */

/** The installed app's name: the manifest's `short_name` and iOS's `apple-mobile-web-app-title` */
export const APP_NAME = 'CryptoPaperTrade';

export type InstallPlatform = 'ios' | 'ipad' | 'ios-other' | 'android' | 'android-firefox';

/**
 * Where the Share button is, in the browser the learner is using (owner 2026-11-13: since iOS 16.4
 * Chrome, Edge and Firefox add to the Home Screen from their own Share menu, so nobody is sent to
 * Safari any more)
 */
export function shareStep(platform: InstallPlatform, ua: string): string {
  if (platform === 'ipad') return 'in the top-right toolbar of Safari';
  if (platform === 'ios') return 'at the bottom of Safari';
  if (/CriOS/i.test(ua)) return 'at the right of Chrome’s address bar';
  if (/FxiOS/i.test(ua)) return 'in Firefox’s ☰ menu';
  if (/EdgiOS/i.test(ua)) return 'in Edge’s ⋯ menu';
  return 'in your browser’s toolbar or menu';
}
