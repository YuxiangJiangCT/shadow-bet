interface HowItWorksProps {
  onStart: () => void;
}

export function HowItWorks({ onStart }: HowItWorksProps) {
  return (
    <div className="how-it-works">
      <div className="hiw-header">
        <h2>How ShadowBet Works</h2>
        <p className="hiw-subtitle">Three steps to completely private betting on Monad</p>
      </div>

      <div className="hiw-steps">
        {/* Step 1 */}
        <div className="hiw-step">
          <div className="hiw-icon shield-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="hiw-step-num">1</div>
          <h3>Shield</h3>
          <p>Deposit MON into the Unlink privacy pool. Your funds enter a ZK-proof mixing pool, breaking the on-chain link to your wallet.</p>
          <div className="hiw-detail">
            <code>Public Wallet → Privacy Pool</code>
          </div>
        </div>

        {/* Step 2 */}
        <div className="hiw-step">
          <div className="hiw-icon bet-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="hiw-step-num">2</div>
          <h3>Private Bet</h3>
          <p>A fresh burner address is funded from the pool and places your bet. The contract never sees your real identity.</p>
          <div className="hiw-detail">
            <code>Burner EOA → placeBet()</code>
          </div>
        </div>

        {/* Step 3 */}
        <div className="hiw-step">
          <div className="hiw-icon claim-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="hiw-step-num">3</div>
          <h3>Claim & Reshield</h3>
          <p>Win? Your burner claims the payout and sweeps funds back into the privacy pool. Withdraw to your public wallet whenever you're ready.</p>
          <div className="hiw-detail">
            <code>Winnings → Pool → Public Wallet</code>
          </div>
        </div>
      </div>

      {/* Privacy highlights */}
      <div className="hiw-privacy">
        <h3>What stays private</h3>
        <div className="hiw-privacy-grid">
          <div className="hiw-privacy-item">
            <span className="hiw-check">&#x2713;</span>
            <span>Your identity — bets come from anonymous burner addresses</span>
          </div>
          <div className="hiw-privacy-item">
            <span className="hiw-check">&#x2713;</span>
            <span>Your position — YES/NO choice never appears in events</span>
          </div>
          <div className="hiw-privacy-item">
            <span className="hiw-check">&#x2713;</span>
            <span>Your bet amount — shielded through the ZK privacy pool</span>
          </div>
        </div>
      </div>

      <button className="connect-btn large hiw-cta" onClick={onStart}>
        Start Betting
      </button>
    </div>
  );
}
