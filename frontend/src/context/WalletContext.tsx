import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from "ethers";
import { useChain } from "./ChainContext";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, handler: (...args: never[]) => void) => void;
      removeListener?: (event: string, handler: (...args: never[]) => void) => void;
    };
  }
}

interface WalletContextValue {
  installed: boolean;
  address: string | null;
  chainId: number | null;
  balance: bigint | null;
  connecting: boolean;
  onExpectedNetwork: boolean;
  /** Set when connecting fails, e.g. the user rejected the request. */
  connectError: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  switchNetwork: () => Promise<boolean>;
  getSigner: (account?: string) => Promise<JsonRpcSigner>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// MetaMask has no real "disconnect" for a site. This remembers the user's choice to clear the
// connection in this app, so it is not silently restored on reload.
const DISCONNECTED_KEY = "fundflow.walletCleared";

function readCleared(): boolean {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCleared(cleared: boolean) {
  try {
    if (cleared) localStorage.setItem(DISCONNECTED_KEY, "1");
    else localStorage.removeItem(DISCONNECTED_KEY);
  } catch {
    // Storage may be blocked; the only effect is that the session restores on reload.
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { config, blockNumber, refreshTick } = useChain();
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(() => !!window.ethereum);

  const expectedChainId = config?.chainId ?? null;
  const onExpectedNetwork = chainId !== null && chainId === expectedChainId;

  // Extensions can inject after the page script runs.
  useEffect(() => {
    if (window.ethereum) return;
    const timer = setInterval(() => {
      if (window.ethereum) {
        setInstalled(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const wallet = window.ethereum;
    if (!wallet || !installed) return;

    const handleAccounts = (accounts: string[]) => {
      setAddress(!readCleared() && accounts.length ? accounts[0] : null);
    };
    const handleChain = (hexChainId: string) => setChainId(Number(hexChainId));

    // Restore an existing authorization without prompting.
    void wallet
      .request({ method: "eth_accounts" })
      .then(handleAccounts)
      .catch((error: unknown) => console.warn("[FundFlow] could not read wallet accounts", error));
    void wallet
      .request({ method: "eth_chainId" })
      .then(handleChain)
      .catch((error: unknown) => console.warn("[FundFlow] could not read wallet chain", error));

    wallet.on?.("accountsChanged", handleAccounts as never);
    wallet.on?.("chainChanged", handleChain as never);
    return () => {
      wallet.removeListener?.("accountsChanged", handleAccounts as never);
      wallet.removeListener?.("chainChanged", handleChain as never);
    };
  }, [installed]);

  // Balances come from the wallet's own provider, refreshed on each block.
  useEffect(() => {
    const wallet = window.ethereum;
    if (!wallet || !address) {
      setBalance(null);
      return;
    }
    let stale = false;
    new BrowserProvider(wallet)
      .getBalance(address)
      .then((value) => !stale && setBalance(value))
      .catch((error: unknown) => {
        console.warn("[FundFlow] could not read wallet balance", error);
        if (!stale) setBalance(null);
      });
    return () => {
      stale = true;
    };
  }, [address, chainId, blockNumber, refreshTick]);

  const connect = useCallback(async () => {
    const wallet = window.ethereum;
    if (!wallet) {
      setConnectError("MetaMask was not detected in this browser.");
      return null;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      const accounts: string[] = await wallet.request({ method: "eth_requestAccounts" });
      writeCleared(false);
      setAddress(accounts[0] ?? null);
      setChainId(Number(await wallet.request({ method: "eth_chainId" })));
      return accounts[0] ?? null;
    } catch (error) {
      const code = (error as { code?: number }).code;
      console.warn("[FundFlow] wallet connection failed", error);
      setConnectError(
        code === 4001
          ? "Connection request rejected in MetaMask."
          : code === -32002
            ? "MetaMask already has a request open. Click the MetaMask icon to respond."
            : "Could not connect to MetaMask.",
      );
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    writeCleared(true);
    setAddress(null);
    setBalance(null);
    setConnectError(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    const wallet = window.ethereum;
    if (!wallet || !config) return false;
    const hexChainId = `0x${config.chainId.toString(16)}`;
    try {
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) {
        console.warn("[FundFlow] network switch failed", error);
        return false;
      }
    }
    // 4902: the wallet does not know this chain yet, so offer to add it.
    try {
      await wallet.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChainId,
            chainName: config.networkName,
            rpcUrls: [config.rpcUrl],
            nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
      return true;
    } catch (error) {
      console.warn("[FundFlow] adding the network failed", error);
      return false;
    }
  }, [config]);

  const getSigner = useCallback(
    async (account?: string) => {
      const signerAddress = account ?? address;
      if (!window.ethereum || !signerAddress) throw new Error("Wallet not connected");
      return new BrowserProvider(window.ethereum).getSigner(signerAddress);
    },
    [address],
  );

  const value = useMemo(
    () => ({ installed, address, chainId, balance, connecting, onExpectedNetwork, connectError, connect, disconnect, switchNetwork, getSigner }),
    [installed, address, chainId, balance, connecting, onExpectedNetwork, connectError, connect, disconnect, switchNetwork, getSigner],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
