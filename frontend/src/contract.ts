// ShadowBet contract ABI and configuration

export const MONAD_TESTNET = {
  chainId: 10143,
  chainIdHex: "0x27AF",
  name: "Monad Testnet",
  rpcUrl: "https://testnet-rpc.monad.xyz",
  blockExplorer: "https://testnet.monadexplorer.com",
  currency: { name: "MON", symbol: "MON", decimals: 18 },
};

export const CONTRACT_ADDRESS = "0x1187167eFA940EA400A8C2c7D91573A2Ec93145A";

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

  // Events
  "event MarketCreated(uint256 indexed id, string question, uint256 endTime)",
  "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount)",
  "event MarketResolved(uint256 indexed id, uint8 winningOption)",
  "event Claimed(uint256 indexed id, address indexed user, uint256 amount)",
];
