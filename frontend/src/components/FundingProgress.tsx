import { formatEth, progressBps } from "../utils/format";
import { campaignPhase, milestoneView, type MilestoneView } from "../utils/status";
import { useChainNow } from "../context/ChainContext";
import type { Campaign } from "../types";

export function FundingProgress({ raised, target, large = false }: { raised: bigint; target: bigint; large?: boolean }) {
  const bps = progressBps(raised, target);
  const percent = Math.floor(bps / 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className={`num font-medium ${large ? "text-3xl" : "text-base"}`}>{formatEth(raised)} ETH</span>
          <span className="text-text-3 text-[13px] ml-1.5 num">of {formatEth(target)}</span>
        </div>
        <span className="num text-[13px] text-text-2">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Funding progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        className={`mt-2 rounded-full bg-hover overflow-hidden ${large ? "h-2" : "h-1.5"}`}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(bps / 100, 100)}%` }} />
      </div>
    </div>
  );
}

const SEGMENT_COLOR: Record<MilestoneView, string> = {
  upcoming: "bg-line-strong",
  pending: "bg-warn/70",
  voting: "bg-info",
  "awaiting-resolution": "bg-warn/70",
  "approved-claimable": "bg-accent/60",
  released: "bg-accent",
  rejected: "bg-danger",
  expired: "bg-danger/60",
  "never-reached": "bg-line",
};

/** FundFlow's signature mark: the raise divided into tranches, each coloured by what the contract says happened to it. */
export function TrancheRail({ campaign, tall = false }: { campaign: Campaign; tall?: boolean }) {
  const now = useChainNow();
  const phase = campaignPhase(campaign, now);
  const notStarted = phase === "fundraising" || phase === "awaiting-finalization";
  return (
    <div className={`flex gap-0.5 ${tall ? "h-2" : "h-1"}`} aria-hidden>
      {campaign.milestones.map((milestone) => (
        <div
          key={milestone.index}
          style={{ flexGrow: milestone.allocationBps, flexBasis: 0 }}
          className={`rounded-full ${notStarted ? SEGMENT_COLOR.upcoming : SEGMENT_COLOR[milestoneView(campaign, milestone, now)]}`}
        />
      ))}
    </div>
  );
}
