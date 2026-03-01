/**
 * Create demo markets on ShadowBet contract.
 * Run: node scripts/create-markets.mjs
 */

import { ethers } from "../frontend/node_modules/ethers/lib/ethers.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT = "0xC52f48c48084e7511B98E117Fb643B13Ac75a77A";
const ABI = [
  "function createMarket(string question, uint256 endTime) returns (uint256)",
  "function resolve(uint256 marketId, uint8 winner)",
  "function marketCount() view returns (uint256)",
  "function admin() view returns (address)",
];

// Load .env
const envContent = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const pk = envVars.PRIVATE_KEY;
if (!pk) { console.error("PRIVATE_KEY not in .env"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(pk, provider);
const contract = new ethers.Contract(CONTRACT, ABI, wallet);

const admin = await contract.admin();
console.log(`Admin: ${admin}`);
console.log(`Wallet: ${wallet.address}`);
if (admin.toLowerCase() !== wallet.address.toLowerCase()) {
  console.error("Not admin!"); process.exit(1);
}

const existingCount = Number(await contract.marketCount());
console.log(`Existing markets: ${existingCount}\n`);

const now = Math.floor(Date.now() / 1000);
const ONE_DAY = 86400;

const markets = [
  { question: "Will BTC hit $100k by March 2026?", endTime: now + ONE_DAY * 7 },
  { question: "Will ETH flip BTC market cap in 2026?", endTime: now + ONE_DAY * 14 },
  { question: "Will Monad mainnet launch in Q1 2026?", endTime: now + ONE_DAY * 3 },
];

for (const m of markets) {
  console.log(`Creating: "${m.question}"`);
  console.log(`  Ends: ${new Date(m.endTime * 1000).toLocaleString()}`);
  const tx = await contract.createMarket(m.question, m.endTime);
  const receipt = await tx.wait();
  console.log(`  TX: ${receipt.hash}`);
  console.log(`  Done!\n`);
}

const total = Number(await contract.marketCount());
console.log(`Total markets now: ${total}`);
