# Hidden-PK Wallet — Frontend

Vite + React + TypeScript interface for the hidden-pk PoC. Connects to MetaMask, builds an ECDSA signature, ships the witness to a local prover server, and displays ZK proof metrics.

## Modes

| Toggle | Flow |
|--------|------|
| **OFF** | `eth_sendTransaction(from → to, value)` — plain EOA transfer, MetaMask confirms. |
| **ON** | `personal_sign(innerTxHash)` → recover pk locally → POST witness to local prover → `HiddenPKWallet.execute(to, value, "0x", proof)`. |

The private key never leaves MetaMask. The circuit relation is:

```
R = { (eth_addr, e) ; (pk, sig) :
      keccak256(pkx || pky)[12:32] == eth_addr  AND
      ECDSA_verify(pk, sig, e) == true }
```

## Step 1 — Build the C++ prover binary

The prover server calls a native binary built from the Longfellow-ZK circuit.

```bash
# from the repo root
mkdir -p build && cd build
cmake ../lib -DCMAKE_BUILD_TYPE=Release
make -j$(sysctl -n hw.ncpu) hidden_pk_prove
```

The binary lands at `build/circuits/hidden_pk/hidden_pk_prove`.  
Override the path at runtime: `HIDDEN_PK_PROVE_BIN=/custom/path npm run server`.

## Step 2 — Install frontend deps

```bash
cd wallet-interface
npm install
cp .env.example .env    # fill in contract addresses once deployed (optional)
```

## Step 3 — Run

Two terminal processes:

```bash
# terminal 1 — local proving server (Node → shells out to C++ binary)
npm run server           # :3001

# terminal 2 — Vite dev server
npm run dev              # :5173
```

Open http://localhost:5173.

The server status dot in the top-right corner of the UI shows whether the prover server is reachable (green = online, red = offline).

## Proof flow (Hidden-PK ON)

1. **Hash** — build `innerTxHash` (keccak of tx fields) locally, or read it from the deployed contract.
2. **Sign** — MetaMask `personal_sign(innerTxHash)` → `(r, s, v)`.
3. **Recover pk** — derive `(pkX, pkY)` from `(r, s, v, msgHash)` using `ecrecover`.
4. **Prove** — POST `{pkX, pkY, r, s, msgHash}` to `/api/prove`.  
   The server calls `hidden_pk_prove --pkX .. --pkY .. --r .. --s .. --msg ..`.  
   The binary runs the full Longfellow Ligero prover (~150 ms on a modern laptop) and returns:
   - `proofHex` — serialized Ligero proof bytes
   - `proveMs` / `verifyMs` — timing
   - `ethAddr` — `keccak256(pkX‖pkY)[12:32]`, the public statement
5. **Submit** (if contract deployed) — `HiddenPKWallet.execute(to, value, "0x", proof)`.

## Deploying `HiddenPKWallet.sol`

Not done yet. Once deployed, add the address to `.env`:

```dotenv
VITE_HIDDEN_PK_WALLET_SEPOLIA=0x...
VITE_HIDDEN_PK_WALLET_HARDHAT=0x...
```

Then restart `npm run dev`. Until then, the UI runs in **demo mode** — proof generates and verifies locally, nothing hits the chain.

## Notes

- The onchain Spartan2 verifier is WIP. Deploy against `MockVerifier.sol` for now.
- `personal_sign` prefixes the hash with `\x19Ethereum Signed Message:\n32`. Both the circuit and contract must bind to the prefixed hash.
- Gas estimate in the UI is a lower bound (calldata cost only); the onchain verifier cost is not yet known.
