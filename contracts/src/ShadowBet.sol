// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ShadowBet — Privacy-First Prediction Market on Monad
/// @notice Bet on outcomes without revealing your position on-chain.
/// @dev BetPlaced events intentionally omit the option field for privacy.
contract ShadowBet {
    error MarketNotFound();
    error MarketEnded();
    error MarketNotEnded();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error AlreadyBet();
    error InvalidOption();
    error InvalidAmount();
    error NothingToClaim();
    error AlreadyClaimed();
    error NotAdmin();
    error TransferFailed();

    /// @dev BetPlaced intentionally does NOT include `option` — this is the core privacy feature.
    event MarketCreated(uint256 indexed id, string question, uint256 endTime);
    event BetPlaced(uint256 indexed id, address indexed user, uint256 amount);
    event MarketResolved(uint256 indexed id, uint8 winningOption);
    event Claimed(uint256 indexed id, address indexed user, uint256 amount);

    struct Market {
        string question;
        uint256 endTime;
        uint256 yesPool;
        uint256 noPool;
        bool resolved;
        uint8 winningOption; // 0 = YES, 1 = NO
    }

    struct Bet {
        uint256 amount;
        uint8 option; // 0 = YES, 1 = NO
        bool claimed;
    }

    address public admin;
    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Bet)) public bets;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ================================================================
    //                        Create Market
    // ================================================================

    /// @notice Create a new prediction market.
    /// @param question The question to predict on.
    /// @param endTime Unix timestamp when betting closes.
    function createMarket(string calldata question, uint256 endTime) external onlyAdmin returns (uint256) {
        uint256 id = marketCount++;
        markets[id] = Market({
            question: question,
            endTime: endTime,
            yesPool: 0,
            noPool: 0,
            resolved: false,
            winningOption: 0
        });
        emit MarketCreated(id, question, endTime);
        return id;
    }

    // ================================================================
    //                          Place Bet
    // ================================================================

    /// @notice Place a bet on a market. Your choice (YES/NO) is stored on-chain
    ///         but NOT emitted in the event — providing bet privacy.
    /// @param marketId The market to bet on.
    /// @param option 0 = YES, 1 = NO.
    function placeBet(uint256 marketId, uint8 option) external payable {
        Market storage m = markets[marketId];
        if (bytes(m.question).length == 0) revert MarketNotFound();
        if (block.timestamp >= m.endTime) revert MarketEnded();
        if (msg.value == 0) revert InvalidAmount();
        if (option > 1) revert InvalidOption();
        if (bets[marketId][msg.sender].amount != 0) revert AlreadyBet();

        bets[marketId][msg.sender] = Bet({
            amount: msg.value,
            option: option,
            claimed: false
        });

        if (option == 0) {
            m.yesPool += msg.value;
        } else {
            m.noPool += msg.value;
        }

        // Privacy: event does NOT include `option`
        emit BetPlaced(marketId, msg.sender, msg.value);
    }

    // ================================================================
    //                         Resolve Market
    // ================================================================

    /// @notice Resolve a market after betting period ends.
    /// @param marketId The market to resolve.
    /// @param winner 0 = YES wins, 1 = NO wins.
    function resolve(uint256 marketId, uint8 winner) external onlyAdmin {
        Market storage m = markets[marketId];
        if (bytes(m.question).length == 0) revert MarketNotFound();
        if (block.timestamp < m.endTime) revert MarketNotEnded();
        if (m.resolved) revert MarketAlreadyResolved();
        if (winner > 1) revert InvalidOption();

        m.resolved = true;
        m.winningOption = winner;

        emit MarketResolved(marketId, winner);
    }

    // ================================================================
    //                        Claim Winnings
    // ================================================================

    /// @notice Claim winnings from a resolved market.
    /// @param marketId The market to claim from.
    function claim(uint256 marketId) external {
        Market memory m = markets[marketId];
        if (!m.resolved) revert MarketNotResolved();

        Bet storage b = bets[marketId][msg.sender];
        if (b.amount == 0) revert NothingToClaim();
        if (b.claimed) revert AlreadyClaimed();
        if (b.option != m.winningOption) revert NothingToClaim();

        b.claimed = true;

        uint256 totalPool = m.yesPool + m.noPool;
        uint256 winningPool = m.winningOption == 0 ? m.yesPool : m.noPool;
        if (winningPool == 0) revert NothingToClaim();
        uint256 payout = (b.amount * totalPool) / winningPool;

        (bool ok, ) = msg.sender.call{value: payout}("");
        if (!ok) revert TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    // ================================================================
    //                           Getters
    // ================================================================

    function getMarket(uint256 id) external view returns (Market memory) {
        return markets[id];
    }

    function getBet(uint256 marketId, address user) external view returns (Bet memory) {
        return bets[marketId][user];
    }

    function getOdds(uint256 marketId) external view returns (uint256 yesPool, uint256 noPool) {
        Market memory m = markets[marketId];
        return (m.yesPool, m.noPool);
    }
}
