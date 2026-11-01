import { Link } from "react-router-dom";
import { ArrowRight, Check, Circle, X } from "lucide-react";
import { useChain, useChainNow } from "../context/ChainContext";
import { formatBps, formatDateTime, formatEth } from "../utils/format";
import { milestoneView, type MilestoneView } from "../utils/status";
import { CampaignState, MilestoneStatus, type Campaign, type Milestone } from "../types";
import { EvidenceReference, VoteBar } from "./VotingPanel";
import { MilestoneBadge } from "./ui";

/** Approval, claimability and transfer are different on-chain facts, so they are shown separately. */
function ReleaseSteps({ milestone }: { milestone: Milestone }) {
  const approved = milestone.status === MilestoneStatus.Approved;
  const steps = [
    { label: "Approved", done: approved },
    { label: "Claimable", done: approved },
    { label: "Transferred", done: milestone.fundsClaimed },
  ];
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {steps.map((step) => (
        <li key={step.label} className={`inline-flex items-center gap-1 ${step.done ? "text-accent" : "text-text-3"}`}>
          {step.done ? <Check className="size-3.5" /> : <Circle className="size-3" />} {step.label}
          <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
        </li>
      ))}
    </ol>
  );
}

export function MilestoneCard({ campaign, milestone }: { campaign: Campaign; milestone: Milestone }) {
  const now = useChainNow();
  const { limits } = useChain();
  const view = milestoneView(campaign, milestone, now);
  const hasVote = milestone.status !== MilestoneStatus.Pending;

  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-[13px] text-text-3 num">
          Milestone {milestone.index + 1} · {formatBps(milestone.allocationBps)}
          {campaign.state === CampaignState.Fundraising ? " of the final total" : ` · ${formatEth(milestone.amount)} ETH`}
        </div>
        <MilestoneBadge view={view} />
      </div>
      <p className="mt-2 text-[15px]">{milestone.description}</p>

      {milestone.evidence && (
        <div className="mt-3 text-sm">
          <span className="text-xs text-text-3 block mb-0.5">Evidence reference (not verified by FundFlow)</span>
          <EvidenceReference evidence={milestone.evidence} />
        </div>
      )}

      {hasVote && (
        <div className="mt-4">
          <VoteBar milestone={milestone} thresholdBps={limits?.approvalThresholdBps ?? 6000} />
          <div className="mt-3 text-xs text-text-3 num">
            {milestone.resolvedAt ? `Resolved ${formatDateTime(milestone.resolvedAt)}` : `Voting closes ${formatDateTime(milestone.votingDeadline)}`}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
        <ReleaseSteps milestone={milestone} />
        {hasVote && (
          <Link to={`/campaigns/${campaign.address}/milestones/${milestone.index}`} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline underline-offset-2">
            {view === "voting" ? "Open vote" : "Vote details"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

const NODE: Partial<Record<MilestoneView, string>> = {
  released: "bg-accent border-accent",
  "approved-claimable": "bg-accent/40 border-accent",
  voting: "bg-info border-info",
  "awaiting-resolution": "bg-warn border-warn",
  pending: "bg-warn border-warn",
  rejected: "bg-danger border-danger",
  expired: "bg-danger border-danger",
};

export function MilestoneTimeline({ campaign }: { campaign: Campaign }) {
  const now = useChainNow();
  return (
    <ol className="space-y-4">
      {campaign.milestones.map((milestone, position) => {
        const view = milestoneView(campaign, milestone, now);
        const isLast = position === campaign.milestones.length - 1;
        return (
          <li key={milestone.index} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 sm:gap-4">
            <div className="relative flex justify-center" aria-hidden>
              <span className={`relative z-10 mt-6 grid place-items-center size-3.5 rounded-full border-2 ${NODE[view] ?? "bg-surface border-line-strong"}`}>
                {(view === "rejected" || view === "expired") && <X className="size-2.5 text-page" strokeWidth={4} />}
              </span>
              {!isLast && <span className="absolute top-6 -bottom-4 w-px bg-line-strong" />}
            </div>
            <MilestoneCard campaign={campaign} milestone={milestone} />
          </li>
        );
      })}
    </ol>
  );
}
