import { campaignInterface } from "../services/contracts";

/** User-facing text for each custom error in FundFlowCampaign.sol. */
const CONTRACT_ERRORS: Record<string, string> = {
  ZeroFundingTarget: "The funding target must be greater than zero.",
  InvalidDeadline: "The deadline must be in the future and within one year.",
  EmptyTitle: "The campaign needs a title.",
  EmptyDescription: "The campaign needs a description.",
  TextTooLong: "One of the text fields is longer than the contract allows.",
  InvalidVotingPeriod: "The voting period is outside the allowed range.",
  InvalidMilestoneCount: "The number of milestones is outside the allowed range.",
  MilestoneArrayMismatch: "Each milestone needs both a description and an allocation.",
  EmptyMilestoneDescription: "Every milestone needs a description.",
  ZeroMilestoneAllocation: "Every milestone allocation must be greater than zero.",
  AllocationsMustTotal100Percent: "Milestone allocations must add up to exactly 100%.",
  NotCreator: "Only the campaign creator can do this.",
  NotAcceptingContributions: "This campaign has been finalized and no longer accepts contributions.",
  ZeroContribution: "Enter an amount greater than zero.",
  FundraisingEnded: "The fundraising deadline has passed.",
  AlreadyFinalized: "This campaign has already been finalized.",
  DeadlineNotReached: "The fundraising deadline has not passed yet.",
  MilestonePhaseNotActive: "This campaign is not in its milestone phase.",
  InvalidMilestone: "That milestone does not exist.",
  MilestoneAlreadySubmitted: "Evidence for this milestone was already submitted.",
  MilestoneOutOfOrder: "Milestones must be completed in order.",
  SubmissionWindowClosed: "The window for submitting this milestone has closed.",
  EmptyEvidence: "Enter an evidence reference.",
  VotingNotOpen: "Voting is not open for this milestone.",
  VotingEnded: "The voting period has ended.",
  CreatorCannotVote: "The campaign creator cannot vote on their own milestones.",
  NotAContributor: "This wallet has no recorded contribution to this campaign.",
  AlreadyVoted: "This wallet has already voted on this milestone.",
  VotingStillOpen: "The voting period is still open.",
  MilestoneNotApproved: "This milestone has not been approved, so its funds are not claimable.",
  FundsAlreadyClaimed: "These funds have already been claimed.",
  CancellationNotAllowed: "This campaign cannot be cancelled in its current state.",
  RefundNotAvailable: "Refunds are not available for this campaign.",
  RefundAlreadyClaimed: "This wallet has already claimed its refund.",
  InsufficientContractBalance: "The campaign contract does not hold enough ETH for this payment.",
  TransferFailed: "The ETH transfer to the receiving wallet failed. Nothing was changed.",
};

type LooseError = {
  code?: string | number;
  message?: string;
  shortMessage?: string;
  data?: unknown;
  info?: { error?: LooseError };
  error?: LooseError;
  revert?: { name?: string };
};

function findRevertData(error: LooseError | undefined, depth = 0): string | null {
  if (!error || depth > 5) return null;
  if (typeof error.data === "string" && error.data.startsWith("0x") && error.data.length >= 10) return error.data;
  if (error.data && typeof error.data === "object") {
    const nested = findRevertData(error.data as LooseError, depth + 1);
    if (nested) return nested;
  }
  return findRevertData(error.info?.error, depth + 1) ?? findRevertData(error.error, depth + 1);
}

function contractErrorName(error: LooseError): string | null {
  const data = findRevertData(error);
  if (data) {
    try {
      const parsed = campaignInterface.parseError(data);
      if (parsed) return parsed.name;
    } catch {
      // Not one of our errors; fall through to the message text.
    }
  }
  if (error.revert?.name) return error.revert.name;
  // Hardhat also names the error in its message text.
  const text = `${error.message ?? ""} ${error.info?.error?.message ?? ""}`;
  return /custom error '(\w+)/.exec(text)?.[1] ?? null;
}

function hasCode(error: LooseError | undefined, code: string | number, depth = 0): boolean {
  if (!error || depth > 5) return false;
  return error.code === code || hasCode(error.info?.error, code, depth + 1) || hasCode(error.error, code, depth + 1);
}

/** Converts a wallet or contract failure into one readable sentence. Raw details go to the console. */
export function describeError(raw: unknown): string {
  const error = (raw ?? {}) as LooseError;
  console.error("[FundFlow] transaction error", raw);

  if (hasCode(error, "ACTION_REJECTED") || hasCode(error, 4001)) return "You rejected the request in your wallet. Nothing was sent.";

  const name = contractErrorName(error);
  if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];

  const text = `${error.message ?? ""} ${error.info?.error?.message ?? ""}`.toLowerCase();
  if (hasCode(error, "INSUFFICIENT_FUNDS") || text.includes("insufficient funds") || text.includes("doesn't have enough funds")) {
    return "This wallet does not have enough test ETH for this amount plus gas.";
  }
  if (text.includes("nonce")) {
    return "The wallet's transaction history is out of step with the local chain, usually after a chain reset. In MetaMask, open Settings > Advanced and clear activity data, then try again.";
  }
  if (hasCode(error, -32002)) return "Your wallet already has a request waiting. Open MetaMask to respond to it.";
  if (hasCode(error, "CALL_EXCEPTION")) return "The contract rejected this transaction. Its current state may have changed; refresh and check again.";
  if (hasCode(error, "NETWORK_ERROR") || text.includes("failed to fetch")) return "Could not reach the local blockchain. Check that `npm run chain` is still running.";
  // MetaMask's generic code, usually because it cannot reach the RPC URL saved for this network.
  if (hasCode(error, -32603)) return "MetaMask could not process this request. Check that its Hardhat Local network uses http://127.0.0.1:8545 and that `npm run chain` is running.";
  const reason = error.shortMessage ?? error.message;
  return reason ? `The transaction could not be completed: ${reason}.` : "The transaction could not be completed. See the browser console for details.";
}
