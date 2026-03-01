/**
 * Place demo bets only (markets already created).
 * Run: node scripts/place-bets.mjs
 */

import { Contract, JsonRpcProvider, Wallet, parseEther } from "../frontend/node_modules/ethers/lib.esm/ethers.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const pk = envVars.PRIVATE_KEY;
if (!pk) { console.error("PRIVATE_KEY not in .env"); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
const wallet = new Wallet(pk, provider);
const contract = new Contract("0xC52f48c48084e7511B98E117Fb643B13Ac75a77A", [
  "function placeBet(uint256 marketId, uint8 option) payable",
  "function getBet(uint256 marketId, address user) view returns (tuple(uint256 amount, uint8 option, bool claimed))",
], wallet);

// [marketId, option (0=YES 1=NO), amount]
const bets = [
  [5,  0, "0.01"],   // On-chain privacy — YES
  [6,  0, "0.02"],   // SOL ATH — YES
  [7,  0, "0.015"],  // AI Turing — YES
  [8,  1, "0.01"],   // NFT recovery — NO
  [9,  0, "0.01"],   // Pectra — YES
];

for (const [id, opt, amt] of bets) {
  const label = opt === 0 ? "YES" : "NO";
  console.log(`Market #${id} — ${label} — ${amt} MON`);

  try {
    await sleep(5000); // 5s cooldown before each operation
    const existing = await contract.getBet(id, wallet.address);
    if (existing.amount > 0n) {
      console.log(`  Already bet, skip\n`);
      continue;
    }

    await sleep(3000);
    const tx = await contract.placeBet(id, opt, { value: parseEther(amt) });
    console.log(`  TX sent: ${tx.hash}`);

    await sleep(5000); // wait before polling receipt
    const receipt = await tx.wait();
    console.log(`  Confirmed!\n`);
  } catch (err) {
    console.error(`  Error: ${(err.message || "").slice(0, 80)}\n`);
  }
}

console.log("Done!");
