import { ethers } from "ethers";

interface Market {
  id: number;
  question: string;
  endTime: number;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  winningOption: number;
}

interface MarketCardProps {
  market: Market;
  selected: boolean;
  onClick: () => void;
  betCount?: number;
}

function fmtPool(wei: bigint): string {
  const str = ethers.formatEther(wei);
  const n = parseFloat(str);
  if (n === 0) return "0";
  if (n < 0.01) return "<0.01";
  return n.toFixed(2);
}

/** Auto-match a market question to a relevant emoji */
function getMarketEmoji(question: string): string {
  const q = question.toLowerCase();
  const map: [string[], string][] = [
    [["btc", "bitcoin"], "\u20bf"],
    [["eth", "ethereum"], "\u27e0"],
    [["mon", "monad"], "\ud83d\udfe3"],
    [["sol", "solana"], "\u25ce"],
    [["price", "hit", "$", "above", "below", "ath"], "\ud83d\udcc8"],
    [["election", "vote", "president", "governor"], "\ud83d\uddf3\ufe0f"],
    [["ai", "gpt", "llm", "claude", "openai"], "\ud83e\udd16"],
    [["nft"], "\ud83d\uddbc\ufe0f"],
    [["launch", "ship", "release", "mainnet"], "\ud83d\ude80"],
    [["win", "champion", "game", "match", "finals"], "\ud83c\udfc6"],
    [["hack", "exploit", "bug", "vulnerability"], "\ud83d\udd13"],
    [["weather", "rain", "storm", "hurricane"], "\ud83c\udf26\ufe0f"],
    [["moon", "pump", "100x"], "\ud83c\udf19"],
    [["crash", "dump", "bear"], "\ud83d\udcc9"],
    [["merge", "fork", "upgrade"], "\ud83d\udd27"],
  ];
  for (const [keywords, emoji] of map) {
    if (keywords.some(k => q.includes(k))) return emoji;
  }
  return "\ud83d\udd2e"; // default: crystal ball for predictions
}

export function MarketCard({ market, selected, onClick, betCount }: MarketCardProps) {
  const totalPool = market.yesPool + market.noPool;
  const yesPercent = totalPool > 0n
    ? Number((market.yesPool * 10000n) / totalPool) / 100
    : 50;
  const noPercent = totalPool > 0n ? 100 - yesPercent : 50;
  const isActive = Date.now() / 1000 < market.endTime && !market.resolved;

  const statusClass = market.resolved ? "resolved" : isActive ? "active" : "ended";
  const statusText = market.resolved
    ? `Resolved: ${market.winningOption === 0 ? "YES" : "NO"}`
    : isActive
    ? "Active"
    : "Ended";

  return (
    <div
      className={`market-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="card-top">
        <span className="card-emoji">{getMarketEmoji(market.question)}</span>
        <span className={`card-status ${statusClass}`}>{statusText}</span>
        <span className="card-id">#{market.id}</span>
      </div>
      <p className="card-question">{market.question}</p>
      <div className="card-odds">
        <div className="card-odds-bar">
          <div className="card-odds-yes" style={{ width: `${yesPercent}%` }} />
          <div className="card-odds-no" style={{ width: `${noPercent}%` }} />
        </div>
        <div className="card-odds-labels">
          <span className="yes-label">{yesPercent.toFixed(0)}% Yes</span>
          <span className="no-label">{noPercent.toFixed(0)}% No</span>
        </div>
      </div>
      <div className="card-pool">
        <span className="card-pool-label">Total Pool</span>
        <span className="card-pool-value">{fmtPool(totalPool)} MON</span>
        {betCount !== undefined && betCount > 0 && (
          <span className="card-bets-badge">
            &#x1F512; {betCount} private bet{betCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
