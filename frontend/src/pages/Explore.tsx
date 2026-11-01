import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SearchX } from "lucide-react";
import { CampaignCard } from "../components/CampaignCard";
import { Button, EmptyState, ErrorMessage, FilterChips, LinkButton, LoadingState, PageHeader } from "../components/ui";
import { useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { progressBps } from "../utils/format";
import { campaignPhase, PHASE_LABEL, type CampaignPhase } from "../utils/status";

type StatusFilter = "all" | CampaignPhase;
type Sort = "recent" | "progress";

const STATUS_FILTERS: StatusFilter[] = ["all", "fundraising", "awaiting-finalization", "milestones", "completed", "failed", "cancelled"];

export function Explore() {
  const { campaigns, loading, error } = useData();
  const now = useChainNow();
  const [params, setParams] = useSearchParams();

  const query = params.get("q") ?? "";
  const status = (params.get("status") ?? "all") as StatusFilter;
  const sort = (params.get("sort") ?? "recent") as Sort;

  const update = (key: string, value: string, fallback: string) => {
    setParams(
      (current) => {
        if (value === fallback) current.delete(key);
        else current.set(key, value);
        return current;
      },
      { replace: true },
    );
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: campaigns.length };
    for (const campaign of campaigns) {
      const phase = campaignPhase(campaign, now);
      result[phase] = (result[phase] ?? 0) + 1;
    }
    return result;
  }, [campaigns, now]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = campaigns.filter(
      (c) =>
        (status === "all" || campaignPhase(c, now) === status) &&
        (!text || c.title.toLowerCase().includes(text) || c.description.toLowerCase().includes(text)),
    );
    return filtered.sort((a, b) =>
      sort === "progress" ? progressBps(b.totalRaised, b.fundingTarget) - progressBps(a.totalRaised, a.fundingTarget) : b.createdAt - a.createdAt,
    );
  }, [campaigns, query, status, sort, now]);

  return (
    <div className="page">
      <PageHeader eyebrow="Explore" title="Campaigns" action={<LinkButton to="/create">Start a campaign</LinkButton>}>
        Every campaign below is read directly from its smart contract on the local chain.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-3" aria-hidden />
          <input
            type="search"
            aria-label="Search campaigns by title or description"
            placeholder="Search by title or description"
            value={query}
            onChange={(event) => update("q", event.target.value, "")}
            className="field pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="campaign-sort" className="text-[13px] text-text-3">Sort</label>
          <select id="campaign-sort" value={sort} onChange={(event) => update("sort", event.target.value, "recent")} className="field w-auto pr-8">
            <option value="recent">Recently created</option>
            <option value="progress">Funding progress</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <FilterChips
          label="Filter by status"
          value={status}
          onChange={(value) => update("status", value, "all")}
          options={STATUS_FILTERS.map((value) => ({ value, label: value === "all" ? "All" : PHASE_LABEL[value], count: counts[value] ?? 0 }))}
        />
      </div>

      <div className="mt-8">
        {error && <div className="mb-6"><ErrorMessage title="Could not load campaigns">{error}</ErrorMessage></div>}
        {loading ? (
          <LoadingState />
        ) : campaigns.length === 0 ? (
          <EmptyState title="No campaigns on this chain yet" action={<LinkButton to="/create">Create the first campaign</LinkButton>}>
            Campaigns are stored on the local blockchain. To load labelled sample campaigns, run <code className="font-mono">npm run seed</code>.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No campaigns match"
            action={
              <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            }
          >
            Try a different search or status.
          </EmptyState>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((campaign) => (
              <CampaignCard key={campaign.address} campaign={campaign} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
