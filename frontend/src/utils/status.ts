import { CampaignState, MilestoneStatus, type Campaign, type Limits, type Milestone } from "../types";

// These helpers decide what to SHOW based on values read from the contract. The contract remains
// the only authority: if a helper were ever wrong, the transaction would simply revert.

export type CampaignPhase = "fundraising" | "awaiting-finalization" | "milestones" | "failed" | "cancelled" | "completed";

export function campaignPhase(campaign: Campaign, now: number): CampaignPhase {
  switch (campaign.state) {
    case CampaignState.Fundraising:
      return now < campaign.deadline ? "fundraising" : "awaiting-finalization";
    case CampaignState.MilestonePhase:
      return "milestones";
    case CampaignState.Failed:
      return "failed";
    case CampaignState.Cancelled:
      return "cancelled";
    default:
      return "completed";
  }
}

export const PHASE_LABEL: Record<CampaignPhase, string> = {
  fundraising: "Fundraising",
  "awaiting-finalization": "Awaiting finalization",
  milestones: "Milestone phase",
  failed: "Failed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export type MilestoneView =
  | "upcoming"
  | "pending"
  | "voting"
  | "awaiting-resolution"
  | "approved-claimable"
  | "released"
  | "rejected"
  | "expired"
  | "never-reached";

export function eligibleWeight(campaign: Campaign): bigint {
  return campaign.totalRaised - campaign.creatorContribution;
}

export function canResolve(campaign: Campaign, milestone: Milestone, now: number): boolean {
  if (milestone.status !== MilestoneStatus.Voting) return false;
  const participating = milestone.approveWeight + milestone.rejectWeight;
  return now >= milestone.votingDeadline || (participating > 0n && participating === eligibleWeight(campaign));
}

export function milestoneView(campaign: Campaign, milestone: Milestone, now: number): MilestoneView {
  switch (milestone.status) {
    case MilestoneStatus.Approved:
      return milestone.fundsClaimed ? "released" : "approved-claimable";
    case MilestoneStatus.Rejected:
      return "rejected";
    case MilestoneStatus.Expired:
      return "expired";
    case MilestoneStatus.Voting:
      return canResolve(campaign, milestone, now) ? "awaiting-resolution" : "voting";
    default:
      if (campaign.state === CampaignState.Cancelled || campaign.state === CampaignState.Failed) return "never-reached";
      return campaign.state === CampaignState.MilestonePhase && milestone.index === campaign.currentMilestone ? "pending" : "upcoming";
  }
}

export const MILESTONE_LABEL: Record<MilestoneView, string> = {
  upcoming: "Upcoming",
  pending: "Awaiting evidence",
  voting: "Voting open",
  "awaiting-resolution": "Vote ready to resolve",
  "approved-claimable": "Approved, funds claimable",
  released: "Funds released",
  rejected: "Rejected",
  expired: "Expired without votes",
  "never-reached": "Not reached",
};

/** The milestone currently being decided, if the campaign is in its milestone phase. */
export function activeMilestone(campaign: Campaign): Milestone | null {
  return campaign.state === CampaignState.MilestonePhase ? campaign.milestones[campaign.currentMilestone] : null;
}

export type CancelEligibility = { anyone: boolean; creator: boolean; reason: string } | null;

/** Mirrors the conditions in cancelCampaign() so the button only appears when it can succeed. */
export function cancelEligibility(campaign: Campaign, limits: Limits | null, now: number): CancelEligibility {
  const milestone = activeMilestone(campaign);
  if (!milestone) return null;
  if (milestone.status === MilestoneStatus.Rejected) {
    return { anyone: true, creator: true, reason: "Contributors rejected the current milestone." };
  }
  if (milestone.status === MilestoneStatus.Expired) {
    return { anyone: true, creator: true, reason: "The vote on the current milestone ended with no votes." };
  }
  if (milestone.status === MilestoneStatus.Pending) {
    const windowMissed = !!limits && now >= campaign.currentMilestoneStartedAt + limits.submissionWindow;
    if (windowMissed) return { anyone: true, creator: true, reason: "The creator missed the evidence submission window." };
    return { anyone: false, creator: true, reason: "The creator may give up while the current milestone is pending." };
  }
  return null;
}

export function claimableMilestones(campaign: Campaign): Milestone[] {
  return campaign.milestones.filter((m) => m.status === MilestoneStatus.Approved && !m.fundsClaimed);
}
