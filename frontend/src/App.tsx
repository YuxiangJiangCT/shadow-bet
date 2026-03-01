import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { BetWidget } from "./BetWidget";
import { HowItWorks } from "./HowItWorks";
import { MarketCard } from "./MarketCard";
import { MarketDetail } from "./MarketDetail";
import { PrivacyProof } from "./PrivacyProof";
import { MONAD_TESTNET, CONTRACT_ADDRESS, SHADOWBET_ABI, KNOWN_ADMIN, withFallback } from "./contract";
import { useOnChainAudit } from "./useOnChainAudit";
import "./App.css";

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface MarketData {
  id: number;
  question: string;
  endTime: number;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  winningOption: number;
}


/** Sort markets: Active (by pool size desc) → Ended (by endTime asc) → Resolved (by id desc) */
function sortMarkets(markets: MarketData[]): MarketData[] {
  const now = Math.floor(Date.now() / 1000);
  const statusPriority = (m: MarketData) => {
    if (m.resolved) return 2;
    if (m.endTime > now) return 0;
    return 1;
  };
  return [...markets].sort((a, b) => {
    const pa = statusPriority(a), pb = statusPriority(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0) {
      // Active: bigger pool first
      const poolA = a.yesPool + a.noPool;
      const poolB = b.yesPool + b.noPool;
      return poolB > poolA ? 1 : poolB < poolA ? -1 : 0;
    }
    if (pa === 1) {
      // Ended: earliest endTime first (ready to resolve)
      return a.endTime - b.endTime;
    }
    // Resolved: newest id first
    return b.id - a.id;
  });
}

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [publicMarkets, setPublicMarkets] = useState<MarketData[]>([]);
  const { totalBets, betsByMarket } = useOnChainAudit();

  const parseHash = (h: string): { page: "app" | "how" | "privacy" | "market"; marketId: number | null } => {
    const marketMatch = h.match(/^#\/market\/(\d+)$/);
    if (marketMatch) return { page: "market", marketId: Number(marketMatch[1]) };
    if (h === "#/how-it-works") return { page: "how", marketId: null };
    if (h === "#/privacy-proof") return { page: "privacy", marketId: null };
    return { page: "app", marketId: null };
  };

  const initialRoute = parseHash(window.location.hash);
  const [page, setPage] = useState<"app" | "how" | "privacy" | "market">(initialRoute.page);
  const [marketId, setMarketId] = useState<number | null>(initialRoute.marketId);
  const [initialMarket, setInitialMarket] = useState<number | null>(null);
  const [widgetView, setWidgetView] = useState<string | null>(null);
  const [landingFilter, setLandingFilter] = useState<"all" | "active" | "ended" | "resolved">("all");

  const isMetaMaskInstalled = typeof window.ethereum !== "undefined";
  const isAdmin = account?.toLowerCase() === KNOWN_ADMIN.toLowerCase();

  const navigateTo = (p: "app" | "how" | "privacy" | "market", id?: number) => {
    setPage(p);
    setMarketId(p === "market" && id !== undefined ? id : null);
    if (p === "market" && id !== undefined) {
      window.location.hash = `#/market/${id}`;
    } else {
      const hashes = { app: "#/", how: "#/how-it-works", privacy: "#/privacy-proof", market: "#/" };
      window.location.hash = hashes[p];
    }
  };

  // Listen for hash changes
  useEffect(() => {
    const onHash = () => {
      const parsed = parseHash(window.location.hash);
      setPage(parsed.page);
      setMarketId(parsed.marketId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load markets from public RPC — sequential fallback across nodes (no broadcast)
  const loadPublicMarkets = useCallback(async () => {
    try {
      const count = await withFallback(p =>
        new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, p).marketCount()
      );
      const loaded: MarketData[] = [];
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
      setPublicMarkets(sortMarkets(unique));
    } catch (err) {
      console.error("Failed to load public markets:", err);
    }
  }, []);

  useEffect(() => {
    loadPublicMarkets();
  }, [loadPublicMarkets]);

  const switchToMonad = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_TESTNET.chainIdHex }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: MONAD_TESTNET.chainIdHex,
              chainName: MONAD_TESTNET.name,
              rpcUrls: [MONAD_TESTNET.rpcUrl],
              blockExplorerUrls: [MONAD_TESTNET.blockExplorer],
              nativeCurrency: MONAD_TESTNET.currency,
            },
          ],
        });
      }
    }
  };

  const connectWallet = async () => {
    if (!isMetaMaskInstalled) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const signer = await prov.getSigner();
      const address = await signer.getAddress();
      const network = await prov.getNetwork();
      const currentChain = Number(network.chainId);

      setProvider(prov);
      setAccount(address);
      setChainId(currentChain);
      setWrongNetwork(currentChain !== MONAD_TESTNET.chainId);
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setChainId(null);
    setWrongNetwork(false);
  };

  // Listen for wallet events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setAccount(accounts[0]);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  // Auto-connect
  useEffect(() => {
    if (!isMetaMaskInstalled) return;
    const checkConnection = async () => {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.listAccounts();
      if (accounts.length > 0) {
        const network = await prov.getNetwork();
        const currentChain = Number(network.chainId);
        setProvider(prov);
        setAccount(accounts[0].address);
        setChainId(currentChain);
        setWrongNetwork(currentChain !== MONAD_TESTNET.chainId);
      }
    };
    checkConnection();
  }, [isMetaMaskInstalled]);

  return (
    <div className="app-container">
      {/* Nav */}
      <nav className="nav-bar">
        <div className="nav-logo" onClick={() => { setWidgetView("browse"); navigateTo("app"); }} style={{ cursor: "pointer" }}>
          <img src="/logo.svg" alt="ShadowBet" className="nav-logo-img" />
          <span className="logo-text">ShadowBet</span>
          <span className="chain-badge">MONAD</span>
          <span className="privacy-badge">UNLINK</span>
        </div>
        {/* Center: Navigation */}
        <div className="nav-links">
          <button
            className={`nav-link ${page === "app" && (widgetView === "browse" || widgetView === "bet" || widgetView === null) ? "active" : ""}`}
            onClick={() => { setWidgetView("browse"); navigateTo("app"); }}
          >
            Markets
          </button>
          {account && isAdmin && (
            <button
              className={`nav-link ${page === "app" && widgetView === "admin" ? "active" : ""}`}
              onClick={() => { setWidgetView("admin"); navigateTo("app"); }}
            >
              Create
            </button>
          )}
          {account && (
            <button
              className={`nav-link ${page === "app" && widgetView === "wallet" ? "active" : ""}`}
              onClick={() => { setWidgetView("wallet"); navigateTo("app"); }}
            >
              Wallet
            </button>
          )}
          <button
            className={`nav-link nav-link-secondary ${page === "how" ? "active" : ""}`}
            onClick={() => navigateTo("how")}
          >
            How It Works
          </button>
          <button
            className={`nav-link nav-link-secondary ${page === "privacy" ? "active" : ""}`}
            onClick={() => navigateTo("privacy")}
          >
            Privacy Proof
          </button>
        </div>

        {/* Right: Wallet Status */}
        <div className="nav-wallet">
          {!account ? (
            <button className="connect-btn" onClick={connectWallet}>
              {isMetaMaskInstalled ? "Connect Wallet" : "Install MetaMask"}
            </button>
          ) : (
            <div className="wallet-info">
              <span className="network-pill">
                {chainId === MONAD_TESTNET.chainId ? "Monad Testnet" : `Chain ${chainId}`}
              </span>
              <span className="address-pill">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
              <button className="disconnect-btn" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        {page === "how" ? (
          <HowItWorks onStart={() => navigateTo("app")} />
        ) : page === "privacy" ? (
          <PrivacyProof account={account} burnerAddr={null} onStart={() => navigateTo("app")} />
        ) : page === "market" && marketId !== null ? (
          <MarketDetail
            marketId={marketId}
            account={account}
            onConnect={connectWallet}
            onBet={(id) => {
              if (!account) {
                connectWallet();
              } else {
                setInitialMarket(id);
                navigateTo("app");
              }
            }}
            onBack={() => navigateTo("app")}
          />
        ) : !account ? (
          /* ===== LANDING PAGE (no wallet) ===== */
          <div className="landing">
            {/* Hero */}
            <div className="landing-hero">
              <img src="/logo.svg" alt="ShadowBet" className="hero-logo" />
              <h1 className="landing-title">Private Prediction Markets</h1>
              <p className="landing-subtitle">Your bets. Your secret. On Monad.</p>
              {totalBets > 0 && (
                <div className="landing-stats">
                  <span className="stats-badge">{totalBets} private bets placed</span>
                </div>
              )}
              <button className="connect-btn large" onClick={connectWallet}>
                {isMetaMaskInstalled ? "Connect Wallet" : "Install MetaMask"}
              </button>
            </div>

            {/* Live Markets (read-only) */}
            {publicMarkets.length > 0 && (() => {
              const now = Math.floor(Date.now() / 1000);
              const counts = {
                all: publicMarkets.length,
                active: publicMarkets.filter(m => !m.resolved && m.endTime > now).length,
                ended: publicMarkets.filter(m => !m.resolved && m.endTime <= now).length,
                resolved: publicMarkets.filter(m => m.resolved).length,
              };
              const filtered = publicMarkets.filter(m => {
                if (landingFilter === "active") return !m.resolved && m.endTime > now;
                if (landingFilter === "ended") return !m.resolved && m.endTime <= now;
                if (landingFilter === "resolved") return m.resolved;
                return true;
              });
              return (
                <div className="landing-markets">
                  <div className="landing-markets-header">
                    <h3 className="landing-section-title">Markets</h3>
                    <div className="market-filter-tabs">
                      {(["all", "active", "ended", "resolved"] as const).map(f => (
                        <button
                          key={f}
                          className={`filter-tab ${landingFilter === f ? "active" : ""}`}
                          onClick={() => setLandingFilter(f)}
                        >
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                          <span className="filter-count">{counts[f]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {filtered.length > 0 ? (
                    <div className="market-grid">
                      {filtered.map((m) => (
                        <MarketCard
                          key={m.id}
                          market={m}
                          selected={false}
                          onClick={() => navigateTo("market", m.id)}
                          betCount={betsByMarket[m.id]}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="no-markets">No {landingFilter} markets</div>
                  )}
                  <p className="landing-hint">Connect wallet to place a private bet</p>
                </div>
              );
            })()}

            {/* Features */}
            <div className="landing-features">
              <div className="feature-card">
                <div className="feature-icon privacy-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <h4>Privacy First</h4>
                <p>Bet via anonymous burner addresses. Your position stays hidden.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon speed-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
                <h4>Monad Speed</h4>
                <p>400ms blocks. Near-instant bet confirmations.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon simple-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <h4>Simple</h4>
                <p>Shield, bet, claim. Three steps to private prediction.</p>
              </div>
            </div>
          </div>
        ) : wrongNetwork ? (
          <div className="bet-widget">
            <div className="widget-header">
              <h2>WRONG NETWORK</h2>
            </div>
            <div className="connect-prompt">
              <p>Please switch to Monad Testnet to use ShadowBet.</p>
              <button className="connect-btn large" onClick={switchToMonad}>
                Switch to Monad Testnet
              </button>
            </div>
          </div>
        ) : (
          <BetWidget provider={provider!} account={account} initialMarket={initialMarket} requestedView={widgetView} onViewChanged={() => setWidgetView(null)} betsByMarket={betsByMarket} onViewStep={(v) => setWidgetView(v)} />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>Built for <a href="https://dorahacks.io" target="_blank" rel="noopener noreferrer">Unlink × Monad Hackathon</a></span>
        <span className="footer-sep">·</span>
        <a href="https://testnet.monadexplorer.com/address/0x1187167eFA940EA400A8C2c7D91573A2Ec93145A" target="_blank" rel="noopener noreferrer">Contract</a>
        <span className="footer-sep">·</span>
        <a href="https://github.com/YuxiangJiangCT/shadow-bet" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}

export default App;
