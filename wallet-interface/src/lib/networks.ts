// Supported Ethereum networks for the hidden-pk wallet demo.

export interface EthNetwork {
  chainId: number;
  chainIdHex: string;
  name: string;
  shortName: string;
  rpcUrls: string[];
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
    shortName: "Sepolia",
    rpcUrls: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.drpc.org",
      "https://rpc2.sepolia.org",
    ],
    explorer: "https://sepolia.etherscan.io",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    hiddenPkWallet: import.meta.env.VITE_HIDDEN_PK_WALLET_SEPOLIA,
  },
};

export const DEFAULT_NETWORK: keyof typeof NETWORKS = "sepolia";

export function findNetworkByChainId(chainId: number): EthNetwork | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}
