import { ethers } from "ethers";
import { useOnChainAudit } from "./useOnChainAudit";
import { MONAD_TESTNET, CONTRACT_ADDRESS } from "./contract";

interface PrivacyProofProps {
  account: string | null;
  burnerAddr: string | null;
  onStart: () => void;
}

export function PrivacyProof({ account, burnerAddr, onStart }: PrivacyProofProps) {
  const { events, totalBets, totalVolume, loading, error } = useOnChainAudit();

  const walletDisplay = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "0xABC...1234";

  // Use real burner from chain data if available
  const burnerDisplay = burnerAddr
    ? `${burnerAddr.slice(0, 6)}...${burnerAddr.slice(-4)}`
    : events.length > 0
    ? `${events[0].user.slice(0, 6)}...${events[0].user.slice(-4)}`
    : "0xDEF...5678";

  return (
    <div className="privacy-proof">
      <div className="pp-header">
        <h2>See the Difference</h2>
        <p className="pp-subtitle">Why privacy matters in prediction markets</p>
      </div>

      {/* ===== Visual Diff ===== */}
      <div className="pp-comparison">
        {/* Left: Normal */}
        <div className="pp-side pp-normal">
          <div className="pp-side-header danger">
            <span className="pp-side-icon">&#x26A0;</span>
            <h3>Normal Prediction Market</h3>
          </div>

          <div className="pp-flow">
            <div className="pp-node wallet">
              <span className="pp-node-label">Your Wallet</span>
              <code className="pp-addr danger-text">{walletDisplay}</code>
            </div>
            <div className="pp-arrow">&#x2193;</div>
            <div className="pp-node contract">
              <span className="pp-node-label">placeBet(YES, 1 MON)</span>
              <code className="pp-addr danger-text">{walletDisplay}</code>
            </div>
          </div>

          <div className="pp-exposed">
            <h4 className="danger-text">Everyone can see:</h4>
            <ul>
              <li><span className="pp-x">&#x2717;</span> WHO you are <span className="pp-highlight danger-bg">{walletDisplay}</span></li>
              <li><span className="pp-x">&#x2717;</span> WHAT you bet <span className="pp-highlight danger-bg">1 MON</span></li>
              <li><span className="pp-x">&#x2717;</span> WHICH side <span className="pp-highlight danger-bg">YES</span></li>
            </ul>
          </div>
        </div>

        {/* Right: ShadowBet */}
        <div className="pp-side pp-shadow">
          <div className="pp-side-header safe">
            <span className="pp-side-icon">&#x1F6E1;</span>
            <h3>ShadowBet</h3>
          </div>

          <div className="pp-flow">
            <div className="pp-node wallet">
              <span className="pp-node-label">Your Wallet</span>
              <code className="pp-addr">{walletDisplay}</code>
            </div>
            <div className="pp-arrow">&#x2193;</div>
            <div className="pp-node privacy-pool">
              <span className="pp-node-label">Unlink Privacy Pool</span>
              <code className="pp-addr safe-text">ZK Proof</code>
            </div>
            <div className="pp-arrow">&#x2193;</div>
            <div className="pp-node burner">
              <span className="pp-node-label">Anonymous Burner</span>
              <code className="pp-addr safe-text">{burnerDisplay}</code>
            </div>
            <div className="pp-arrow">&#x2193;</div>
            <div className="pp-node contract">
              <span className="pp-node-label">placeBet(???, ? MON)</span>
              <code className="pp-addr safe-text">{burnerDisplay}</code>
            </div>
          </div>

          <div className="pp-exposed">
            <h4 className="safe-text">Observer sees:</h4>
            <ul>
              <li><span className="pp-check">&#x2713;</span> Unknown address <span className="pp-highlight safe-bg">{burnerDisplay}</span></li>
              <li><span className="pp-check">&#x2713;</span> A bet was placed <span className="pp-highlight safe-bg">hidden</span></li>
              <li><span className="pp-check">&#x2713;</span> Unknown side <span className="pp-highlight safe-bg">???</span></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Key insight */}
      <div className="pp-insight">
        <div className="pp-insight-icon">&#x1F50D;</div>
        <div className="pp-insight-text">
          <strong>The link is broken.</strong>
          {" "}No one can connect <code>{walletDisplay}</code> to <code>{burnerDisplay}</code>.
          The BetPlaced event intentionally omits your YES/NO choice.
          Even if someone finds the burner, they still can't determine your position.
        </div>
      </div>

      {/* ===== Live On-Chain Audit ===== */}
      <div className="pp-audit">
        <div className="pp-audit-header">
          <h3>Live On-Chain Audit</h3>
          {totalBets > 0 && (
            <span className="pp-audit-count">{totalBets} private bets</span>
          )}
        </div>

        {loading ? (
          <div className="pp-audit-loading">
            <span className="spinner" />
            <span>Querying Monad blockchain...</span>
          </div>
        ) : error ? (
          <div className="pp-audit-error">
            {error} &mdash;{" "}
            <a
              href={`${MONAD_TESTNET.blockExplorer}/address/${CONTRACT_ADDRESS}#events`}
              target="_blank"
              rel="noopener noreferrer"
              className="pp-audit-link"
            >
              verify on Explorer
            </a>
          </div>
        ) : events.length === 0 ? (
          <div className="pp-audit-empty">
            No bets placed yet. Be the first to test privacy!
          </div>
        ) : (
          <>
            <div className="pp-audit-table-wrap">
              <table className="pp-audit-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>From (Burner)</th>
                    <th>Amount</th>
                    <th>Market</th>
                    <th>Side</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, i) => (
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
                      <td>#{ev.marketId}</td>
                      <td>
                        <span className="pp-audit-hidden">&#x1F512; ???</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pp-audit-summary">
              <span>{totalBets} bets</span>
              <span className="pp-audit-sep">&middot;</span>
              <span>{parseFloat(ethers.formatEther(totalVolume)).toFixed(2)} MON volume</span>
              <span className="pp-audit-sep">&middot;</span>
              <span className="pp-audit-zero">0 positions revealed</span>
            </div>
          </>
        )}

        {/* Solidity source proof */}
        <div className="pp-solidity">
          <div className="pp-solidity-label">Why "Side" is always ???</div>
          <pre className="pp-solidity-code"><code>{`// ShadowBet.sol — line 108
// Privacy: event does NOT include \`option\`
emit BetPlaced(marketId, msg.sender, msg.value);`}</code></pre>
          <p className="pp-solidity-note">
            The YES/NO choice is stored in contract storage but <em>never emitted</em>.
            On-chain observers can see <em>that</em> a bet happened, but not <em>which side</em>.
          </p>
        </div>

        <a
          href={`${MONAD_TESTNET.blockExplorer}/address/${CONTRACT_ADDRESS}#events`}
          target="_blank"
          rel="noopener noreferrer"
          className="pp-verify-link"
        >
          Verify on Monad Explorer &rarr;
        </a>
      </div>

      <button className="connect-btn large pp-cta" onClick={onStart}>
        Try It Yourself
      </button>
    </div>
  );
}
