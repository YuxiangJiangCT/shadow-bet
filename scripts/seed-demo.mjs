/**
 * Seed demo data: create markets + place bets to make the app look alive.
 * Run: node scripts/seed-demo.mjs
 *
 * Uses PRIVATE_KEY from .env (must be admin wallet).
 */

import { Contract, JsonRpcProvider, Wallet, parseEther, formatEther } from "../frontend/node_modules/ethers/lib.esm/ethers.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT = "0x1187167eFA940EA400A8C2c7D91573A2Ec93145A";
const ABI = [
  "function createMarket(string question, uint256 endTime) returns (uint256)",
  "function placeBet(uint256 marketId, uint8 option) payable",
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 id) view returns (tuple(string question, uint256 endTime, uint256 yesPool, uint256 noPool, bool resolved, uint8 winningOption))",
  "function getBet(uint256 marketId, address user) view returns (tuple(uint256 amount, uint8 option, bool claimed))",
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitWithRetry(tx, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await tx.wait();
    } catch {
      if (i < retries - 1) { await sleep(3000); continue; }
      throw new Error("tx.wait failed after retries");
    }
  }
}

const provider = new JsonRpcProvider(RPC);
const wallet = new Wallet(pk, provider);
const contract = new Contract(CONTRACT, ABI, wallet);

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

// ─── New markets to create ───
// Designed to trigger diverse emojis and look good in the grid
const newMarkets = [
  { question: "Will SOL hit a new ATH before June 2026?",      endTime: now + ONE_DAY * 7 },
  { question: "Will an AI model pass the Turing test by 2027?", endTime: now + ONE_DAY * 14 },
  { question: "Will NFT trading volume recover in 2026?",       endTime: now + ONE_DAY * 10 },
  { question: "Will Ethereum ship the Pectra upgrade on time?",  endTime: now + ONE_DAY * 7 },
];

// ─── Bets to place on existing + new markets ───
// Each entry: [marketId, option (0=YES, 1=NO), amount in MON]
// These make the odds bars look interesting (not all 100/0 or 50/50)
const betsToPlace = [
  // Existing markets — add opposing bets to balance odds
  [1, 1, "0.01"],   // BTC $100k — bet NO to balance
  [2, 1, "0.005"],  // ETH flip BTC — bet NO
  [3, 0, "0.005"],  // Monad mainnet — bet YES to balance
  [4, 0, "0.01"],   // Privacy protocol win — bet YES
  [4, 1, "0.005"],  // Privacy protocol win — bet NO (need diff address, will skip if AlreadyBet)
  [5, 0, "0.01"],   // On-chain privacy — bet YES
  // New markets (IDs = existingCount + 0, 1, 2, 3)
  [existingCount + 0, 0, "0.02"],  // SOL ATH — YES
  [existingCount + 0, 1, "0.01"],  // SOL ATH — NO (same address issue)
  [existingCount + 1, 0, "0.015"], // AI Turing — YES
  [existingCount + 2, 1, "0.01"],  // NFT recovery — NO
  [existingCount + 2, 0, "0.02"],  // NFT recovery — YES
  [existingCount + 3, 0, "0.01"],  // Pectra — YES
];

// ─── Step 1: Create markets ───
console.log("═══ Creating new markets ═══\n");
for (const m of newMarkets) {
  console.log(`Creating: "${m.question}"`);
  console.log(`  Ends: ${new Date(m.endTime * 1000).toLocaleString()}`);
  try {
    const tx = await contract.createMarket(m.question, m.endTime);
    const receipt = await waitWithRetry(tx);
    console.log(`  TX: ${receipt.hash}`);
    console.log(`  ✓ Done\n`);
    await sleep(2000);
  } catch (err) {
    console.error(`  ✗ Error: ${err.message?.slice(0, 100)}\n`);
  }
}

const totalMarkets = Number(await contract.marketCount());
console.log(`Total markets: ${totalMarkets}\n`);

// ─── Step 2: Place bets ───
console.log("═══ Placing demo bets ═══\n");
for (const [marketId, option, amount] of betsToPlace) {
  if (marketId >= totalMarkets) {
    console.log(`  Skip market #${marketId} (doesn't exist)`);
    continue;
  }
  const optLabel = option === 0 ? "YES" : "NO";
  console.log(`  Market #${marketId} — ${optLabel} — ${amount} MON`);
  try {
    // Check if we already bet on this market
    const existing = await contract.getBet(marketId, wallet.address);
    if (existing.amount > 0n) {
      console.log(`    Already bet, skipping\n`);
      continue;
    }
    const tx = await contract.placeBet(marketId, option, {
      value: parseEther(amount),
    });
    const receipt = await waitWithRetry(tx);
    console.log(`    TX: ${receipt.hash}`);
    console.log(`    ✓ Done\n`);
    await sleep(2000);
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("AlreadyBet")) {
      console.log(`    Already bet, skipping\n`);
    } else {
      console.error(`    ✗ Error: ${msg.slice(0, 100)}\n`);
    }
  }
}

// ─── Summary ───
console.log("\n═══ Final state ═══\n");
for (let i = 0; i < totalMarkets; i++) {
  await sleep(500);
  const m = await contract.getMarket(i);
  const yes = formatEther(m.yesPool);
  const no = formatEther(m.noPool);
  const total = parseFloat(yes) + parseFloat(no);
  const status = m.resolved ? "RESOLVED" : (Number(m.endTime) < now ? "ENDED" : "ACTIVE");
  console.log(`  #${i} [${status}] "${m.question}"`);
  console.log(`     Pool: ${total.toFixed(4)} MON (YES: ${yes} / NO: ${no})`);
}
