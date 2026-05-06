// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {HiddenPKWallet} from "../src/HiddenPKWallet.sol";
import {MockHiddenPKVerifier} from "../src/MockHiddenPKVerifier.sol";
import {IHiddenPKVerifier} from "../src/IHiddenPKVerifier.sol";

contract HiddenPKWalletTest is Test {
    HiddenPKWallet wallet;
    MockHiddenPKVerifier verifier;
    address owner = address(0xb14A52c6a10A9FFEf5dE3813AdbfE3Eab215D83f);
    address recipient = address(0x8c41cCF5fDbb418b2Fe482cd8970f3bA7795280E);

    function setUp() public {
        verifier = new MockHiddenPKVerifier();
        wallet   = new HiddenPKWallet(owner, IHiddenPKVerifier(address(verifier)));
        vm.deal(address(wallet), 1 ether);
    }

    function test_executeTransfersETH() public {
        bytes memory fakeProof = hex"deadbeef";
        uint256 before = recipient.balance;

        wallet.execute(recipient, 0.1 ether, "", fakeProof);

        assertEq(recipient.balance - before, 0.1 ether);
        assertEq(wallet.nonce(), 1);
    }

    function test_revertsOnEmptyProof() public {
        vm.expectRevert();
        wallet.execute(recipient, 0.1 ether, "", "");
    }

    function test_nonceIncrements() public {
        bytes memory fakeProof = hex"01";
        wallet.execute(recipient, 0.01 ether, "", fakeProof);
        wallet.execute(recipient, 0.01 ether, "", fakeProof);
        assertEq(wallet.nonce(), 2);
    }
}
