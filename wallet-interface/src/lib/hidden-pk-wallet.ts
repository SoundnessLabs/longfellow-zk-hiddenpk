// HiddenPKWallet contract ABI + helpers for the hidden-pk mode flow.

import { ethers } from "ethers";
import type { Eip1193Provider } from "./metamask";

export const HIDDEN_PK_WALLET_ABI = [
  "function pkHashHi() view returns (uint128)",
  "function pkHashLo() view returns (uint128)",
  "function nonce() view returns (uint256)",
  "function computeTxHash(address to, uint256 value, bytes data, uint256 nonce) view returns (bytes32)",
  "function execute(address to, uint256 value, bytes data, bytes proof)",
  "event Executed(address indexed to, uint256 value, bytes data, uint256 nonce)",
];

export interface HiddenPkSignedMsg {
  /** Final 32-byte hash that was signed (the one the ZK circuit binds to). */
  msgHash: string;
  /** secp256k1 public key X coordinate, 0x-prefixed 32-byte hex. */
  pkX: string;
  /** secp256k1 public key Y coordinate, 0x-prefixed 32-byte hex. */
  pkY: string;
  /** ECDSA r, 0x-prefixed 32-byte hex. */
  r: string;
  /** ECDSA s, 0x-prefixed 32-byte hex (low-S normalised). */
  s: string;
}

/**
 * Send a real ETH transfer via MetaMask (shows the standard transfer UI, not a
 * raw signing prompt), then extract the ECDSA signature from the submitted
 * transaction and recover the public key from it.
 *
 * This is the correct witness-extraction path: the user signs a real transaction,
 * ETH moves onchain, and we derive (pkX, pkY, r, s, msgHash) from the signed tx
 * bytes — not from a synthetic message hash.
 */
export async function sendAndExtractWitness(
  provider: Eip1193Provider,
  account: string,
  to: string,
  valueWei: bigint,
): Promise<{ txHash: string } & HiddenPkSignedMsg> {
  // 1. Send the actual ETH transaction. MetaMask opens its standard "Sending N ETH" dialog.
  const txHash: string = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: account, to, value: "0x" + valueWei.toString(16) }],
  });

  // 2. Fetch the signed transaction from the mempool so we can read (r, s) and
  //    reconstruct the exact hash that was signed (the unsigned RLP-encoded tx hash,
  //    not a personal_sign prefix hash).
  const bp = new ethers.BrowserProvider(provider as unknown as ethers.Eip1193Provider);
  let tx: ethers.TransactionResponse | null = null;
  for (let attempt = 0; attempt < 12 && !tx; attempt++) {
    tx = await bp.getTransaction(txHash);
    if (!tx) await new Promise((r) => setTimeout(r, 350));
  }
  if (!tx) throw new Error(`Transaction ${txHash} not found in mempool after submission`);

  // 3. (r, s) straight from the transaction — no low-S normalization needed;
  //    the circuit verifies the standard ECDSA equation for any valid s.
  const sig = tx.signature;
  const r   = sig.r;
  const s   = sig.s;

  // TransactionResponse.chainId is null while the tx is still pending (not mined).
  // Get chainId from the provider network instead, then reconstruct the unsigned
  // transaction to compute the exact digest the wallet signed.
  const { chainId } = await bp.getNetwork();
  const unsignedTx = ethers.Transaction.from({
    type:                 tx.type ?? 2,
    chainId,
    nonce:                tx.nonce,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    maxFeePerGas:         tx.maxFeePerGas,
    gasLimit:             tx.gasLimit,
    to:                   tx.to,
    value:                tx.value,
    data:                 tx.data,
    accessList:           tx.accessList ?? [],
  });
  const msgHash = unsignedTx.unsignedHash;

  // 4. Recover the uncompressed secp256k1 public key.
  const pubKeyHex = ethers.SigningKey.recoverPublicKey(msgHash, sig);
  const bytes = ethers.getBytes(pubKeyHex); // 65 bytes: 0x04 || X || Y
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error("Unexpected public key encoding from ecrecover");
  }
  const pkX = ethers.hexlify(bytes.slice(1, 33));
  const pkY = ethers.hexlify(bytes.slice(33, 65));

  return { txHash, msgHash, pkX, pkY, r, s };
}

export async function buildInnerTxHash(
  rpcUrl: string,
  walletAddr: string,
  to: string,
  valueWei: bigint,
  data: string,
): Promise<{ innerHash: string; nonce: bigint }> {
  const rpc = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Contract(walletAddr, HIDDEN_PK_WALLET_ABI, rpc);
  const nonce: bigint = await wallet.nonce();
  const innerHash: string = await wallet.computeTxHash(to, valueWei, data, nonce);
  return { innerHash, nonce };
}

export async function sendExecute(
  provider: Eip1193Provider,
  from: string,
  walletAddr: string,
  to: string,
  valueWei: bigint,
  data: string,
  proofHex: string,
): Promise<string> {
  const iface = new ethers.Interface(HIDDEN_PK_WALLET_ABI);
  const calldata = iface.encodeFunctionData("execute", [to, valueWei, data, proofHex]);
  return provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: walletAddr, data: calldata }],
  });
}
