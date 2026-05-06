# HiddenPK Wallet — Solidity Contracts

Smart contract wallet authorized by a ZK proof of an ECDSA signature, with the public key never appearing onchain.

> **Status: research prototype**. The on-chain Ligero verifier is **not yet implemented**. This folder ships a `MockHiddenPKVerifier` that always returns true, so you can deploy the wallet end-to-end on testnet and exercise the call flow, but it provides **no cryptographic security**.

---

## What's in here

| File | Status | Description |
|------|--------|-------------|
| `src/IHiddenPKVerifier.sol` | real | Verifier interface. Stable. |
| `src/HiddenPKWallet.sol` | real | Wallet contract. Nonce, replay protection, call execution. |
| `src/MockHiddenPKVerifier.sol` | **placeholder** | Always returns true. Sanity-checks input shape. |
| `script/Deploy.s.sol` | real | Foundry script to deploy both on Sepolia. |
| `test/HiddenPKWallet.t.sol` | real | Tests the wallet's call flow against the mock verifier. |

---

## What's real vs. what's missing

### Real (works today)

- ZK circuit (`lib/circuits/hidden_pk/`) — proves `keccak256(pk.x || pk.y)[12:32] == eth_addr AND ECDSA_verify(pk, sig, msg) == true`
- Standalone CLI prover (`hidden_pk_prove`) — outputs serialized Longfellow-ZK proof bytes
- Prover server + wallet UI — the user signs a real transaction in MetaMask, the prover server generates the ZK proof
- Wallet contract logic — nonce, digest binding (chainId, wallet, nonce, to, value, data), replay protection
- Deploy script — works on Sepolia today with the mock verifier

### Placeholder (stubbed for plumbing)

- **`MockHiddenPKVerifier.verify()`** — returns `true` for any non-empty proof. The wallet will execute *any* call as long as the proof bytes aren't empty. Do not use this with real funds.

### Missing (the hard part)

- **On-chain Ligero verifier in Solidity.** This is the main piece of work between today and a production wallet. It needs:
  1. Fiat-Shamir transcript reconstruction (keccak256 already cheap onchain)
  2. Merkle path verification for ~132 opened columns
  3. Reed-Solomon proximity check over the secp256k1 base field
  4. Sumcheck consistency check
  5. Public input binding to (`ethAddr`, `msgHash`)

  Estimated gas (from main README): ~3.4M gas for verification, ~3M for calldata. Total around 6.5M which fits in a Sepolia/mainnet block.

  **Starting point: [privacy-ethereum/sol-whir](https://github.com/privacy-ethereum/sol-whir).** WHIR is a different proof system (FRI-style recursive folding) but shares the hash-based RS-proximity skeleton with Ligero. Fiat-Shamir, Merkle path verification, and challenge sampling can be lifted almost as-is. The folding loop has to be replaced with Ligero's single-round column opening plus sumcheck check, and the field arithmetic has to be rewritten for secp256k1's base field (no Solidity precompile — needs assembly modmul). See the long comment in `MockHiddenPKVerifier.sol` for a full reuse breakdown.

- **Wasm prover** for client-side proving (so the prover server can go away entirely).

- **Audited security parameters.** Current defaults give ~109-bit security (rate=7, nreq=132). See main README's standalone-prover section for tunable parameters and security levels.

---

## Deploy to Sepolia

### Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Get Sepolia ETH (free)
# https://faucets.chain.link/sepolia
# https://sepoliafaucet.com
```

### Setup

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
cp .env.example .env
# Edit .env — set PRIVATE_KEY to a deployer key with Sepolia ETH
# Set OWNER_ADDR to the address that will own the wallet
```

### Build and test locally

```bash
forge build
forge test -vv
```

Expected output: 3 passing tests against the mock verifier.

### Deploy

```bash
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

The script logs both addresses. Copy the `HiddenPKWallet` address into the wallet UI:

```bash
# In wallet-interface/.env
VITE_HIDDEN_PK_WALLET_SEPOLIA=0x...
```

### Fund the wallet

Send some Sepolia ETH to the deployed `HiddenPKWallet` address so it has funds to execute transfers.

---

## End-to-end flow (with mock verifier)

1. User connects MetaMask in the UI (with the `OWNER_ADDR` account).
2. User enters recipient + amount, hits **Send & Prove**.
3. UI calls `eth_sendTransaction` — MetaMask shows the standard transfer dialog. User confirms. The transfer happens directly (this is the current flow — the wallet UI doesn't yet route through `HiddenPKWallet.execute`).
4. UI extracts (pk.x, pk.y, r, s, msgHash) from the signed tx, sends to prover server.
5. Prover server runs `hidden_pk_prove` and returns the proof bytes.
6. *(future)* UI calls `HiddenPKWallet.execute(to, value, data, proof)` instead of step 3, and the wallet contract verifies the proof onchain before executing.

The current UI does step 3 directly because the on-chain verifier doesn't exist. Once the real verifier is implemented, the flow flips: the wallet contract holds the funds and the user only signs (the proof) without sending ETH directly.

---

## When the real verifier lands

Replace `MockHiddenPKVerifier` with the real one. The interface (`IHiddenPKVerifier`) and the wallet (`HiddenPKWallet`) don't need to change. Existing wallet deployments can be upgraded by deploying a new wallet pointing at the new verifier.
