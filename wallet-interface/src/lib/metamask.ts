// MetaMask EIP-1193 helpers.

import type { EthNetwork } from "./networks";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (ev: string, handler: (...args: any[]) => void) => void;
  removeListener?: (ev: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

/** Pick the MetaMask provider even if multiple wallets inject into window.ethereum. */
export function getMetaMaskProvider(): Eip1193Provider | null {
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers && Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    if (mm) return mm;
  }
  if (eth.isMetaMask) return eth;
  return eth; // fallback
}

export async function connect(): Promise<{ provider: Eip1193Provider; account: string; chainId: number }> {
  const provider = getMetaMaskProvider();
  if (!provider) throw new Error("MetaMask not detected. Install the extension.");
  const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
  const chainIdHex: string = await provider.request({ method: "eth_chainId" });
  return { provider, account: accounts[0], chainId: parseInt(chainIdHex, 16) };
}

export async function switchChain(provider: Eip1193Provider, net: EthNetwork): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: net.chainIdHex }] });
  } catch (err: any) {
    // Chain not added to MetaMask — add it then switch.
    if (err.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: net.chainIdHex,
          chainName: net.name,
          rpcUrls: net.rpcUrls,
          nativeCurrency: net.currency,
          blockExplorerUrls: net.explorer ? [net.explorer] : undefined,
        }],
      });
    } else {
      throw err;
    }
  }
}

export async function getBalance(provider: Eip1193Provider, account: string): Promise<bigint> {
  const hex: string = await provider.request({ method: "eth_getBalance", params: [account, "latest"] });
  return BigInt(hex);
}

export async function sendEth(
  provider: Eip1193Provider,
  from: string,
  to: string,
  valueWei: bigint,
): Promise<string> {
  return provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, value: "0x" + valueWei.toString(16) }],
  });
}
