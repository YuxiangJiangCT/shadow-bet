import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useOnChainAudit } from "./useOnChainAudit";
import { MONAD_TESTNET, CONTRACT_ADDRESS, SHADOWBET_ABI } from "./contract";

interface MarketData {
  question: string;
  endTime: number;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  winningOption: number;
}

interface MarketDetailProps {
  marketId: number;
  account: string | null;
  onConnect: () => void;
  onBet: (marketId: number) => void;
  onBack: () => void;
}

const provider = new ethers.FallbackProvider(
  MONAD_TESTNET.publicRpcUrls.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url),
    priority: i + 1,
    stallTimeout: 750,
    weight: 1,
  })),
  1
);
const contract = new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, provider);

function fmtPool(wei: bigint): string {
  const str = ethers.formatEther(wei);
  const n = parseFloat(str);
  if (n === 0) return "0";
  if (n < 0.01) return "<0.01";
  return n.toFixed(2);
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0 || (d === 0 && h === 0)) parts.push(`${s}s`);
  return parts.join(" ");
}

export function MarketDetail({ marketId, account, onConnect, onBet, onBack }: MarketDetailProps) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const { events } = useOnChainAudit();

  // Load market data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const m = await contract.getMarket(marketId);
        if (cancelled) return;
        setMarket({
          question: m.question,
          endTime: Number(m.endTime),
          yesPool: m.yesPool,
          noPool: m.noPool,
          resolved: m.resolved,
          winningOption: Number(m.winningOption),
        });
        setError(null);
      } catch {
        if (!cancelled) setError("Market not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [marketId]);

  // Countdown timer
  useEffect(() => {
    if (!market) return;
    const tick = () => {
      const remaining = market.endTime - Date.now() / 1000;
      setCountdown(formatCountdown(remaining));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [market]);

  // Filter events for this market
  const marketEvents = events.filter((ev) => ev.marketId === marketId);

  if (loading) {
    return (
      <div className="market-detail">
        <button className="md-back" onClick={onBack}>&larr; All Markets</button>
        <div className="md-loading"><span className="spinner" /> Loading market...</div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="market-detail">
        <button className="md-back" onClick={onBack}>&larr; All Markets</button>
        <div className="md-error">{error || "Market not found"}</div>
      </div>
    );
  }

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
    <div className="market-detail">
      {/* Back */}
      <button className="md-back" onClick={onBack}>&larr; All Markets</button>

      {/* Header */}
      <div className="md-header">
        <span className={`md-status ${statusClass}`}>{statusText}</span>
        <span className="md-id">Market #{marketId}</span>
      </div>
      <h1 className="md-question">{market.question}</h1>

      {/* Countdown */}
      <div className="md-countdown">
        {market.resolved ? (
          <span className="md-countdown-resolved">
            Resolved: <strong>{market.winningOption === 0 ? "YES" : "NO"}</strong>
          </span>
        ) : isActive ? (
          <>
            <span className="md-countdown-label">Ends in</span>
            <span className="md-countdown-value">{countdown}</span>
          </>
        ) : (
          <span className="md-countdown-ended">Betting Closed</span>
        )}
      </div>

      {/* Large Odds Bar */}
      <div className="md-odds">
        <div className="md-odds-labels">
          <span className="yes-label">{yesPercent.toFixed(1)}% Yes</span>
          <span className="no-label">{noPercent.toFixed(1)}% No</span>
        </div>
        <div className="md-odds-bar">
          <div className="md-odds-yes" style={{ width: `${yesPercent}%` }} />
          <div className="md-odds-no" style={{ width: `${noPercent}%` }} />
        </div>
      </div>

      {/* Pool Info */}
      <div className="md-pools">
        <div className="md-pool-item">
          <span className="md-pool-label">Total Pool</span>
          <span className="md-pool-value">{fmtPool(totalPool)} MON</span>
        </div>
        <div className="md-pool-item yes">
          <span className="md-pool-label">YES Pool</span>
          <span className="md-pool-value">{fmtPool(market.yesPool)} MON</span>
        </div>
        <div className="md-pool-item no">
          <span className="md-pool-label">NO Pool</span>
          <span className="md-pool-value">{fmtPool(market.noPool)} MON</span>
        </div>
      </div>

      {/* CTA */}
      {!account ? (
        <button className="connect-btn large md-cta" onClick={onConnect}>
          Connect Wallet to Bet
        </button>
      ) : isActive ? (
        <button className="connect-btn large md-cta" onClick={() => onBet(marketId)}>
          Place Private Bet
        </button>
      ) : (
        <button className="connect-btn large md-cta" disabled>
          Market Closed
        </button>
      )}

      {/* Transaction History */}
      <div className="md-history">
        <h3 className="md-history-title">
          Bet History
          {marketEvents.length > 0 && (
            <span className="md-history-count">{marketEvents.length}</span>
          )}
        </h3>
        {marketEvents.length === 0 ? (
          <div className="md-history-empty">No bets placed on this market yet.</div>
        ) : (
          <div className="md-history-table-wrap">
            <table className="pp-audit-table">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>From (Burner)</th>
                  <th>Amount</th>
                  <th>Side</th>
                </tr>
              </thead>
              <tbody>
                {marketEvents.map((ev, i) => (
                  <tr key={i}>
                    <td>
                      <a
                        href={`${MONAD_TESTNET.blockExplorer}/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pp-audit-link"
                      >
                        {ev.blockNumber}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`${MONAD_TESTNET.blockExplorer}/address/${ev.user}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pp-audit-link mono"
                      >
                        {ev.user.slice(0, 6)}...{ev.user.slice(-4)}
                      </a>
                    </td>
                    <td>{parseFloat(ethers.formatEther(ev.amount)).toFixed(2)} MON</td>
                    <td>
                      <span className="pp-audit-hidden">&#x1F512; ???</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
