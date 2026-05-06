// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHiddenPKVerifier} from "./IHiddenPKVerifier.sol";

/// @title HiddenPKWallet
/// @notice A smart contract wallet whose owner is identified by a standard
///         Ethereum address, but where the corresponding secp256k1 private
///         key signs transactions via a ZK proof. The public key never
///         appears onchain, providing post-quantum security as long as
///         keccak256 preimage resistance holds.
///
/// @dev    Replay protection uses a per-wallet nonce. The signed digest
///         binds (chainId, walletAddr, nonce, to, value, data) so a proof
///         can only execute one specific call.
contract HiddenPKWallet {
    /// @notice The 20-byte address whose private key authorizes execution.
    address public immutable owner;

    /// @notice The ZK verifier contract.
    IHiddenPKVerifier public immutable verifier;

    /// @notice Monotonic nonce, incremented on every successful execute.
    uint256 public nonce;

    event Executed(
        uint256 indexed nonce,
        address indexed to,
        uint256 value,
        bytes data
    );

    error InvalidProof();
    error CallFailed(bytes returnData);

    constructor(address _owner, IHiddenPKVerifier _verifier) {
        require(_owner != address(0), "zero owner");
        require(address(_verifier) != address(0), "zero verifier");
        owner = _owner;
        verifier = _verifier;
    }

    receive() external payable {}

    /// @notice Compute the digest the user must sign to authorize a call.
    /// @dev    Binds chain, wallet, nonce, and call params for replay safety.
    function computeTxHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 _nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(block.chainid, address(this), _nonce, to, value, data)
        );
    }

    /// @notice Execute a call authorized by a hidden-PK ZK proof.
    /// @param to     destination address
    /// @param value  ETH to send
    /// @param data   calldata
    /// @param proof  Longfellow-ZK proof binding (owner, msgHash) to (pk, sig)
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata proof
    ) external returns (bytes memory) {
        bytes32 msgHash = computeTxHash(to, value, data, nonce);

        if (!verifier.verify(owner, msgHash, proof)) revert InvalidProof();

        unchecked { nonce++; }

        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) revert CallFailed(ret);

        emit Executed(nonce - 1, to, value, data);
        return ret;
    }
}
