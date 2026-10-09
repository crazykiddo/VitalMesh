/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ElectronAPI {
  onNavigate: (callback: (view: string) => void) => (() => void) | void;
}

interface Window {
  electronAPI?: ElectronAPI;
}