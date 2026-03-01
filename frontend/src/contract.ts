// ShadowBet contract ABI and configuration
import { ethers } from "ethers";

export const MONAD_TESTNET = {
  chainId: 10143,
  chainIdHex: "0x279F",
  name: "Monad Testnet",
  // Primary RPC for wallet connection (MetaMask uses this)
  rpcUrl: "https://testnet-rpc.monad.xyz",
  // Fallback RPCs for read-only queries — tried in order when primary is rate-limited
  publicRpcUrls: [
    "https://rpc.ankr.com/monad_testnet",
    "https://monad-testnet.drpc.org",
    "https://rpc-testnet.monadinfra.com",
    "https://testnet-rpc.monad.xyz",
  ],
  blockExplorer: "https://testnet.monadexplorer.com",
  currency: { name: "MON", symbol: "MON", decimals: 18 },
};

export const CONTRACT_ADDRESS = "0x1187167eFA940EA400A8C2c7D91573A2Ec93145A";

// Native MON token address for Unlink privacy pool
export const MON_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const SHADOWBET_ABI = [
  // Read functions
  "function admin() view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 id) view returns (tuple(string question, uint256 endTime, uint256 yesPool, uint256 noPool, bool resolved, uint8 winningOption))",
  "function getBet(uint256 marketId, address user) view returns (tuple(uint256 amount, uint8 option, bool claimed))",
  "function getOdds(uint256 marketId) view returns (uint256 yesPool, uint256 noPool)",

  // Write functions
  "function createMarket(string question, uint256 endTime) returns (uint256)",
  "function placeBet(uint256 marketId, uint8 option) payable",
  "function resolve(uint256 marketId, uint8 winner)",
  "function claim(uint256 marketId)",

  // Errors
  "error MarketNotFound()",
  "error MarketEnded()",
  "error MarketNotEnded()",
  "error MarketNotResolved()",
  "error MarketAlreadyResolved()",
  "error AlreadyBet()",
  "error InvalidOption()",
  "error InvalidAmount()",
  "error NothingToClaim()",
  "error AlreadyClaimed()",
  "error NotAdmin()",
  "error TransferFailed()",

  // Events
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime)",
  "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount)",
  "event MarketResolved(uint256 indexed id, uint8 winningOption)",
  "event Claimed(uint256 indexed id, address indexed user, uint256 amount)",
];

/**
 * Wraps an async RPC call with sequential fallback across publicRpcUrls.
 * Only moves to the next node on rate-limit errors (429/-32007/-32090).
 * Normal errors (revert, not-found, etc.) are thrown immediately.
 *
 * Usage:
 *   const result = await withFallback(async (provider) => {
 *     const contract = new ethers.Contract(addr, abi, provider);
 *     return contract.someMethod();
 *   });
 */
export async function withFallback<T>(
  fn: (provider: ethers.JsonRpcProvider) => Promise<T>
): Promise<T> {
  const urls = MONAD_TESTNET.publicRpcUrls;
  let lastErr: unknown;
  for (const url of urls) {
    const provider = new ethers.JsonRpcProvider(url, MONAD_TESTNET.chainId, {
      staticNetwork: true,
    });
    try {
      return await fn(provider);
    } catch (err: any) {
      const isRateLimit =
        err?.error?.code === -32007 ||
        err?.error?.code === -32090 ||
        err?.status === 429 ||
        String(err?.message).includes("429") ||
        String(err?.message).includes("rate limit") ||
        String(err?.message).includes("Too many requests") ||
        String(err?.shortMessage).includes("missing response");
      if (!isRateLimit) throw err; // non-rate-limit: don't retry
      lastErr = err;
      // rate limited: try next URL
    }
  }
  throw lastErr;
}

/** Known admin address — used for UI-only visibility (on-chain still enforces onlyAdmin) */
export const KNOWN_ADMIN = "0x9b50ED6a40e98215b2d2da5CE2E948c28AB7eCF5";

/** Map custom error names to user-friendly messages */
export const ERROR_MESSAGES: Record<string, string> = {
  AlreadyBet: "You already placed a bet on this market",
  MarketNotFound: "Market does not exist",
  MarketEnded: "Betting period has ended",
  MarketNotEnded: "Market hasn't ended yet",
  MarketNotResolved: "Market hasn't been resolved yet",
  MarketAlreadyResolved: "Market is already resolved",
  InvalidOption: "Invalid option — choose YES or NO",
  InvalidAmount: "Bet amount must be greater than 0",
  NothingToClaim: "Nothing to claim — you didn't win",
  AlreadyClaimed: "Winnings already claimed",
  NotAdmin: "Only admin can do this",
  TransferFailed: "Transfer failed",
};
