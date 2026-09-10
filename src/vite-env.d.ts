/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Backend base URL, including the /api/v1 prefix. Defaults to production
   * when unset — see API_BASE_URL in src/networks/network/apiHelpers.ts.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
