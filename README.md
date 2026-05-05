<p align="center">
  <a href="https://soundness.xyz" target="_blank">
    <img src="https://soundness-xyz.notion.site/image/attachment%3Aa4df3045-521c-41da-a0ef-ad89d7b2852e%3Abacf94a6-5284-4794-b5ec-5a8844affca7.png?table=block&id=262cb720-3e2b-80ee-af44-e4101aab1819&spaceId=2b0fa06f-b360-4628-a423-b7731e622496&width=1420&userId=&cache=v2" alt="Soundness Labs Logo" width="400">
  </a>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/status-Work_In_Progress-yellow" alt="Status: WIP"></a>
  <a href="#"><img src="https://img.shields.io/badge/build-success-green" alt="Build"></a>
  <a href="https://soundness.xyz"><img src="https://img.shields.io/badge/Website-soundness.xyz-purple" alt="Website"></a>
</p>

# Hidden-PK Wallet Circuit

**By [Soundness Labs](https://soundness.xyz)** — built on [Longfellow-ZK](https://github.com/google/longfellow-zk) (Google)

> **Work in Progress**: This is an active research prototype and is not production-ready. APIs, circuit design, and parameters may change. Do not use this to secure real assets until a stable release is announced.

This repo extends the Longfellow-ZK library with a `hidden_pk` circuit that proves ECDSA signature validity over secp256k1 without revealing the public key or the signature. The circuit is the cryptographic core of [ERC-XXXX: Hidden-PK Wallet](./ERC-DRAFT.md), a quantum-resistant smart contract wallet standard that works with today's Ethereum infrastructure.

The public key and signature never appear onchain. Hash preimage resistance survives quantum attacks. The account stays quantum-safe regardless of how many transactions it processes.

---

## Table of Contents

- [What We Built](#what-we-built)
- [Circuit Relation](#circuit-relation)
- [Keccak-256 Support](#keccak-256-support)
- [Prerequisites](#prerequisites)
- [Build](#build)
- [Running the Tests](#running-the-tests)
- [Benchmarks](#benchmarks)
- [Repository Structure](#repository-structure)
- [Acknowledgements](#acknowledgements)
- [About Soundness Labs](#about-soundness-labs)

---

## What We Built

Longfellow-ZK is a Google-developed ZK library for anonymous credentials: proving statements about ECDSA signatures without revealing them. It uses a Ligero-based proof system with a CRT Reed-Solomon construction that handles secp256k1's FFT-unfriendly field (secp256k1's base field has `v_2(p^2−1) = 5`, making standard NTT-based RS unusable).

We contributed a `hidden_pk` circuit on top of this library that proves the following:

1. A valid secp256k1 ECDSA signature exists under some public key `pk`
2. `keccak256(pkx_bytes || pky_bytes)[12:32] == eth_addr`

Both `pk` and `(r, s)` stay as private witnesses. The public statement is the standard 20-byte Ethereum address — no intermediate hash or custom commitment scheme. The onchain contract stores only the existing Ethereum address and validates transactions via this ZK proof.

---

## Circuit Relation

```
R = { (eth_addr, e) ; (pk, sig) :
        keccak256(pkx_bytes || pky_bytes)[12:32] == eth_addr
    AND ECDSA_verify_secp256k1(pk, sig, e) == true }
```

`e` is the transaction hash (public). `eth_addr` is the standard 20-byte Ethereum address (public). `pk = (pkx, pky)` and `sig = (r, s)` are private witnesses. Revealing `(r, s)` alongside `e` is enough to recover `pk` via `ecrecover`: this is why both must stay hidden.

The public input is the native Ethereum address format — no custom commitment or extra onchain translation step required.

---

## Keccak-256 Support

Ethereum's address derivation uses Keccak-256, not SHA3-256. They share the same Keccak-f[1600] permutation and 136-byte rate, but differ only in the padding byte appended before squeezing: `0x01` for Keccak-256 (Ethereum), `0x06` for SHA3-256, `0x1F` for SHAKE-256. Longfellow-ZK's SHA3 circuit already proved SHA3-256 and SHAKE; we extended it to cover Keccak-256 by adding:

- **`circuits/tests/sha3/sha3_reference.cc`** — `keccak256Hash` reference implementation (0x01 padding)
- **`circuits/tests/sha3/sha3_witness.cc`** — `compute_witness_keccak256` to generate Keccak block witnesses
- **`circuits/tests/sha3/sha3_circuit.h`** — `assert_keccak256` circuit method for in-circuit Keccak-256 proofs
- **`circuits/tests/sha3/sha3_reference_test.cc`** — known-vector tests including `keccak256("")`, `keccak256("abc")`, and an Ethereum address derivation sanity check

The `hidden_pk` circuit then uses `assert_keccak256` directly: the 64-byte input `pkx_bytes || pky_bytes` fits in a single Keccak block (rate = 136 bytes), so the proof requires exactly one Keccak permutation witness. The circuit outputs bytes `[12:32]` of the 32-byte digest as the Ethereum address public input, matching the native onchain address format without any extra commitment layer.

## Prerequisites

### macOS

```bash
brew install googletest google-benchmark zstd
```

Ensure Xcode command line tools (clang, cmake) are installed.

### Ubuntu / Debian

```bash
sudo apt install -y clang cmake libssl-dev libzstd-dev libgtest-dev libbenchmark-dev zlib1g-dev
```

### Fedora / RedHat

```bash
yum install -y clang libzstd-devel openssl-devel git cmake google-benchmark-devel gtest-devel
```

---

## Build

```bash
git clone https://github.com/SoundnessLabs/longfellow-zk-hiddenpk.git
cd longfellow-zk-hiddenpk

CXX=clang++ cmake -DCMAKE_BUILD_TYPE=Release -S lib -B clang-build-release
make -C clang-build-release hidden_pk_test -j16
```

OR
```bash
make -C clang-build-release hidden_pk_test -j$(nproc)
```
---

## Running the Tests

All commands run from the repo root.

```bash
# Full test suite (circuit size + ZK prove/verify)
./clang-build-release/circuits/hidden_pk/hidden_pk_test

# Circuit size only (~300ms, mostly compilation)
./clang-build-release/circuits/hidden_pk/hidden_pk_test --gtest_filter=HiddenPK.CircuitSize

# Full ZK prove + verify with timing breakdown
./clang-build-release/circuits/hidden_pk/hidden_pk_test --gtest_filter=HiddenPK.ZkProverVerifier

# Prover benchmark (circuit compiled outside the loop)
./clang-build-release/circuits/hidden_pk/hidden_pk_test --benchmark_filter=BM_HiddenPKProver
```

---

## Standalone Prover

`hidden_pk_prove` is a CLI that takes a raw secp256k1 ECDSA witness and produces a self-contained JSON proof.

### Build

```bash
CXX=clang++ cmake -DCMAKE_BUILD_TYPE=Release -S lib -B build
make -C build hidden_pk_prove -j$(nproc)
```

### Run

```bash
./build/circuits/hidden_pk/hidden_pk_prove \
  --pkX 0x8318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75 \
  --pkY 0x3547f11ca8696646f2f3acb08e31016afac23e630c5d11f59f61fef57b0d2aa5 \
  --r   0xd71d651943f3f678a2571bab862ef7e55cf6b893b951547dff3ae8f16b5cf2ce \
  --s   0x5e4e4a914bbcc682c21bd2158736bb37cb99eb83e2fde5cda2d7f83769e10ca2 \
  --msg 0x3c173364254c586f7c89f2fc2b6fe6aab4699dbd3a71bfd9c5a3313bd73fb577 \
  > proof.json
```

The values above use Hardhat account #0 (private key `0xac0974...2ff80`) signing a known message. Expected `ethAddr` in the output: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`.

### Output format

```json
{
  "proofHex": "0x...",
  "proofSizeBytes": 292163,
  "proveMs": 144,
  "verifyMs": 86,
  "ethAddr": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
}
```

Numbers above are from Apple M1 single-core with default parameters (`--rate 7 --nreq 132`). `proveMs` and `verifyMs` measure only the ZK work; circuit compilation (~370ms one-time per process) is not included. The `time` command will show ~600ms wall-clock because it includes that compilation.

### Optional parameters

| Flag | Default | Description |
|---|---|---|
| `--rate N` | `7` | Reed-Solomon rate. Higher rate = longer RS codewords = more commit work. Only reduces proof size if nreq is also reduced. |
| `--nreq N` | `132` | Number of Ligero random queries. Main knob for size/security trade-off. See "Choosing rate and nreq" below. |
| `--version N` | `7` | Transcript version tag |

### Choosing rate and nreq

In Ligero's unique decoding regime, the soundness error per opened column is bounded by

$$\varepsilon_{\text{query}} \approx \frac{\text{rate}+1}{2 \cdot \text{rate}}$$

so the security level in bits after `nreq` independent queries is

$$\lambda \approx n_{\text{req}} \cdot \log_2 \frac{2 \cdot \text{rate}}{\text{rate}+1}$$

Solve for the minimum `nreq` that hits a target security level $\lambda$:

$$n_{\text{req}} = \left\lceil \frac{\lambda}{\log_2 \frac{2 \cdot \text{rate}}{\text{rate}+1}} \right\rceil$$

This matches the analysis in the [Longfellow security review (Section S6, Dec 2025)](https://google.github.io/longfellow-zk/reviews/Longfellow_security_2025_12_15.pdf). The trade-off: increasing rate gives you better soundness per query (fewer queries needed) but a longer Reed-Solomon codeword, which means a slower commit phase and a slightly larger fixed proof overhead.

### Parameter comparison (Apple M1, single core, secp256k1 base field)

| rate | nreq | prove | verify | size | security |
|------|------|-------|--------|------|----------|
| 7 | 132 | 144ms | 86ms | 285KB | ~109 bits (current default) |
| 12 | 124 | 164ms | 103ms | 274KB | ~110 bits |
| 12 | 113 | 167ms | 102ms | 263KB | ~100 bits |
| 12 | 100 | 170ms | 101ms | 245KB | ~88 bits |

Going from `rate=7, nreq=132` to `rate=12, nreq=124` keeps the same security level (~110 bits) and shaves ~11KB off the proof. At `rate=12, nreq=113` you get ~100-bit security at 263KB. The savings are real but modest at this circuit size: the longer codeword at rate=12 increases per-query Merkle path depth by ~1 hash, partially eating the benefit of needing fewer queries.

For very small proofs at lower security (e.g. ~88 bits, comparable to the upstream mdoc circuit's `rate=4, nreq=128`), `rate=12, nreq=100` gives 245KB.

---

## Benchmarks

Measured on Apple M1 (single core, Release build). Circuit parameters: `kLigeroRate=7`, `kLigeroNreq=132`.

| Metric | Value |
|---|---|
| Circuit inputs | 8,110 |
| Public inputs | 162 (160 eth_addr bits + e) |
| Circuit layers | 37 |
| Circuit compilation (one-time) | ~370ms |
| RS commitment | ~58ms |
| Sumcheck | ~90ms |
| **Total prove time** | **~144ms** |
| **Verification time** | **~86ms** |

Circuit compilation is a one-time cost per session. On mobile hardware expect 2–4× the proving time.

The previous SHA-256 version produced 258 public input bits (a custom 32-byte hash) and required an onchain `sha256(pk) == pkHash` check. The Keccak-256 version produces 162 public input bits — a standard 20-byte Ethereum address — and eliminates that onchain step entirely. The proving time increase (~144ms vs ~87ms) is the cost of replacing the two-block SHA-256 circuit with the Keccak-f[1600] permutation circuit.

### Onchain cost estimate (mainnet)

The verifier is hash-only — no pairings, no elliptic curve ops. Gas breaks down as:

| Item | Gas |
|---|---|
| Calldata (~70% non-zero bytes) | ~3M |
| Keccak256 Fiat-Shamir (~200 calls) | ~50K |
| Merkle path verification (132 paths) | ~330K |
| Linear combination over public inputs | ~50K |
| **Total** | **~3.4M gas** |

---

## Repository Structure

Files added to the Longfellow-ZK base:

```
lib/circuits/hidden_pk/
├── CMakeLists.txt          Build targets for hidden_pk_test and hidden_pk_prove
├── hidden_pk_circuit.h     Circuit: ECDSA verify + Keccak-256 Ethereum address
├── hidden_pk_witness.h     Witness computation from (pk, e, r, s)
├── hidden_pk_test.cc       Tests and Google Benchmark
└── hidden_pk_prove.cc      Standalone proving CLI (outputs JSON)

lib/circuits/tests/sha3/    (extended from upstream)
├── sha3_circuit.h          Added assert_keccak256 (0x01 padding)
├── sha3_reference.h/.cc    Added keccak256Hash reference implementation
├── sha3_witness.h/.cc      Added compute_witness_keccak256
└── sha3_reference_test.cc  Added Keccak-256 known-vector + Ethereum address tests
```

---

## Acknowledgements

This work builds on:

- [Longfellow-ZK](https://github.com/google/longfellow-zk) by Google — the ZK library and Ligero/sumcheck proving backend
- [Anonymous Credentials from ECDSA](https://eprint.iacr.org/2024/2010) — Frigo and Shelat, the paper this library implements


## About Soundness Labs

<p align="center">
  <a href="https://soundness.xyz" target="_blank">
    <img src="https://soundness-xyz.notion.site/image/attachment%3Aa4df3045-521c-41da-a0ef-ad89d7b2852e%3Abacf94a6-5284-4794-b5ec-5a8844affca7.png?table=block&id=262cb720-3e2b-80ee-af44-e4101aab1819&spaceId=2b0fa06f-b360-4628-a423-b7731e622496&width=1420&userId=&cache=v2" alt="Soundness Labs Logo" width="400">
  </a>
</p>

**[Soundness Labs](https://soundness.xyz)** builds quantum-ready cryptographic infrastructure for blockchains, replacing fragile trust with verifiable security.

- **Website**: [soundness.xyz](https://soundness.xyz)
- **GitHub**: [github.com/SoundnessLabs](https://github.com/SoundnessLabs)
- **X**: [@SoundnessLabs](https://twitter.com/SoundnessLabs)

---

<p align="center">
  <b>By Soundness Labs</b><br>
  <i>Towards building a Sound Internet.</i>
</p>