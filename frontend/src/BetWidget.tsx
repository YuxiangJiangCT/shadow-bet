import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { SHADOWBET_ABI, CONTRACT_ADDRESS } from "./contract";

interface Market {
  id: number;
  question: string;
  endTime: number;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  winningOption: number;
}

interface BetWidgetProps {
  provider: ethers.BrowserProvider;
  account: string;
}

export function BetWidget({ provider, account: _account }: BetWidgetProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  // Load markets on mount
  useEffect(() => {
    loadMarkets();
  }, []);

  const getContract = async (needSigner = false) => {
    if (needSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, signer);
    }
    return new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, provider);
  };

  const loadMarkets = async () => {
    try {
      const contract = await getContract();
      const count = await contract.marketCount();
      const loaded: Market[] = [];

      for (let i = 0; i < Number(count); i++) {
        const m = await contract.getMarket(i);
        loaded.push({
          id: i,
          question: m.question,
          endTime: Number(m.endTime),
          yesPool: m.yesPool,
          noPool: m.noPool,
          resolved: m.resolved,
          winningOption: Number(m.winningOption),
        });
      }

      setMarkets(loaded);
      if (loaded.length > 0 && selectedMarket === null) {
        setSelectedMarket(0);
      }
    } catch (err) {
      console.error("Failed to load markets:", err);
    }
  };

  const placeBet = async () => {
    if (selectedMarket === null || selectedOption === null || !betAmount) return;

    setLoading(true);
    setTxStatus("Sending transaction...");

    try {
      const contract = await getContract(true);
      const value = ethers.parseEther(betAmount);
      const tx = await contract.placeBet(selectedMarket, selectedOption, { value });
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Bet placed!");
      setBetAmount("");
      setSelectedOption(null);
      await loadMarkets();
    } catch (err: any) {
      if (err.code === "ACTION_REJECTED") {
        setTxStatus("Transaction cancelled");
      } else {
        setTxStatus(`Error: ${err.reason || err.message}`);
      }
    } finally {
      setLoading(false);
      setTimeout(() => setTxStatus(""), 4000);
    }
  };

  const claimWinnings = async (marketId: number) => {
    setLoading(true);
    setTxStatus("Claiming...");

    try {
      const contract = await getContract(true);
      const tx = await contract.claim(marketId);
      setTxStatus("Waiting for confirmation...");
      await tx.wait();
      setTxStatus("Claimed!");
      await loadMarkets();
    } catch (err: any) {
      if (err.code === "ACTION_REJECTED") {
        setTxStatus("Transaction cancelled");
      } else {
        setTxStatus(`Error: ${err.reason || err.message}`);
      }
    } finally {
      setLoading(false);
      setTimeout(() => setTxStatus(""), 4000);
    }
  };

  const market = selectedMarket !== null ? markets[selectedMarket] : null;
  const totalPool = market ? market.yesPool + market.noPool : 0n;
  const yesPercent = totalPool > 0n && market ? Number((market.yesPool * 10000n) / totalPool) / 100 : 50;
  const noPercent = totalPool > 0n ? 100 - yesPercent : 50;
  const isActive = market ? Date.now() / 1000 < market.endTime && !market.resolved : false;

  return (
    <div className="bet-widget">
      {/* Header */}
      <div className="widget-header">
        <h2>SHADOWBET</h2>
        <span className="privacy-badge">PRIVACY</span>
      </div>

      {/* Market Selector */}
      {markets.length > 0 ? (
        <div className="market-selector">
          {markets.map((m) => (
            <button
              key={m.id}
              className={`market-tab ${selectedMarket === m.id ? "active" : ""}`}
              onClick={() => setSelectedMarket(m.id)}
            >
              #{m.id}
            </button>
          ))}
        </div>
      ) : (
        <div className="no-markets">No markets yet</div>
      )}

      {/* Market Info */}
      {market && (
        <>
          <div className="market-question">
            <p>{market.question}</p>
            <div className="market-meta">
              <span className={`market-status ${market.resolved ? "resolved" : isActive ? "active" : "ended"}`}>
                {market.resolved ? `Resolved: ${market.winningOption === 0 ? "YES" : "NO"}` : isActive ? "Active" : "Ended"}
              </span>
              <span className="market-time">
                {isActive
                  ? `Ends: ${new Date(market.endTime * 1000).toLocaleString()}`
                  : market.resolved
                  ? "Settled"
                  : "Betting closed"}
              </span>
            </div>
          </div>

          {/* Odds Bar */}
          <div className="odds-section">
            <div className="odds-labels">
              <span className="yes-label">YES {yesPercent.toFixed(1)}%</span>
              <span className="pool-total">{ethers.formatEther(totalPool)} MON</span>
              <span className="no-label">NO {noPercent.toFixed(1)}%</span>
            </div>
            <div className="odds-bar">
              <div className="odds-yes" style={{ width: `${yesPercent}%` }} />
              <div className="odds-no" style={{ width: `${noPercent}%` }} />
            </div>
          </div>

          {/* Betting Section */}
          {isActive && (
            <div className="bet-section">
              <div className="option-buttons">
                <button
                  className={`option-btn yes ${selectedOption === 0 ? "selected" : ""}`}
                  onClick={() => setSelectedOption(0)}
                >
                  YES
                </button>
                <button
                  className={`option-btn no ${selectedOption === 1 ? "selected" : ""}`}
                  onClick={() => setSelectedOption(1)}
                >
                  NO
                </button>
              </div>

              <div className="amount-section">
                <label className="amount-label">Bet Amount (MON)</label>
                <div className="amount-row">
                  <input
                    type="text"
                    className="amount-input"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="0.0"
                    disabled={loading}
                  />
                  <div className="quick-amounts">
                    {["0.01", "0.1", "1"].map((amt) => (
                      <button key={amt} className="quick-btn" onClick={() => setBetAmount(amt)}>
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="privacy-notice">
                <span className="lock-icon">&#x1F512;</span>
                <span>Your bet choice (YES/NO) is hidden from on-chain observers</span>
              </div>

              <button
                className="place-bet-btn"
                onClick={placeBet}
                disabled={loading || selectedOption === null || !betAmount || parseFloat(betAmount) <= 0}
              >
                {loading ? "Processing..." : selectedOption === null ? "Select YES or NO" : `Place Bet`}
              </button>
            </div>
          )}

          {/* Claim Section */}
          {market.resolved && (
            <div className="claim-section">
              <button className="claim-btn" onClick={() => claimWinnings(market.id)} disabled={loading}>
                {loading ? "Claiming..." : "Claim Winnings"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Transaction Status */}
      {txStatus && (
        <div className="tx-status">
          {txStatus}
        </div>
      )}
    </div>
  );
}
