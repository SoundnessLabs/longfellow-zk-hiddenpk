// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IHiddenPKVerifier
/// @notice Verifier interface for the hidden-PK ZK proof.
///         A real implementation must verify the Ligero proof binding
///         (eth_addr, msgHash) to a valid secp256k1 ECDSA signature
///         under a public key whose keccak256(x||y)[12:32] == eth_addr.
interface IHiddenPKVerifier {
    /// @param ethAddr  the 20-byte Ethereum address that authorizes the action
    /// @param msgHash  the 32-byte digest the wallet signed
    /// @param proof    Longfellow-ZK serialized proof bytes
    /// @return true iff the proof is valid for (ethAddr, msgHash)
    function verify(address ethAddr, bytes32 msgHash, bytes calldata proof)
        external
        view
        returns (bool);
}
