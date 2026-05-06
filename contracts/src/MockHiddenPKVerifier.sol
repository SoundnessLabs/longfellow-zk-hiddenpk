// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHiddenPKVerifier} from "./IHiddenPKVerifier.sol";

/// @title MockHiddenPKVerifier
/// @notice PLACEHOLDER. Always returns true for non-empty proofs.
///         The real Ligero verifier is not yet implemented in Solidity.
///         Use this only for end-to-end plumbing tests on testnet.
///         DO NOT DEPLOY TO MAINNET. DO NOT SECURE REAL FUNDS.
contract MockHiddenPKVerifier is IHiddenPKVerifier {
    event MockVerified(address indexed ethAddr, bytes32 msgHash, uint256 proofSize);

    function verify(address ethAddr, bytes32 msgHash, bytes calldata proof)
        external
        view
        override
        returns (bool)
    {
        // Minimal sanity check: proof is non-empty and inputs are non-zero.
        // The real verifier will run the Ligero verification algorithm:
        //   1. Recompute Fiat-Shamir transcript
        //   2. Open Merkle commitments at challenged columns
        //   3. Check Reed-Solomon proximity
        //   4. Check sumcheck consistency
        //   5. Bind public inputs (ethAddr, msgHash) to the witness
        //
        // ─────────────────────────────────────────────────────────────────────
        // Notes on reuse from privacy-ethereum/sol-whir
        // ─────────────────────────────────────────────────────────────────────
        //
        // sol-whir is a Solidity verifier for WHIR (Arnon-Chiesa-Fenzi-Yogev,
        // 2024), the FRI/STIR successor that recursively folds a Reed-Solomon
        // codeword to bring its rate down each round. Longfellow uses Ligero,
        // which is structurally different but shares a lot of plumbing.
        //
        // Reusable from sol-whir (with minor or no changes):
        //   - keccak256-based Fiat-Shamir transcript (challenge derivation,
        //     domain separation, absorb/squeeze patterns)
        //   - Merkle path verification with keccak as the leaf/node hash
        //   - Proof byte parsing helpers (length-prefixed reads, endian conv)
        //   - Challenge sampling from transcript bytes
        //
        // What's different (must be written fresh for Ligero):
        //   - Topology: WHIR is recursive (multiple folding rounds, each
        //     halving or quartering the codeword); Ligero is single-round
        //     (one matrix encoding, one batch of column openings, plus a
        //     sumcheck transcript). No folding loop on the Ligero side.
        //   - Proximity test: WHIR checks consistency between consecutive
        //     folded codewords. Ligero checks that the queried columns lie
        //     on a low-degree row codeword (interpolation + evaluation).
        //   - Sumcheck: Ligero's verifier consumes a sumcheck transcript
        //     binding the witness to the circuit; WHIR doesn't have this.
        //   - Field: sol-whir is built over BN254 / Goldilocks / Mersenne-31
        //     style fields with cheap modular arithmetic. Longfellow runs
        //     over the secp256k1 base field, where there is no Solidity
        //     precompile for field ops (only ECRECOVER for the curve).
        //     This is the costliest delta: every field mul becomes an
        //     in-Solidity 256-bit modmul. Tight inline assembly required.
        //   - Public input binding: Ligero's verifier multiplies the public
        //     input vector by a transcript-derived vector and checks against
        //     a committed value. WHIR has no analog.
        //
        // Practical path: fork sol-whir, keep its hash/transcript/Merkle
        // utilities, replace the folding loop with Ligero's column-open +
        // proximity + sumcheck check, and write the secp256k1 base-field
        // ops in assembly. Estimated ~3.4M gas based on the breakdown in
        // the main README.
        // ─────────────────────────────────────────────────────────────────────

        require(ethAddr != address(0), "zero address");
        require(msgHash != bytes32(0), "zero hash");
        require(proof.length > 0, "empty proof");
        return true;
    }
}
