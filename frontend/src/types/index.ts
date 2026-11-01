/** Mirrors FundFlowCampaign.CampaignState. */
export enum CampaignState {
  Fundraising = 0,
  MilestonePhase = 1,
  Failed = 2,
  Cancelled = 3,
  Completed = 4,
}

/** Mirrors FundFlowCampaign.MilestoneStatus. */
export enum MilestoneStatus {
  Pending = 0,
  Voting = 1,
  Approved = 2,
  Rejected = 3,
  Expired = 4,
}

/** Mirrors FundFlowCampaign.CancelReason. */
export enum CancelReason {
  MilestoneRejected = 0,
  MilestoneExpired = 1,
  SubmissionWindowMissed = 2,
  CreatorCancelled = 3,
}

export interface Milestone {
  index: number;
  description: string;
  evidence: string;
  allocationBps: number;
  amount: bigint;
  status: MilestoneStatus;
  fundsClaimed: boolean;
  submittedAt: number;
  votingDeadline: number;
  resolvedAt: number;
  approveWeight: bigint;
  rejectWeight: bigint;
}

export interface Campaign {
  address: string;
  creator: string;
  title: string;
  description: string;
  imageUrl: string;
  fundingTarget: bigint;
  deadline: number;
  votingPeriod: number;
  state: CampaignState;
  totalRaised: bigint;
  contributorCount: number;
  creatorContribution: bigint;
  currentMilestone: number;
  currentMilestoneStartedAt: number;
  totalApproved: bigint;
  totalReleased: bigint;
  refundPool: bigint;
  totalRefunded: bigint;
  refundsClaimed: number;
  createdAt: number;
  milestones: Milestone[];
}

/** A wallet's on-chain position in one campaign. */
export interface Position {
  campaign: string;
  contribution: bigint;
  refundClaimed: boolean;
  refundPaid: bigint;
  refundable: bigint;
  /** Vote on the current milestone: 0 none, 1 approve, 2 reject. */
  currentVote: number;
}

export type ActivityType =
  | "CampaignCreated"
  | "ContributionReceived"
  | "CampaignFinalized"
  | "MilestoneEvidenceSubmitted"
  | "VoteCast"
  | "MilestoneApproved"
  | "MilestoneRejected"
  | "MilestoneExpired"
  | "MilestoneFundsClaimed"
  | "CampaignCompleted"
  | "CampaignCancelled"
  | "RefundClaimed";

/** One contract event, normalized for display. Only mined, successful transactions emit events. */
export interface Activity {
  id: string;
  type: ActivityType;
  campaign: string;
  /** The wallet the event is about, or the transaction sender if the event names nobody. */
  wallet: string;
  amount: bigint | null;
  milestoneIndex: number | null;
  detail: string | null;
  /** Vote direction, for VoteCast only. */
  approve: boolean | null;
  /** CampaignFinalized outcome, for that event only. */
  successful: boolean | null;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number | null;
}

export interface Limits {
  maxMilestones: number;
  bpsDenominator: number;
  approvalThresholdBps: number;
  minVotingPeriod: number;
  maxVotingPeriod: number;
  maxFundraisingDuration: number;
  submissionWindow: number;
  maxTitleLength: number;
  maxDescriptionLength: number;
  maxUrlLength: number;
  maxMilestoneTextLength: number;
}

export interface NewCampaignInput {
  title: string;
  description: string;
  imageUrl: string;
  fundingTarget: bigint;
  deadline: number;
  votingPeriod: number;
  milestoneDescriptions: string[];
  milestoneAllocationsBps: number[];
}
