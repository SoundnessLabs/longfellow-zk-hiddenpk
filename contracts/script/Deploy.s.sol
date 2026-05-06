// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HiddenPKWallet} from "../src/HiddenPKWallet.sol";
import {MockHiddenPKVerifier} from "../src/MockHiddenPKVerifier.sol";
import {IHiddenPKVerifier} from "../src/IHiddenPKVerifier.sol";

/// Deploys MockHiddenPKVerifier + HiddenPKWallet on Sepolia.
/// Set OWNER_ADDR env var to the address whose hidden private key will own the wallet.
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDR");
        uint256 pk    = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);

        MockHiddenPKVerifier verifier = new MockHiddenPKVerifier();
        console.log("MockHiddenPKVerifier:", address(verifier));

        HiddenPKWallet wallet = new HiddenPKWallet(owner, IHiddenPKVerifier(address(verifier)));
        console.log("HiddenPKWallet:", address(wallet));
        console.log("Owner:", owner);

        vm.stopBroadcast();
    }
}
