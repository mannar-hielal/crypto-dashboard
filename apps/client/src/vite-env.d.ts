/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PWA_DEV_SW?: string;
  readonly VITE_IS_LIVE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
