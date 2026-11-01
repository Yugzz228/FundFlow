import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchAllCampaigns } from "../services/campaigns";
import { EventReader } from "../services/events";
import { useChain } from "./ChainContext";
import type { Activity, Campaign } from "../types";

interface DataContextValue {
  campaigns: Campaign[];
  /** Every contract event from this deployment, newest first. */
  activity: Activity[];
  /** True until the first read has finished. */
  loading: boolean;
  error: string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Keeps campaign state and contract events in step with the chain; re-reads on every new block. */
export function DataProvider({ children }: { children: ReactNode }) {
  const { config, provider, status, blockNumber, epoch, refreshTick } = useChain();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef({ nextBlock: 0, reader: null as EventReader | null, items: [] as Activity[], knownEpoch: -1, runId: 0 });

  useEffect(() => {
    if (status === "not-deployed" || status === "offline") {
      setCampaigns([]);
      setActivity([]);
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "ready" || !provider || !config?.factoryAddress) return;
    const state = cursor.current;
    const runId = ++state.runId;
    const factory = config.factoryAddress;

    if (state.knownEpoch !== epoch) {
      state.knownEpoch = epoch;
      state.nextBlock = config.deploymentBlock;
      state.reader = new EventReader(provider);
      state.items = [];
    }

    (async () => {
      try {
        const latest = await provider.getBlockNumber();
        const next = await fetchAllCampaigns(factory, provider);
        const fresh = await state.reader!.read(factory, next.map((c) => c.address), state.nextBlock, latest);
        if (runId !== state.runId) return; // A newer read has started; drop this one.

        state.nextBlock = latest + 1;
        state.items = [...state.items, ...fresh];
        setCampaigns(next);
        setActivity([...state.items].reverse());
        setError(null);
      } catch (err) {
        console.error("[FundFlow] failed to read chain data", err);
        if (runId === state.runId) setError("Could not read campaign data from the local chain.");
      } finally {
        if (runId === state.runId) setLoading(false);
      }
    })();
  }, [status, provider, config, blockNumber, epoch, refreshTick]);

  const value = useMemo(() => ({ campaigns, activity, loading, error }), [campaigns, activity, loading, error]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside DataProvider");
  return value;
}
