// Client for the local prover server (server/prover-server.mjs).

export interface ProveRequest {
  pkX: string;      // 0x + 64 hex
  pkY: string;
  r: string;
  s: string;
  msgHash: string;
}

export interface ProveResponse {
  proofHex: string;          // 0x-prefixed proof bytes
  proofSizeBytes: number;
  setupMs: number | null;    // always null for Ligero (transparent setup)
  proveMs: number;
  verifyMs: number;
  ethAddr: string;           // keccak256(pkX ‖ pkY)[12:32], the Ethereum address
}

export async function generateProof(req: ProveRequest): Promise<ProveResponse> {
  const res = await fetch("/api/prove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`prover server error: ${msg}`);
  }
  return res.json();
}

export async function proverHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health");
    return res.ok;
  } catch {
    return false;
  }
}
