interface PrivacyProofProps {
  account: string | null;
  burnerAddr: string | null;
  onStart: () => void;
}

export function PrivacyProof({ account, burnerAddr, onStart }: PrivacyProofProps) {
  const walletDisplay = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "0xABC...1234";
  const burnerDisplay = burnerAddr
    ? `${burnerAddr.slice(0, 6)}...${burnerAddr.slice(-4)}`
    : "0xDEF...5678";

  return (
    <div className="privacy-proof">
      <div className="pp-header">
        <h2>See the Difference</h2>
        <p className="pp-subtitle">Why privacy matters in prediction markets</p>
      </div>

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

      <button className="connect-btn large pp-cta" onClick={onStart}>
        Try It Yourself
      </button>
    </div>
  );
}
