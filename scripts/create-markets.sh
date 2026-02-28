#!/bin/bash
# Create hackathon-themed prediction markets via admin wallet
# Usage: PRIVATE_KEY=0x... bash scripts/create-markets.sh

set -e

RPC="https://testnet-rpc.monad.xyz"
CONTRACT="0x1187167eFA940EA400A8C2c7D91573A2Ec93145A"

if [ -z "$PRIVATE_KEY" ]; then
  echo "Usage: PRIVATE_KEY=0x... bash scripts/create-markets.sh"
  exit 1
fi

# End time: 3 days from now (in seconds)
END_3D=$(( $(date +%s) + 259200 ))
# End time: 7 days from now
END_7D=$(( $(date +%s) + 604800 ))

echo "Creating markets on Monad testnet..."
echo "Contract: $CONTRACT"
echo "3-day end: $END_3D"
echo "7-day end: $END_7D"
echo ""

# Market 1
echo "Creating: Will Monad mainnet launch in Q2 2026?"
cast send $CONTRACT \
  "createMarket(string,uint256)" \
  "Will Monad mainnet launch in Q2 2026?" $END_7D \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY

# Market 2
echo "Creating: Will MON token price exceed \$10 at TGE?"
cast send $CONTRACT \
  "createMarket(string,uint256)" \
  "Will MON token price exceed \$10 at TGE?" $END_7D \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY

# Market 3
echo "Creating: Will a privacy protocol win the Unlink hackathon?"
cast send $CONTRACT \
  "createMarket(string,uint256)" \
  "Will a privacy protocol win the Unlink hackathon?" $END_3D \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY

# Market 4
echo "Creating: Will Ethereum ETF daily volume exceed \$1B this week?"
cast send $CONTRACT \
  "createMarket(string,uint256)" \
  "Will Ethereum ETF daily volume exceed \$1B this week?" $END_3D \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY

# Market 5
echo "Creating: Will on-chain privacy be standard by 2027?"
cast send $CONTRACT \
  "createMarket(string,uint256)" \
  "Will on-chain privacy be standard by 2027?" $END_7D \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY

echo ""
echo "Done! Check markets at: https://shadow-bet.vercel.app"
