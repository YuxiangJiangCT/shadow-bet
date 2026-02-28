import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useUnlink, useBurner } from "@unlink-xyz/react";
import { SHADOWBET_ABI, CONTRACT_ADDRESS, MON_TOKEN } from "./contract";

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

const BURNER_INDEX = 0;
const iface = new ethers.Interface(SHADOWBET_ABI);

/** Format wei to readable string with max 4 decimal places */
function fmtBal(wei: bigint, decimals = 18): string {
  const str = ethers.formatUnits(wei, decimals);
  const [int, dec] = str.split(".");
  if (!dec) return int;
  return `${int}.${dec.slice(0, 4)}`;
}

export function BetWidget({ provider, account }: BetWidgetProps) {
  // --- Market state ---
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  // --- Unlink state ---
  const {
    ready, walletExists, activeAccount,
    createWallet, createAccount,
    deposit, balances,
    withdraw,
    busy, error: unlinkError, clearError,
  } = useUnlink();

  const { burners, createBurner, fund, send: burnerSend, sweepToPool, getBalance } = useBurner();

  const [publicBalance, setPublicBalance] = useState<bigint>(0n);
  const [burnerBalance, setBurnerBalance] = useState<bigint>(0n);
  const [shieldAmount, setShieldAmount] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<"loading" | "create" | "ready">("loading");

  const privateBalance = balances[MON_TOKEN] ?? 0n;
  const burnerAddr = burners.length > 0 ? burners[0].address : null;

  // --- Status helper ---
  const showStatus = useCallback((msg: string, duration = 5000) => {
    setTxStatus(msg);
    if (duration > 0) setTimeout(() => setTxStatus(""), duration);
  }, []);

  // --- Load public balance ---
  const loadPublicBalance = useCallback(async () => {
    try {
      const bal = await provider.getBalance(account);
      setPublicBalance(bal);
    } catch { /* ignore */ }
  }, [provider, account]);

  // --- Load burner balance ---
  const loadBurnerBalance = useCallback(async () => {
    if (!burnerAddr) return;
    try {
      const bal = await getBalance(burnerAddr);
      setBurnerBalance(bal);
    } catch { /* ignore */ }
  }, [burnerAddr, getBalance]);

  // --- Load markets ---
  const loadMarkets = useCallback(async () => {
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, provider);
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
      setSelectedMarket((prev) => (prev === null && loaded.length > 0) ? 0 : prev);
    } catch (err) {
      console.error("Failed to load markets:", err);
    }
  }, [provider]);

  // --- Init effects ---
  useEffect(() => { loadMarkets(); }, [loadMarkets]);
  useEffect(() => { loadPublicBalance(); }, [loadPublicBalance]);
  useEffect(() => { loadBurnerBalance(); }, [loadBurnerBalance]);

  // --- Determine setup step ---
  useEffect(() => {
    if (!ready) { setSetupStep("loading"); return; }
    if (!walletExists || !activeAccount) { setSetupStep("create"); return; }
    setSetupStep("ready");
  }, [ready, walletExists, activeAccount]);

  // --- Setup Unlink wallet ---
  const handleSetupWallet = async () => {
    setLoading(true);
    showStatus("Creating private wallet...", 0);
    try {
      if (!walletExists) {
        const { mnemonic: m } = await createWallet();
        setMnemonic(m);
      }
      if (!activeAccount) {
        await createAccount();
      }
      // Create burner if not exists
      if (burners.length === 0) {
        await createBurner(BURNER_INDEX);
      }
      showStatus("Private wallet ready!");
    } catch (err: any) {
      showStatus(`Setup error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Shield MON (deposit to privacy pool) ---
  const handleShield = async () => {
    if (!shieldAmount || parseFloat(shieldAmount) <= 0) return;
    setLoading(true);
    showStatus("Preparing shield transaction...", 0);
    try {
      const amount = ethers.parseEther(shieldAmount);
      const result = await deposit([{ token: MON_TOKEN, amount, depositor: account }]);

      showStatus("Confirm in wallet — depositing to privacy pool...", 0);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: result.to,
        data: result.calldata,
        value: result.value,
      });
      showStatus("Waiting for confirmation...", 0);
      await tx.wait();
      showStatus("MON shielded! Your balance is now private.");
      setShieldAmount("");
      await loadPublicBalance();
    } catch (err: any) {
      if (err.code === "ACTION_REJECTED") {
        showStatus("Transaction cancelled");
      } else {
        showStatus(`Shield error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Place bet via burner ---
  const handlePlaceBet = async () => {
    if (selectedMarket === null || selectedOption === null || !betAmount) return;
    setLoading(true);
    showStatus("Preparing private bet...", 0);

    try {
      const amount = ethers.parseEther(betAmount);
      const gasReserve = ethers.parseEther("0.01"); // reserve for gas

      // Ensure burner exists
      let currentBurner = burners[0];
      if (!currentBurner) {
        currentBurner = await createBurner(BURNER_INDEX);
      }

      // Fund burner from privacy pool
      showStatus("Funding burner from privacy pool...", 0);
      await fund.execute({
        index: BURNER_INDEX,
        params: { token: MON_TOKEN, amount: amount + gasReserve },
      });

      // Build placeBet calldata
      const calldata = iface.encodeFunctionData("placeBet", [selectedMarket, selectedOption]);

      // Send bet from burner (anonymous!)
      showStatus("Placing bet from anonymous address...", 0);
      const { txHash } = await burnerSend.execute({
        index: BURNER_INDEX,
        tx: { to: CONTRACT_ADDRESS, data: calldata, value: amount },
      });

      showStatus(`Bet placed privately! TX: ${txHash.slice(0, 10)}...`);
      setBetAmount("");
      setSelectedOption(null);
      await loadMarkets();
      await loadBurnerBalance();
    } catch (err: any) {
      showStatus(`Bet error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Claim via burner + sweep back ---
  const handleClaim = async (marketId: number) => {
    setLoading(true);
    showStatus("Claiming winnings...", 0);

    try {
      // Ensure burner has gas for claim tx
      const burnerBal = burnerAddr ? await getBalance(burnerAddr) : 0n;
      if (burnerBal < ethers.parseEther("0.005")) {
        showStatus("Funding burner for gas...", 0);
        await fund.execute({
          index: BURNER_INDEX,
          params: { token: MON_TOKEN, amount: ethers.parseEther("0.01") },
        });
      }

      const calldata = iface.encodeFunctionData("claim", [marketId]);
      showStatus("Claiming from burner...", 0);
      await burnerSend.execute({
        index: BURNER_INDEX,
        tx: { to: CONTRACT_ADDRESS, data: calldata },
      });

      // Sweep winnings back to privacy pool
      showStatus("Sweeping winnings to privacy pool...", 0);
      const newBal = burnerAddr ? await getBalance(burnerAddr) : 0n;
      const sweepAmount = newBal - ethers.parseEther("0.002"); // keep tiny reserve
      if (sweepAmount > 0n) {
        await sweepToPool.execute({
          index: BURNER_INDEX,
          params: { token: MON_TOKEN, amount: sweepAmount },
        });
      }

      showStatus("Winnings claimed and re-shielded!");
      await loadMarkets();
      await loadBurnerBalance();
    } catch (err: any) {
      showStatus(`Claim error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Unshield (withdraw to public wallet) ---
  const handleUnshield = async () => {
    if (privateBalance <= 0n) return;
    setLoading(true);
    showStatus("Withdrawing to public wallet...", 0);
    try {
      await withdraw([{ token: MON_TOKEN, amount: privateBalance, recipient: account }]);
      showStatus("MON withdrawn to your public wallet!");
      await loadPublicBalance();
    } catch (err: any) {
      showStatus(`Withdraw error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Derived values ---
  const market = selectedMarket !== null ? markets[selectedMarket] : null;
  const totalPool = market ? market.yesPool + market.noPool : 0n;
  const yesPercent = totalPool > 0n && market ? Number((market.yesPool * 10000n) / totalPool) / 100 : 50;
  const noPercent = totalPool > 0n ? 100 - yesPercent : 50;
  const isActive = market ? Date.now() / 1000 < market.endTime && !market.resolved : false;
  const isLoading = loading || busy;

  // --- Render ---

  // Step 1: Wallet not set up yet
  if (setupStep === "loading") {
    return (
      <div className="bet-widget">
        <div className="widget-header">
          <h2>SHADOWBET</h2>
          <span className="privacy-badge">PRIVACY</span>
        </div>
        <div className="connect-prompt">
          <p>Initializing privacy engine...</p>
        </div>
      </div>
    );
  }

  if (setupStep === "create") {
    return (
      <div className="bet-widget">
        <div className="widget-header">
          <h2>SHADOWBET</h2>
          <span className="privacy-badge">PRIVACY</span>
        </div>
        <div className="connect-prompt">
          <h3>Setup Private Wallet</h3>
          <p>Create an Unlink private account to make anonymous bets on Monad.</p>
          <button className="connect-btn large" onClick={handleSetupWallet} disabled={isLoading}>
            {isLoading ? "Setting up..." : "Create Private Wallet"}
          </button>
          {mnemonic && (
            <div className="mnemonic-box">
              <p className="mnemonic-label">Back up your recovery phrase:</p>
              <code className="mnemonic-words">{mnemonic}</code>
              <button className="connect-btn" onClick={() => setMnemonic(null)} style={{ marginTop: 12 }}>
                I've saved it
              </button>
            </div>
          )}
        </div>
        {txStatus && <div className="tx-status">{txStatus}</div>}
      </div>
    );
  }

  // Step 2: Ready — full betting UI
  return (
    <div className="bet-widget">
      {/* Header */}
      <div className="widget-header">
        <h2>SHADOWBET</h2>
        <span className="privacy-badge">UNLINK</span>
      </div>

      {/* Balance Panel */}
      <div className="balance-panel">
        <div className="balance-row">
          <span className="balance-label">Public</span>
          <span className="balance-value">{fmtBal(publicBalance)} MON</span>
        </div>
        <div className="balance-row private">
          <span className="balance-label">Private</span>
          <span className="balance-value">{fmtBal(privateBalance)} MON</span>
        </div>
        {burnerAddr && burnerBalance > 0n && (
          <div className="balance-row burner">
            <span className="balance-label">Burner</span>
            <span className="balance-value">{fmtBal(burnerBalance)} MON</span>
          </div>
        )}
      </div>

      {/* Shield / Unshield */}
      <div className="shield-section">
        <div className="shield-row">
          <input
            type="text"
            className="shield-input"
            value={shieldAmount}
            onChange={(e) => setShieldAmount(e.target.value)}
            placeholder="0.0"
            disabled={isLoading}
          />
          <button className="shield-btn" onClick={handleShield} disabled={isLoading || !shieldAmount}>
            Shield
          </button>
          {privateBalance > 0n && (
            <button className="unshield-btn" onClick={handleUnshield} disabled={isLoading}>
              Unshield
            </button>
          )}
        </div>
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
                  : market.resolved ? "Settled" : "Betting closed"}
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
                    disabled={isLoading}
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
                <span>
                  {burnerAddr
                    ? `Betting from anonymous address ${burnerAddr.slice(0, 6)}...${burnerAddr.slice(-4)}`
                    : "Your bet will be placed from an anonymous burner address"}
                </span>
              </div>

              <button
                className="place-bet-btn"
                onClick={handlePlaceBet}
                disabled={isLoading || selectedOption === null || !betAmount || parseFloat(betAmount) <= 0 || privateBalance <= 0n}
              >
                {isLoading ? "Processing..." : privateBalance <= 0n ? "Shield MON first" : selectedOption === null ? "Select YES or NO" : "Place Private Bet"}
              </button>
            </div>
          )}

          {/* Claim Section */}
          {market.resolved && (
            <div className="claim-section">
              <button className="claim-btn" onClick={() => handleClaim(market.id)} disabled={isLoading}>
                {isLoading ? "Claiming..." : "Claim & Re-shield"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Unlink Error */}
      {unlinkError && (
        <div className="tx-status error" onClick={clearError} style={{ cursor: "pointer" }}>
          {unlinkError.message} (click to dismiss)
        </div>
      )}

      {/* Transaction Status */}
      {txStatus && <div className="tx-status">{txStatus}</div>}
    </div>
  );
}
