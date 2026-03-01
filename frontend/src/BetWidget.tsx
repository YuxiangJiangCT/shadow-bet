import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useUnlink, useBurner } from "@unlink-xyz/react";
import { SHADOWBET_ABI, CONTRACT_ADDRESS, MON_TOKEN, MONAD_TESTNET, ERROR_MESSAGES, KNOWN_ADMIN, withFallback } from "./contract";
import { MarketCard, formatTimeLeft } from "./MarketCard";

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
  initialMarket?: number | null;
  requestedView?: string | null;
  betsByMarket?: Record<number, number>;
  onViewStep?: (view: string) => void;
}

interface MyBet {
  marketId: number;
  burnerAddr: string;
  amount: bigint;
  option: number;
  claimed: boolean;
}

const iface = new ethers.Interface(SHADOWBET_ABI);

/** Sort markets: Active (by pool size desc) → Ended (by endTime asc) → Resolved (by id desc) */
function sortMarkets(markets: Market[]): Market[] {
  const now = Math.floor(Date.now() / 1000);
  const statusPriority = (m: Market) => {
    if (m.resolved) return 2;
    if (m.endTime > now) return 0;
    return 1;
  };
  return [...markets].sort((a, b) => {
    const pa = statusPriority(a), pb = statusPriority(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0) {
      const poolA = a.yesPool + a.noPool;
      const poolB = b.yesPool + b.noPool;
      return poolB > poolA ? 1 : poolB < poolA ? -1 : 0;
    }
    if (pa === 1) return a.endTime - b.endTime;
    return b.id - a.id;
  });
}

/** Parse contract revert errors into friendly messages */
function parseContractError(err: any): string {
  // Try to decode custom error from data field
  const data = err?.data || err?.error?.data;
  if (data && typeof data === "string" && data.startsWith("0x")) {
    try {
      const decoded = iface.parseError(data);
      if (decoded) {
        return ERROR_MESSAGES[decoded.name] || decoded.name;
      }
    } catch { /* not a known error */ }
  }
  // Check error message for known patterns
  const msg = err?.message || "";
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(key)) return friendly;
  }
  if (err?.code === "ACTION_REJECTED") return "Transaction cancelled";
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

function explorerTxUrl(txHash: string): string {
  return `${MONAD_TESTNET.blockExplorer}/tx/${txHash}`;
}

/** Format Date to local YYYY-MM-DDTHH:MM for datetime-local input */
function toLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format wei to readable string with max 4 decimal places */
function fmtBal(wei: bigint, decimals = 18): string {
  const str = ethers.formatUnits(wei, decimals);
  const [int, dec] = str.split(".");
  if (!dec) return int;
  return `${int}.${dec.slice(0, 4)}`;
}

export function BetWidget({ provider, account, initialMarket, requestedView, betsByMarket, onViewStep }: BetWidgetProps) {
  // --- Market state ---
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<number | null>(initialMarket ?? null);
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

  const { burners, createBurner, fund, send: burnerSend, getBalance } = useBurner();

  const [publicBalance, setPublicBalance] = useState<bigint>(0n);
  const [burnerBalance, setBurnerBalance] = useState<bigint>(0n);
  const [shieldAmount, setShieldAmount] = useState("");
  const [unshieldAmount, setUnshieldAmount] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<"loading" | "create" | "ready">("loading");
  const [burnerIndex, setBurnerIndex] = useState(0);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [viewStep, setViewStep] = useState<"browse" | "bet" | "wallet" | "admin">("browse");
  const [marketFilter, setMarketFilter] = useState<"all" | "active" | "ended" | "resolved">("all");

  const privateBalance = balances[MON_TOKEN] ?? balances[MON_TOKEN.toLowerCase()] ?? 0n;
  const activeBurner = burners.find(b => b.index === burnerIndex);

  // --- Admin state ---
  const [newQuestion, setNewQuestion] = useState("");
  const [newEndTime, setNewEndTime] = useState(() => {
    const d = new Date(Date.now() + 259200 * 1000); // default 3 days
    return toLocalDateTime(d);
  });
  const burnerAddr = activeBurner?.address ?? (burners.length > 0 ? burners[0].address : null);
  const isAdmin = account.toLowerCase() === KNOWN_ADMIN.toLowerCase();

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

  // --- Load markets — sequential fallback, no broadcast ---
  const loadMarkets = useCallback(async () => {
    try {
      const count = await withFallback(p =>
        new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, p).marketCount()
      );
      const loaded: Market[] = [];
      for (let i = 0; i < Number(count); i++) {
        try {
          const m = await withFallback(p =>
            new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, p).getMarket(i)
          );
          loaded.push({
            id: i,
            question: m.question,
            endTime: Number(m.endTime),
            yesPool: m.yesPool,
            noPool: m.noPool,
            resolved: m.resolved,
            winningOption: Number(m.winningOption),
          });
        } catch {
          // skip single market fetch failure
        }
      }
      // Deduplicate by question (keep first occurrence = lower ID)
      const seen = new Set<string>();
      const unique = loaded.filter(m => {
        const key = m.question.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setMarkets(sortMarkets(unique));
    } catch (err) {
      console.error("Failed to load markets:", err);
    }
  }, []); // stable — withFallback creates fresh providers per call

  // --- My Bets state ---
  const [myBets, setMyBets] = useState<MyBet[]>([]);

  // Ref so loadMyBets can read latest markets without being in its dep array
  const marketsRef = useRef<Market[]>(markets);
  useEffect(() => { marketsRef.current = markets; }, [markets]);

  const loadMyBets = useCallback(async () => {
    const currentMarkets = marketsRef.current;
    if (burners.length === 0 || currentMarkets.length === 0) return;
    try {
      const found: MyBet[] = [];
      let successCount = 0;
      for (const b of burners) {
        for (const m of currentMarkets) {
          try {
            const bet = await withFallback(p =>
              new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, p).getBet(m.id, b.address)
            );
            successCount++;
            if (bet.amount > 0n) {
              found.push({ marketId: m.id, burnerAddr: b.address, amount: bet.amount, option: Number(bet.option), claimed: bet.claimed });
            }
          } catch { /* skip single bet lookup failure */ }
        }
      }
      // Only replace state if at least one RPC call succeeded — preserve optimistic data otherwise
      if (successCount > 0) setMyBets(found);
    } catch { /* ignore */ }
  }, [burners]); // markets via ref, RPC via withFallback — no provider dep needed

  // --- Create market (admin) ---
  const handleCreateMarket = async () => {
    if (!newQuestion.trim()) return;
    setLoading(true);
    showStatus("Creating market...", 0);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, signer);
      const endTime = Math.floor(new Date(newEndTime).getTime() / 1000);
      const tx = await contract.createMarket(newQuestion.trim(), endTime);
      const receipt = await tx.wait();
      // Parse new market ID from MarketCreated event
      const createdLog = receipt.logs.find((log: any) => {
        try { return iface.parseLog(log)?.name === "MarketCreated"; } catch { return false; }
      });
      const newId = createdLog ? Number(iface.parseLog(createdLog)!.args[0]) : null;
      showStatus("Market created!");
      setNewQuestion("");
      await loadMarkets();
      if (newId !== null) {
        setSelectedMarket(newId);
        setViewStep("bet");
      }
    } catch (err: any) {
      showStatus(`Create error: ${parseContractError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Resolve market (admin) ---
  const handleResolve = async (marketId: number, winningOption: number) => {
    setLoading(true);
    showStatus(`Resolving market #${marketId}...`, 0);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, signer);
      const tx = await contract.resolve(marketId, winningOption);
      await tx.wait();
      showStatus("Market resolved!");
      await loadMarkets();
    } catch (err: any) {
      showStatus(`Resolve error: ${parseContractError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Init effects ---
  useEffect(() => { loadMarkets(); }, [loadMarkets]);
  useEffect(() => { loadPublicBalance(); }, [loadPublicBalance]);
  useEffect(() => { loadBurnerBalance(); }, [loadBurnerBalance]);
  // Load bets AFTER markets load + RPC cooldown (avoid rate limit clash)
  // Use markets.length (not markets) to avoid firing on every new array reference from sort
  const marketsLen = markets.length;
  const burnersLen = burners.length;
  useEffect(() => {
    if (marketsLen === 0 || burnersLen === 0) return;
    const t1 = setTimeout(() => loadMyBets(), 3000);
    const t2 = setTimeout(() => loadMyBets(), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [marketsLen, burnersLen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync initialMarket prop
  useEffect(() => {
    if (initialMarket !== undefined && initialMarket !== null) {
      setSelectedMarket(initialMarket);
      setViewStep("bet");
    }
  }, [initialMarket]);

  // Sync requestedView from App nav
  useEffect(() => {
    if (requestedView === "browse" || requestedView === "wallet" || requestedView === "admin") {
      setViewStep(requestedView);
    }
  }, [requestedView]);

  // Refresh markets when returning to browse view (only if already loaded once — avoids double-load on mount)
  const prevViewStep = useRef<string>("");
  useEffect(() => {
    if (viewStep === "browse" && prevViewStep.current !== "" && prevViewStep.current !== "browse") {
      loadMarkets();
    }
    prevViewStep.current = viewStep;
  }, [viewStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report viewStep changes back to App for nav highlight
  useEffect(() => {
    onViewStep?.(viewStep);
  }, [viewStep, onViewStep]);

  // Auto-dismiss SDK errors after 3s (sweep/fund errors fire asynchronously)
  useEffect(() => {
    if (!unlinkError) return;
    const t = setTimeout(() => clearError(), 3000);
    return () => clearTimeout(t);
  }, [unlinkError, clearError]);

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
        await createBurner(burnerIndex);
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
      showStatus(`Shield error: ${parseContractError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Place bet via burner ---
  const handlePlaceBet = async () => {
    if (selectedMarket === null || selectedOption === null || !betAmount) return;
    setLoading(true);
    setLastTxHash(null);
    showStatus("Preparing private bet...", 0);

    try {
      const amount = ethers.parseEther(betAmount);
      const gasReserve = ethers.parseEther("0.05");

      // Ensure burner exists
      if (!burners.find(b => b.index === burnerIndex)) {
        await createBurner(burnerIndex);
      }

      // Fund burner from privacy pool
      showStatus("Funding burner from privacy pool...", 0);
      await fund.execute({
        index: burnerIndex,
        params: { token: MON_TOKEN, amount: amount + gasReserve },
      });

      // Verify burner was actually funded (SDK may fail silently)
      const fundedAddr = burners.find(b => b.index === burnerIndex)?.address;
      if (fundedAddr) {
        await new Promise(r => setTimeout(r, 1000)); // wait for on-chain state
        const burnerBal = await getBalance(fundedAddr);
        if (burnerBal < amount) {
          throw new Error("Burner funding failed — try again or shield more MON");
        }
      }

      // Build placeBet calldata
      const calldata = iface.encodeFunctionData("placeBet", [selectedMarket, selectedOption]);

      // Send bet from burner (anonymous!)
      showStatus("Placing bet from anonymous address...", 0);
      const { txHash } = await burnerSend.execute({
        index: burnerIndex,
        tx: { to: CONTRACT_ADDRESS, data: calldata, value: amount },
      });

      setLastTxHash(txHash);
      showStatus(`Bet placed privately!`, 0);

      // Optimistic update — show the bet immediately without waiting for RPC
      const betBurnerAddr = burners.find(b => b.index === burnerIndex)?.address ?? "unknown";
      setMyBets(prev => [...prev, {
        marketId: selectedMarket,
        burnerAddr: betBurnerAddr,
        amount,
        option: selectedOption,
        claimed: false,
      }]);

      setBetAmount("");
      setSelectedOption(null);
      // Delay before reload — RPC rate limit cooldown after fund+send
      await new Promise(r => setTimeout(r, 2000));
      await loadMarkets();

      // NOTE: sweepToPool disabled — Unlink SDK reverts on Monad testnet.
      // Leftover gas stays in burner (reused on next bet).
      clearError(); // dismiss any lingering SDK errors

      await loadBurnerBalance();
      setViewStep("wallet");
      showStatus("Bet placed privately! Markets will refresh shortly.", 8000);
      // Background reload after sweep settles
      setTimeout(() => loadMarkets(), 5000);
    } catch (err: any) {
      const friendly = parseContractError(err);
      // Auto-rotate burner on AlreadyBet
      if (friendly.includes("already placed")) {
        const newIndex = burnerIndex + 1;
        setBurnerIndex(newIndex);
        await createBurner(newIndex);
        showStatus(`${friendly}. Switched to new burner — try again!`);
      } else {
        showStatus(`Bet error: ${friendly}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Claim via burner + sweep back ---
  const handleClaim = async (marketId: number) => {
    setLoading(true);
    setLastTxHash(null);
    showStatus("Claiming winnings...", 0);

    try {
      // Ensure burner has gas for claim tx
      const burnerBal = burnerAddr ? await getBalance(burnerAddr) : 0n;
      if (burnerBal < ethers.parseEther("0.005")) {
        showStatus("Funding burner for gas...", 0);
        await fund.execute({
          index: burnerIndex,
          params: { token: MON_TOKEN, amount: ethers.parseEther("0.01") },
        });
      }

      const calldata = iface.encodeFunctionData("claim", [marketId]);
      showStatus("Claiming from burner...", 0);
      const { txHash } = await burnerSend.execute({
        index: burnerIndex,
        tx: { to: CONTRACT_ADDRESS, data: calldata },
      });

      setLastTxHash(txHash);

      // Optimistic: mark bet as claimed so button disappears immediately
      setMyBets(prev => prev.map(b =>
        b.marketId === marketId && b.burnerAddr === burnerAddr
          ? { ...b, claimed: true }
          : b
      ));

      // sweepToPool disabled — reverts on Monad testnet

      showStatus("Winnings claimed to burner! Check Wallet for updated balance.", 8000);
      await loadMarkets();
      await loadBurnerBalance();
      clearError();
    } catch (err: any) {
      const friendly = parseContractError(err);
      if (friendly.includes("already claimed")) {
        clearError(); // dismiss raw SDK error immediately
        setMyBets(prev => prev.map(b =>
          b.marketId === marketId && b.burnerAddr === burnerAddr
            ? { ...b, claimed: true }
            : b
        ));
        showStatus("Winnings already claimed.", 5000);
      } else {
        showStatus(`Claim error: ${friendly}`);
      }
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
      const amount = unshieldAmount && parseFloat(unshieldAmount) > 0
        ? ethers.parseEther(unshieldAmount)
        : privateBalance;
      await withdraw([{ token: MON_TOKEN, amount, recipient: account }]);
      showStatus("MON withdrawn to your public wallet!");
      setUnshieldAmount("");
      await loadPublicBalance();
    } catch (err: any) {
      showStatus(`Withdraw error: ${parseContractError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Stepper helper ---
  function getStepperState(m: Market, active: boolean) {
    const steps = [
      { label: "Shield", icon: "\ud83d\udee1\ufe0f" },
      { label: "Bet",    icon: "\ud83c\udfb2" },
      { label: "Settle", icon: "\u2696\ufe0f" },
      { label: "Claim",  icon: "\ud83d\udcb0" },
      { label: "Re-shield", icon: "\ud83d\udd12" },
    ];
    // Resolved markets: full cycle complete (funds stay private in burner)
    if (m.resolved) return steps.map(s => ({ ...s, state: "completed" as const }));
    const activeIdx = active ? 1 : 2; // active=betting, ended=settling
    return steps.map((s, i) => ({
      ...s,
      state: i < activeIdx ? "completed" as const
           : i === activeIdx ? "active" as const
           : "pending" as const,
    }));
  }

  // --- Derived values ---
  const market = selectedMarket !== null ? markets.find(m => m.id === selectedMarket) ?? null : null;
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
        <div className="view-card">
          <div className="connect-prompt">
            <span className="spinner" />
            <p>Initializing privacy engine...</p>
          </div>
        </div>
      </div>
    );
  }

  if (setupStep === "create") {
    return (
      <div className="bet-widget">
        <div className="view-card">
          <div className="connect-prompt">
            <h3>Setup Private Wallet</h3>
            <p>Create an Unlink private account to make anonymous bets on Monad.</p>
            <button className="connect-btn large" onClick={handleSetupWallet} disabled={isLoading}>
              {isLoading ? <><span className="spinner" />Setting up...</> : "Create Private Wallet"}
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
      </div>
    );
  }

  // Step 2: Ready — multi-view betting UI
  return (
    <div className="bet-widget">
      {/* Balance Bar — pure display, no nav buttons */}
      <div className="widget-top">
        <div className="balance-bar">
          <span>{fmtBal(publicBalance)} MON</span>
          <span className="balance-bar-sep">|</span>
          <span className="balance-bar-private">&#x1F512; {fmtBal(privateBalance)} MON</span>
        </div>
      </div>

      {/* ===== VIEW: Browse Markets ===== */}
      {viewStep === "browse" && (
        <div className="view-browse">
          {/* Filter Tabs */}
          {markets.length > 0 && (() => {
            const now = Math.floor(Date.now() / 1000);
            const counts = {
              all: markets.length,
              active: markets.filter(m => !m.resolved && m.endTime > now).length,
              ended: markets.filter(m => !m.resolved && m.endTime <= now).length,
              resolved: markets.filter(m => m.resolved).length,
            };
            return (
              <div className="market-filter-tabs">
                {(["all", "active", "ended", "resolved"] as const).map(f => (
                  <button
                    key={f}
                    className={`filter-tab ${marketFilter === f ? "active" : ""}`}
                    onClick={() => setMarketFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="filter-count">{counts[f]}</span>
                  </button>
                ))}
              </div>
            );
          })()}
          {/* Market Grid */}
          {markets.length > 0 ? (() => {
            const now = Math.floor(Date.now() / 1000);
            const filtered = markets.filter(m => {
              if (marketFilter === "active") return !m.resolved && m.endTime > now;
              if (marketFilter === "ended") return !m.resolved && m.endTime <= now;
              if (marketFilter === "resolved") return m.resolved;
              return true;
            });
            return filtered.length > 0 ? (
              <div className="market-grid">
                {filtered.map((m) => (
                  <MarketCard
                    key={m.id}
                    market={m}
                    selected={selectedMarket === m.id}
                    onClick={() => {
                      setSelectedMarket(m.id);
                      setViewStep("bet");
                    }}
                    betCount={betsByMarket?.[m.id]}
                  />
                ))}
              </div>
            ) : (
              <div className="no-markets">No {marketFilter} markets</div>
            );
          })() : (
            <div className="no-markets">No markets yet</div>
          )}
        </div>
      )}

      {/* ===== VIEW: Admin ===== */}
      {viewStep === "admin" && (
        <div className="view-card">
          <button className="step-back" onClick={() => setViewStep("browse")}>
            &#8592; Back
          </button>
          <div className="admin-panel" style={{ border: "none", background: "none" }}>
            <div className="admin-panel-body" style={{ padding: 0 }}>
              <input
                type="text"
                className="shield-input"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Market question, e.g. Will MON hit $10?"
                disabled={isLoading}
              />
              <div className="admin-duration-btns">
                {[
                  { label: "2 Min", val: 120 },
                  { label: "10 Min", val: 600 },
                  { label: "1 Day", val: 86400 },
                  { label: "7 Days", val: 604800 },
                ].map((d) => (
                  <button
                    key={d.val}
                    className="quick-btn"
                    onClick={() => {
                      const dt = new Date(Date.now() + d.val * 1000);
                      setNewEndTime(toLocalDateTime(dt));
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                className="shield-input"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                disabled={isLoading}
              />
              <div className="admin-end-preview">
                Ends: {new Date(newEndTime).toLocaleString()}
              </div>
              <button
                className="connect-btn"
                onClick={handleCreateMarket}
                disabled={isLoading || !newQuestion.trim()}
              >
                {isLoading ? <><span className="spinner" />Creating...</> : "Create Market"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== VIEW: Place Bet ===== */}
      {viewStep === "bet" && (
        <div className="view-card">
          <button className="step-back" onClick={() => setViewStep("browse")}>
            &#8592; All Markets
          </button>

          {market ? (
            <>
              <div className="market-question">
                <p>{market.question}</p>
                <div className="market-meta">
                  <span className={`market-status ${market.resolved ? "resolved" : isActive ? "active" : "ended"}`}>
                    {market.resolved ? `Resolved: ${market.winningOption === 0 ? "YES" : "NO"}` : isActive ? "Active" : "Ended"}
                  </span>
                  <span className="market-time">
                    {isActive
                      ? `Ends in ${formatTimeLeft(market.endTime)}`
                      : market.resolved ? "Settled" : "Betting closed"}
                  </span>
                </div>
              </div>

              {/* Privacy Lifecycle Stepper */}
              <div className="privacy-stepper">
                {getStepperState(market, isActive).map((step, i) => (
                  <Fragment key={step.label}>
                    {i > 0 && <div className={`stepper-line ${step.state !== "pending" ? "filled" : ""}`} />}
                    <div className={`stepper-step ${step.state}`}>
                      <span className="stepper-icon">{step.icon}</span>
                      <span className="stepper-label">{step.label}</span>
                    </div>
                  </Fragment>
                ))}
              </div>

              {/* Odds Bar */}
              <div className="odds-section">
                <div className="odds-labels">
                  <span className="yes-label">YES {yesPercent.toFixed(1)}%</span>
                  <span className="pool-total">{fmtBal(totalPool)} MON</span>
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

                  {privateBalance <= 0n ? (
                    <button
                      className="place-bet-btn"
                      onClick={() => setViewStep("wallet")}
                    >
                      Shield MON first &#8594;
                    </button>
                  ) : (
                    <button
                      className="place-bet-btn"
                      onClick={handlePlaceBet}
                      disabled={isLoading || selectedOption === null || !betAmount || parseFloat(betAmount) <= 0}
                    >
                      {isLoading ? <><span className="spinner" />Processing...</> : selectedOption === null ? "Select YES or NO" : "Place Private Bet"}
                    </button>
                  )}
                </div>
              )}

              {/* Admin Resolve — ended but not yet resolved */}
              {isAdmin && !isActive && !market.resolved && (
                <div className="resolve-section">
                  <p className="resolve-label">Admin: Resolve this market</p>
                  <div className="option-buttons">
                    <button
                      className="option-btn yes"
                      onClick={() => handleResolve(market.id, 0)}
                      disabled={isLoading}
                    >
                      {isLoading ? "..." : "YES Wins"}
                    </button>
                    <button
                      className="option-btn no"
                      onClick={() => handleResolve(market.id, 1)}
                      disabled={isLoading}
                    >
                      {isLoading ? "..." : "NO Wins"}
                    </button>
                  </div>
                </div>
              )}

              {/* Claim Section */}
              {market.resolved && !myBets.some(b => b.marketId === market.id && b.claimed) && (
                <div className="claim-section">
                  <button className="claim-btn" onClick={() => handleClaim(market.id)} disabled={isLoading}>
                    {isLoading ? <><span className="spinner" />Claiming...</> : "Claim Winnings"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="no-markets">Select a market to place a bet</div>
          )}
        </div>
      )}

      {/* ===== VIEW: Wallet ===== */}
      {viewStep === "wallet" && (
        <div className="view-card">
          <button className="step-back" onClick={() => setViewStep("browse")}>
            &#8592; Back
          </button>

          {/* Full Balance Panel */}
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

          {/* Shield/Unshield */}
          <div className="shield-section">
            <div className="shield-row">
              <input
                type="text"
                className="shield-input"
                value={shieldAmount}
                onChange={(e) => setShieldAmount(e.target.value)}
                placeholder="Amount to shield"
                disabled={isLoading}
              />
              <button className="shield-btn" onClick={handleShield} disabled={isLoading || !shieldAmount}>
                Shield
              </button>
            </div>
            {privateBalance > 0n && (
              <div className="shield-row" style={{ marginTop: 8 }}>
                <input
                  type="text"
                  className="shield-input"
                  value={unshieldAmount}
                  onChange={(e) => setUnshieldAmount(e.target.value)}
                  placeholder={`Max: ${fmtBal(privateBalance)}`}
                  disabled={isLoading}
                />
                <button className="unshield-btn" onClick={handleUnshield} disabled={isLoading}>
                  {unshieldAmount ? "Unshield" : "Unshield All"}
                </button>
              </div>
            )}
          </div>

          {/* My Bets */}
          {myBets.length > 0 ? (
            <div className="my-bets">
              <div className="my-bets-header">
                <h3>My Bets</h3>
                <span className="my-bets-count">{myBets.length}</span>
              </div>
              {myBets.map((bet, i) => {
                const m = markets.find((mk) => mk.id === bet.marketId);
                const status = bet.claimed
                  ? "claimed"
                  : m?.resolved && bet.option === m.winningOption
                  ? "won"
                  : m?.resolved
                  ? "lost"
                  : "active";
                return (
                  <div key={i} className={`my-bets-row ${status}`}>
                    <div className="my-bets-market">
                      <span className="my-bets-question">
                        {m ? (m.question.length > 40 ? m.question.slice(0, 40) + "..." : m.question) : `Market #${bet.marketId}`}
                      </span>
                      <span className="my-bets-burner">
                        via {bet.burnerAddr.slice(0, 6)}...{bet.burnerAddr.slice(-4)}
                      </span>
                    </div>
                    <div className="my-bets-info">
                      <span className="my-bets-option">{bet.option === 0 ? "YES" : "NO"}</span>
                      <span className="my-bets-amount">{fmtBal(bet.amount)} MON</span>
                      <span className={`my-bets-status ${status}`}>
                        {status === "claimed" ? "Claimed" : status === "won" ? "Won" : status === "lost" ? "Lost" : "Active"}
                      </span>
                      {status === "won" && (
                        <button className="my-bets-claim" onClick={() => handleClaim(bet.marketId)} disabled={isLoading}>
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="wallet-empty-state">
              <p>No bets yet</p>
              <p style={{ marginTop: 8, fontSize: 12, opacity: 0.5 }}>
                Place your first private bet to see it here
              </p>
            </div>
          )}
        </div>
      )}

      {/* Unlink Error — always visible */}
      {unlinkError && (
        <div className="tx-status error" onClick={clearError} style={{ cursor: "pointer" }}>
          {unlinkError.message} (click to dismiss)
        </div>
      )}

      {/* Transaction Status — always visible */}
      {txStatus && (
        <div className="tx-status">
          {txStatus}
          {lastTxHash && (
            <a
              href={explorerTxUrl(lastTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              View on Explorer
            </a>
          )}
        </div>
      )}
    </div>
  );
}
