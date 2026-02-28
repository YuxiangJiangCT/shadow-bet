import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { BetWidget } from "./BetWidget";
import { MONAD_TESTNET } from "./contract";
import "./App.css";

declare global {
  interface Window {
    ethereum?: any;
  }
}

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);

  const isMetaMaskInstalled = typeof window.ethereum !== "undefined";

  const switchToMonad = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_TESTNET.chainIdHex }],
      });
    } catch (switchError: any) {
      // Chain not added yet — add it
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
        <div className="nav-logo">
          <img src="/logo.svg" alt="ShadowBet" className="nav-logo-img" />
          <span className="logo-text">ShadowBet</span>
          <span className="chain-badge">MONAD</span>
          <span className="privacy-badge">UNLINK</span>
        </div>
        <div className="nav-buttons">
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
        {!account ? (
          <div className="bet-widget">
            <div className="widget-header">
              <h2>SHADOWBET</h2>
              <span className="privacy-badge">PRIVACY</span>
            </div>
            <div className="connect-prompt">
              <img src="/logo.svg" alt="ShadowBet" className="hero-logo" />
              <h3>Private Prediction Markets</h3>
              <p>Your bets. Your secret. On Monad.</p>
              <button className="connect-btn large" onClick={connectWallet}>
                {isMetaMaskInstalled ? "Connect Wallet" : "Install MetaMask"}
              </button>
              <p className="hint">
                Bet on outcomes without revealing your position on-chain
              </p>
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
          <BetWidget provider={provider!} account={account} />
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
