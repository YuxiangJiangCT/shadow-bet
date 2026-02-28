// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/ShadowBet.sol";

contract ShadowBetTest is Test {
    ShadowBet public bet;
    address public admin = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    uint256 constant FUTURE = 1e18; // far future timestamp
    uint256 constant PAST = 1;     // already expired

    function setUp() public {
        bet = new ShadowBet();
        // Fund test accounts
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ================================================================
    //                      Happy Path Tests
    // ================================================================

    function testCreateMarket() public {
        uint256 id = bet.createMarket("Will BTC hit $100k?", FUTURE);
        assertEq(id, 0);
        assertEq(bet.marketCount(), 1);

        ShadowBet.Market memory m = bet.getMarket(0);
        assertEq(m.question, "Will BTC hit $100k?");
        assertEq(m.endTime, FUTURE);
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 0);
        assertFalse(m.resolved);
    }

    function testPlaceBetYes() public {
        bet.createMarket("Test?", FUTURE);

        vm.prank(alice);
        bet.placeBet{value: 1 ether}(0, 0); // YES

        ShadowBet.Market memory m = bet.getMarket(0);
        assertEq(m.yesPool, 1 ether);
        assertEq(m.noPool, 0);

        ShadowBet.Bet memory b = bet.getBet(0, alice);
        assertEq(b.amount, 1 ether);
        assertEq(b.option, 0);
        assertFalse(b.claimed);
    }

    function testPlaceBetNo() public {
        bet.createMarket("Test?", FUTURE);

        vm.prank(bob);
        bet.placeBet{value: 2 ether}(0, 1); // NO

        ShadowBet.Market memory m = bet.getMarket(0);
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 2 ether);
    }

    function testResolveAndClaim() public {
        bet.createMarket("Test?", FUTURE);

        vm.prank(alice);
        bet.placeBet{value: 1 ether}(0, 0); // YES

        vm.prank(bob);
        bet.placeBet{value: 1 ether}(0, 1); // NO

        // Warp past end time and resolve: YES wins
        vm.warp(FUTURE + 1);
        bet.resolve(0, 0);

        // Alice (YES) claims — gets total pool (2 ether)
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        bet.claim(0);
        uint256 balAfter = alice.balance;

        assertEq(balAfter - balBefore, 2 ether);
    }

    function testFullLifecycle() public {
        // Create market
        uint256 id = bet.createMarket("Full test?", FUTURE);

        // Alice bets YES (3 ether), Bob bets NO (1 ether)
        vm.prank(alice);
        bet.placeBet{value: 3 ether}(id, 0);

        vm.prank(bob);
        bet.placeBet{value: 1 ether}(id, 1);

        // Verify pools
        (uint256 yesPool, uint256 noPool) = bet.getOdds(id);
        assertEq(yesPool, 3 ether);
        assertEq(noPool, 1 ether);

        // Resolve: YES wins
        vm.warp(FUTURE + 1);
        bet.resolve(id, 0);

        // Alice claims: payout = (3 * 4) / 3 = 4 ether (entire pool)
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        bet.claim(id);
        assertEq(alice.balance - aliceBefore, 4 ether);

        // Bob (loser) cannot claim
        vm.prank(bob);
        vm.expectRevert(ShadowBet.NothingToClaim.selector);
        bet.claim(id);
    }

    // ================================================================
    //                       Error Path Tests
    // ================================================================

    function testRevert_NonAdminCreate() public {
        vm.prank(alice);
        vm.expectRevert(ShadowBet.NotAdmin.selector);
        bet.createMarket("Unauthorized", FUTURE);
    }

    function testRevert_BetExpiredMarket() public {
        bet.createMarket("Expired?", PAST);

        vm.warp(PAST + 1);
        vm.prank(alice);
        vm.expectRevert(ShadowBet.MarketEnded.selector);
        bet.placeBet{value: 1 ether}(0, 0);
    }

    function testRevert_DoubleBet() public {
        bet.createMarket("Double?", FUTURE);

        vm.prank(alice);
        bet.placeBet{value: 1 ether}(0, 0);

        vm.prank(alice);
        vm.expectRevert(ShadowBet.AlreadyBet.selector);
        bet.placeBet{value: 1 ether}(0, 1);
    }

    function testRevert_ClaimBeforeResolved() public {
        bet.createMarket("Unresolved?", FUTURE);

        vm.prank(alice);
        bet.placeBet{value: 1 ether}(0, 0);

        vm.prank(alice);
        vm.expectRevert(ShadowBet.MarketNotResolved.selector);
        bet.claim(0);
    }

    function testRevert_LoserClaim() public {
        bet.createMarket("Loser?", FUTURE);

        vm.prank(alice);
        bet.placeBet{value: 1 ether}(0, 0); // YES

        vm.prank(bob);
        bet.placeBet{value: 1 ether}(0, 1); // NO

        vm.warp(FUTURE + 1);
        bet.resolve(0, 1); // NO wins

        // Alice (YES) tries to claim — revert
        vm.prank(alice);
        vm.expectRevert(ShadowBet.NothingToClaim.selector);
        bet.claim(0);
    }

    function testRevert_ResolveBeforeEnd() public {
        bet.createMarket("Too early?", FUTURE);

        vm.expectRevert(ShadowBet.MarketNotEnded.selector);
        bet.resolve(0, 0);
    }

    // ================================================================
    //                      Privacy-Specific Test
    // ================================================================

    /// @notice Verify BetPlaced event does NOT contain the option field.
    ///         This is the core privacy feature of ShadowBet.
    function testPrivacy_EventOmitsOption() public {
        bet.createMarket("Private?", FUTURE);

        // BetPlaced(uint256 indexed id, address indexed user, uint256 amount)
        // Only 3 fields — no option. We verify the event signature matches.
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit ShadowBet.BetPlaced(0, alice, 1 ether);
        bet.placeBet{value: 1 ether}(0, 0);

        // Place another bet with different option — same event signature
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit ShadowBet.BetPlaced(0, bob, 2 ether);
        bet.placeBet{value: 2 ether}(0, 1);

        // Both events are identical in structure — observer cannot distinguish
        // YES from NO bets by looking at events alone.
    }
}
