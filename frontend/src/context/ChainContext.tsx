import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JsonRpcProvider } from "ethers";
import { loadConfig, type AppConfig } from "../services/config";
import { createReadProvider } from "../services/contracts";
import { fetchLimits } from "../services/campaigns";
import type { Limits } from "../types";

export type ChainStatus = "connecting" | "ready" | "offline" | "not-deployed";

interface ChainContextValue {
  config: AppConfig | null;
  provider: JsonRpcProvider | null;
  status: ChainStatus;
  blockNumber: number;
  /** Increments when the local chain has been reset, so cached chain data can be dropped. */
  epoch: number;
  /** Chain time minus wall-clock time, in seconds. Differs when the local clock has been advanced. */
  clockOffset: number;
  limits: Limits | null;
  /** Re-read chain state right away, for example after a transaction confirms. */
  refresh: () => void;
  /** Bumped by refresh() even if the block number looks unchanged. */
  refreshTick: number;
}

const ChainContext = createContext<ChainContextValue | null>(null);

const POLL_MS = 3000;

export function ChainProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState<JsonRpcProvider | null>(null);
  const [status, setStatus] = useState<ChainStatus>("connecting");
  const [blockNumber, setBlockNumber] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const state = useRef({ config: null as AppConfig | null, provider: null as JsonRpcProvider | null, lastBlock: -1, ready: false });

  const poll = useCallback(async () => {
    const current = state.current;
    try {
      // The deployment file may appear or change while the app is open, e.g. after a redeploy.
      const next = await loadConfig();
      if (!current.provider || next.rpcUrl !== current.config?.rpcUrl || next.chainId !== current.config?.chainId) {
        current.provider = createReadProvider(next.rpcUrl, next.chainId);
        setProvider(current.provider);
      }
      if (next.factoryAddress !== current.config?.factoryAddress || next.deploymentBlock !== current.config?.deploymentBlock) {
        current.config = next;
        current.ready = false;
        setConfig(next);
        setEpoch((e) => e + 1);
      }
      const rpc = current.provider!;
      const latest = await rpc.getBlockNumber();

      if (latest < current.lastBlock) {
        // Block number went backwards: the chain was restarted and everything on it is gone.
        current.ready = false;
        setEpoch((e) => e + 1);
      }
      current.lastBlock = latest;
      setBlockNumber(latest);

      if (!current.ready) {
        const factory = current.config!.factoryAddress;
        const code = factory ? await rpc.getCode(factory) : "0x";
        if (code === "0x") {
          setLimits(null);
          setStatus("not-deployed");
          return;
        }
        setLimits(await fetchLimits(factory!, rpc));
        current.ready = true;
        setStatus("ready");
      }

      // The pending block's timestamp is what the next transaction will see. Using it instead of the
      // browser clock keeps countdowns correct after `advance-time`, and between blocks.
      const pending = await rpc.send("eth_getBlockByNumber", ["pending", false]);
      if (pending?.timestamp) setClockOffset(Number(pending.timestamp) - Date.now() / 1000);
    } catch (error) {
      console.warn("[FundFlow] chain poll failed", error);
      current.ready = false;
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
    void poll();
  }, [poll]);

  const value = useMemo(
    () => ({ config, provider, status, blockNumber, epoch, clockOffset, limits, refresh, refreshTick }),
    [config, provider, status, blockNumber, epoch, clockOffset, limits, refresh, refreshTick],
  );
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

export function useChain() {
  const value = useContext(ChainContext);
  if (!value) throw new Error("useChain must be used inside ChainProvider");
  return value;
}

/** Current chain time in seconds, ticking once a second. */
export function useChainNow(): number {
  const { clockOffset } = useChain();
  const [wallClock, setWallClock] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setWallClock(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.floor(wallClock + clockOffset);
}
