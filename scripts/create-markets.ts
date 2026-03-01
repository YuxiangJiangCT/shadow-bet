/**
 * Create demo markets on ShadowBet contract.
 * Run: npx tsx scripts/create-markets.ts
 *
 * Requires PRIVATE_KEY in ../.env (admin wallet that deployed the contract)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT = "0xC52f48c48084e7511B98E117Fb643B13Ac75a77A";
const ABI = [
  "function createMarket(string question, uint256 endTime) returns (uint256)",
  "function resolve(uint256 marketId, uint8 winner)",
  "function marketCount() view returns (uint256)",
  "function admin() view returns (address)",
];

// Load .env manually (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env file. Create it with:\n  echo 'PRIVATE_KEY=0x...' > .env");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

async function main() {
  loadEnv();

  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  // Verify admin
  const admin = await contract.admin();
  console.log(`Contract admin: ${admin}`);
  console.log(`Your address:   ${wallet.address}`);
  if (admin.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error("Your wallet is NOT the admin. Cannot create markets.");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const ONE_DAY = 86400;
  const ONE_WEEK = ONE_DAY * 7;

  const markets = [
    {
      question: "Will BTC hit $100k by March 2026?",
      endTime: now + ONE_WEEK, // 7 days from now
    },
    {
      question: "Will ETH flip BTC market cap in 2026?",
      endTime: now + ONE_WEEK * 2, // 2 weeks from now
    },
    {
      question: "Will Monad mainnet launch in Q1 2026?",
      endTime: now + ONE_DAY * 3, // 3 days from now
    },
  ];

  console.log("\nCreating markets...\n");

  for (const m of markets) {
    console.log(`Creating: "${m.question}"`);
    console.log(`  End time: ${new Date(m.endTime * 1000).toLocaleString()}`);
    const tx = await contract.createMarket(m.question, m.endTime);
    const receipt = await tx.wait();
    console.log(`  TX: ${receipt.hash}`);
    console.log(`  ✓ Created\n`);
  }

  const count = await contract.marketCount();
  console.log(`Total markets: ${count}`);
}

main().catch(console.error);
