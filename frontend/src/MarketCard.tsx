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

/** Format seconds-until-end into a human-readable relative string */
export function formatTimeLeft(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTime - now;
  if (diff <= 0) return "Ended";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days < 7) return `${days}d ${hours}h`;
  return `${days}d`;
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
  return "\ud83c\udfaf"; // default: target for predictions
}

/** Auto-match a market question to a category tag */
function getMarketTag(question: string): string | null {
  const q = question.toLowerCase();
  const map: [string[], string][] = [
    [["btc", "bitcoin"], "BITCOIN"],
    [["eth", "ethereum"], "ETHEREUM"],
    [["mon", "monad"], "MONAD"],
    [["sol", "solana"], "SOLANA"],
    [["price", "hit", "$", "above", "below", "ath"], "PRICE"],
    [["election", "vote", "president", "governor"], "POLITICS"],
    [["ai", "gpt", "llm", "claude", "openai"], "AI"],
    [["nft"], "NFT"],
    [["launch", "ship", "release", "mainnet"], "LAUNCH"],
    [["win", "champion", "game", "match", "finals"], "SPORTS"],
  ];
  for (const [keywords, tag] of map) {
    if (keywords.some(k => q.includes(k))) return tag;
  }
  return null;
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

  const tag = getMarketTag(market.question);

  return (
    <div
      className={`market-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="card-top">
        <div className="card-top-left">
          <span className="card-emoji">{getMarketEmoji(market.question)}</span>
          <span className={`card-status ${statusClass}`}>{statusText}</span>
          {tag && <span className="card-tag">{tag}</span>}
        </div>
        <div className="card-top-right">
          {isActive && (
            <span className={`card-countdown ${
              (market.endTime - Date.now() / 1000) < 86400 ? "urgent" : ""
            }`}>
              {formatTimeLeft(market.endTime)} left
            </span>
          )}
          <span className="card-id">#{market.id}</span>
        </div>
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
