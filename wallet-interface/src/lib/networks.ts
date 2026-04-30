// Supported Ethereum networks for the hidden-pk wallet demo.

export interface EthNetwork {
  chainId: number;
  chainIdHex: string;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorer: string;
  currency: { name: string; symbol: string; decimals: number };
  /** Address of a deployed HiddenPKWallet on this chain, if any. */
  hiddenPkWallet?: string;
}

export const NETWORKS: Record<string, EthNetwork> = {
  sepolia: {
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    name: "Sepolia",
    shortName: "sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    explorer: "https://sepolia.etherscan.io",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    hiddenPkWallet: import.meta.env.VITE_HIDDEN_PK_WALLET_SEPOLIA,
  },
  hardhat: {
    chainId: 31337,
    chainIdHex: "0x7a69",
    name: "Hardhat Local",
    shortName: "hardhat",
    rpcUrl: "http://127.0.0.1:8545",
    explorer: "",
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    hiddenPkWallet: import.meta.env.VITE_HIDDEN_PK_WALLET_HARDHAT,
  },
};

export const DEFAULT_NETWORK: keyof typeof NETWORKS = "sepolia";

export function findNetworkByChainId(chainId: number): EthNetwork | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}
