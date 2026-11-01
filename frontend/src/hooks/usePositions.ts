import { useEffect, useState } from "react";
import { fetchPositions } from "../services/campaigns";
import { useChain } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import type { Position } from "../types";

/** On-chain positions of one wallet across all campaigns, re-read whenever campaign data changes. */
export function usePositions(wallet: string | null) {
  const { provider } = useChain();
  const { campaigns } = useData();
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const [loading, setLoading] = useState(!!wallet);

  useEffect(() => {
    if (!wallet || !provider) {
      setPositions(new Map());
      setLoading(false);
      return;
    }
    let stale = false;
    fetchPositions(campaigns, wallet, provider)
      .then((next) => {
        if (!stale) setPositions(next);
      })
      .catch((error: unknown) => console.error("[FundFlow] failed to read wallet positions", error))
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [wallet, provider, campaigns]);

  return { positions, loading };
}
