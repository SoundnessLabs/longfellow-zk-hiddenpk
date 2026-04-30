/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HIDDEN_PK_WALLET_SEPOLIA?: string;
  readonly VITE_HIDDEN_PK_WALLET_HARDHAT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
