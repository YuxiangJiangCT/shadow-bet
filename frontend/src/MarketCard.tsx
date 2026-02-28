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
}

function fmtPool(wei: bigint): string {
  const str = ethers.formatEther(wei);
  const n = parseFloat(str);
  if (n === 0) return "0";
  if (n < 0.01) return "<0.01";
  return n.toFixed(2);
}

export function MarketCard({ market, selected, onClick }: MarketCardProps) {
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
      </div>
    </div>
  );
}
