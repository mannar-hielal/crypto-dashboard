/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PWA_DEV_SW?: string;
  readonly VITE_IS_LIVE?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  /** '1' only in the e2e dev server (apps/e2e/playwright.config.ts): exposes lib/e2eProbe */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
