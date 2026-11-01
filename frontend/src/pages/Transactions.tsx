import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { describeActivity, TransactionHistory } from "../components/TransactionHistory";
import { FilterChips, LoadingState, Notice, PageHeader } from "../components/ui";
import { useData } from "../context/DataContext";
import { useWallet } from "../context/WalletContext";
import { sameAddress } from "../utils/format";
import type { Activity } from "../types";

type Group = "all" | "funding" | "governance" | "release" | "refund";

const GROUPS: Record<Group, { label: string; types: Activity["type"][] | null }> = {
  all: { label: "All", types: null },
  funding: { label: "Funding", types: ["CampaignCreated", "ContributionReceived", "CampaignFinalized"] },
  governance: { label: "Governance", types: ["MilestoneEvidenceSubmitted", "VoteCast", "MilestoneApproved", "MilestoneRejected", "MilestoneExpired"] },
  release: { label: "Fund release", types: ["MilestoneFundsClaimed", "CampaignCompleted"] },
  refund: { label: "Cancellation and refunds", types: ["CampaignCancelled", "RefundClaimed"] },
};

export function Transactions() {
  const { activity, loading } = useData();
  const { address } = useWallet();
  const [group, setGroup] = useState<Group>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const text = query.trim().toLowerCase();
    const types = GROUPS[group].types;
    return activity.filter(
      (item) =>
        (!types || types.includes(item.type)) &&
        (!onlyMine || sameAddress(item.wallet, address)) &&
        (!text || item.txHash.toLowerCase().includes(text) || item.wallet.toLowerCase().includes(text) || item.campaign.toLowerCase().includes(text) || describeActivity(item).label.toLowerCase().includes(text)),
    );
  }, [activity, group, onlyMine, query, address]);

  return (
    <div className="page">
      <PageHeader eyebrow="History" title="Transaction history">
        Every row is a contract event read from the local chain.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-3" aria-hidden />
          <input type="search" aria-label="Search by hash, wallet, campaign or type" placeholder="Search by hash, wallet, campaign or type" value={query} onChange={(e) => setQuery(e.target.value)} className="field pl-9" />
        </div>
        {address && (
          <label className="flex items-center gap-2 text-sm text-text-2">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="accent-[var(--color-accent)] size-4" />
            Only my wallet
          </label>
        )}
      </div>
      <FilterChips label="Filter by type" value={group} onChange={setGroup} options={(Object.keys(GROUPS) as Group[]).map((value) => ({ value, label: GROUPS[value].label }))} />

      <div className="mt-6">{loading ? <LoadingState /> : <TransactionHistory items={items} showCampaign emptyTitle={activity.length ? "No transactions match" : "No on-chain activity yet"} />}</div>

      <div className="mt-6">
        <Notice>
          A reverted transaction emits no events, so failed attempts are not listed here. Hashes are copy-only because a local Hardhat chain has no block explorer. Timestamps are chain time, which runs ahead of your clock if the local chain has been advanced.
        </Notice>
      </div>
    </div>
  );
}
