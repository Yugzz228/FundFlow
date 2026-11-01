import { useEffect, useState } from "react";
import { Check, ExternalLink, Info, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { useChain, useChainNow } from "../context/ChainContext";
import { useTransactions } from "../context/TransactionContext";
import { useWallet } from "../context/WalletContext";
import { campaignContract } from "../services/contracts";
import { resolveMilestone, vote } from "../services/transactions";
import { formatBps, formatDateTime, formatDuration, formatEth, sameAddress } from "../utils/format";
import { canResolve, eligibleWeight, milestoneView } from "../utils/status";
import { MilestoneStatus, type Campaign, type Milestone } from "../types";
import { Address } from "./Address";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button, MilestoneBadge, Notice } from "./ui";

export function EvidenceReference({ evidence }: { evidence: string }) {
  // Only http(s) references become links; anything else, such as a content ID, stays plain text.
  if (/^https?:\/\//i.test(evidence)) {
    return (
      <a href={evidence} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-accent hover:underline underline-offset-2 break-all">
        {evidence} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      </a>
    );
  }
  return <span className="font-mono text-[13px] break-all">{evidence}</span>;
}

export const EVIDENCE_DISCLAIMER = "FundFlow records this reference on-chain but does not verify it. The content behind it can change, and its truth is for contributors to judge.";

/** Split of participating weight, with the approval threshold marked. */
export function VoteBar({ milestone, thresholdBps }: { milestone: Milestone; thresholdBps: number }) {
  const participating = milestone.approveWeight + milestone.rejectWeight;
  const approveBps = participating > 0n ? Number((milestone.approveWeight * 10_000n) / participating) : 0;
  const rejectBps = participating > 0n ? 10_000 - approveBps : 0;
  return (
    <div>
      <div className="relative h-3">
        <div className="absolute inset-0 flex gap-0.5 rounded-full overflow-hidden bg-hover">
          {approveBps > 0 && <div className="bg-accent" style={{ width: `${approveBps / 100}%` }} />}
          {rejectBps > 0 && <div className="bg-danger flex-1" />}
        </div>
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-text" style={{ left: `${thresholdBps / 100}%` }} aria-hidden />
      </div>
      <div className="relative h-5 mt-1 text-xs text-text-3">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${thresholdBps / 100}%` }}>
          {formatBps(thresholdBps)} needed
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 mt-2 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-text-3 text-xs"><ThumbsUp className="size-3" /> Approve</dt>
          <dd className="num mt-0.5">{formatEth(milestone.approveWeight)} ETH <span className="text-text-3">({formatBps(approveBps)})</span></dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-text-3 text-xs"><ThumbsDown className="size-3" /> Reject</dt>
          <dd className="num mt-0.5">{formatEth(milestone.rejectWeight)} ETH <span className="text-text-3">({formatBps(rejectBps)})</span></dd>
        </div>
        <div>
          <dt className="text-text-3 text-xs">Participating</dt>
          <dd className="num mt-0.5">{formatEth(participating)} ETH</dd>
        </div>
      </dl>
    </div>
  );
}

export function VotingPanel({ campaign, milestone }: { campaign: Campaign; milestone: Milestone }) {
  const now = useChainNow();
  const { provider, limits, blockNumber, refreshTick } = useChain();
  const { address } = useWallet();
  const { send, busy } = useTransactions();
  const [pendingChoice, setPendingChoice] = useState<boolean | null>(null);
  const [contribution, setContribution] = useState<bigint | null>(null);
  const [existingVote, setExistingVote] = useState(0);

  useEffect(() => {
    if (!provider || !address) {
      setContribution(null);
      setExistingVote(0);
      return;
    }
    let stale = false;
    const contract = campaignContract(campaign.address, provider);
    Promise.all([contract.contributions(address), contract.voteOf(milestone.index, address)])
      .then(([amount, previous]) => {
        if (stale) return;
        setContribution(amount);
        setExistingVote(Number(previous));
      })
      .catch((error: unknown) => console.error("[FundFlow] failed to read voter state", error));
    return () => {
      stale = true;
    };
  }, [provider, address, campaign.address, milestone.index, blockNumber, refreshTick]);

  const view = milestoneView(campaign, milestone, now);
  const threshold = limits?.approvalThresholdBps ?? 6000;
  const isCreator = sameAddress(address, campaign.creator);
  const voteOpen = milestone.status === MilestoneStatus.Voting && now < milestone.votingDeadline;
  const eligible = !!address && !isCreator && !!contribution && contribution > 0n && existingVote === 0 && voteOpen;

  let eligibility: string;
  if (!address) eligibility = "Connect a wallet to check whether you can vote.";
  else if (isCreator) eligibility = "This wallet created the campaign. The contract excludes creators from voting on their own milestones.";
  else if (contribution === null) eligibility = "Checking this wallet's contribution…";
  else if (contribution === 0n) eligibility = "This wallet has no recorded contribution, so it cannot vote here.";
  else if (existingVote === 1) eligibility = "This wallet has already voted to approve. Votes cannot be changed.";
  else if (existingVote === 2) eligibility = "This wallet has already voted to reject. Votes cannot be changed.";
  else if (!voteOpen) eligibility = `This wallet contributed ${formatEth(contribution)} ETH, but voting is closed.`;
  else eligibility = `This wallet is eligible to vote with a weight of ${formatEth(contribution)} ETH.`;

  const castVote = (approve: boolean) => {
    void send(`Vote to ${approve ? "approve" : "reject"} milestone ${milestone.index + 1}`, (signer) => vote(signer, campaign.address, milestone.index, approve));
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">Milestone {milestone.index + 1} of {campaign.milestones.length}</div>
          <MilestoneBadge view={view} />
        </div>
        <h2 className="display text-3xl mt-2">{milestone.description}</h2>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-text-3">Creator</dt>
            <dd className="mt-0.5"><Address address={campaign.creator} profile copy /></dd>
          </div>
          <div>
            <dt className="text-xs text-text-3">Allocation</dt>
            <dd className="mt-0.5 num">{formatBps(milestone.allocationBps)} · {formatEth(milestone.amount)} ETH</dd>
          </div>
          <div>
            <dt className="text-xs text-text-3">Evidence submitted</dt>
            <dd className="mt-0.5 num">{milestone.submittedAt ? formatDateTime(milestone.submittedAt) : "Not yet"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-3">Voting deadline</dt>
            <dd className="mt-0.5 num">
              {milestone.votingDeadline ? formatDateTime(milestone.votingDeadline) : `${formatDuration(campaign.votingPeriod)} after submission`}
              {voteOpen && <span className="text-text-3"> ({formatDuration(milestone.votingDeadline - now)} left)</span>}
            </dd>
          </div>
        </dl>

        {milestone.evidence && (
          <div className="mt-5 pt-5 border-t border-line">
            <div className="text-xs text-text-3 mb-1">Evidence reference</div>
            <EvidenceReference evidence={milestone.evidence} />
            <div className="mt-3">
              <Notice icon={ShieldAlert}>{EVIDENCE_DISCLAIMER}</Notice>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="text-base font-medium">Current tally</h3>
        <p className="text-[13px] text-text-3 mt-0.5 mb-4 num">
          Passes with at least {formatBps(threshold)} of participating weight. Total eligible weight: {formatEth(eligibleWeight(campaign))} ETH.
        </p>
        <VoteBar milestone={milestone} thresholdBps={threshold} />
      </div>

      {milestone.status === MilestoneStatus.Voting && (
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-medium">Your vote</h3>
          <p className="mt-1.5 text-sm text-text-2 flex items-start gap-2">
            {existingVote !== 0 ? <Check className="size-4 mt-0.5 text-accent shrink-0" /> : <Info className="size-4 mt-0.5 text-text-3 shrink-0" />}
            {eligibility}
          </p>
          {eligible && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button onClick={() => setPendingChoice(true)} disabled={busy}>
                <ThumbsUp className="size-4" /> Approve milestone
              </Button>
              <Button variant="danger" onClick={() => setPendingChoice(false)} disabled={busy}>
                <ThumbsDown className="size-4" /> Reject milestone
              </Button>
            </div>
          )}
          {canResolve(campaign, milestone, now) && (
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-sm text-text-2 mb-3">
                {now >= milestone.votingDeadline ? "The voting period has ended." : "Every eligible wallet has voted."} Anyone can now ask the contract to settle the result.
              </p>
              <Button variant="secondary" disabled={busy} onClick={() => void send(`Resolve milestone ${milestone.index + 1} vote`, (signer) => resolveMilestone(signer, campaign.address))}>
                Resolve vote
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingChoice !== null}
        title={pendingChoice ? "Approve this milestone?" : "Reject this milestone?"}
        confirmLabel={pendingChoice ? "Send approve vote" : "Send reject vote"}
        danger={pendingChoice === false}
        onClose={() => setPendingChoice(null)}
        onConfirm={() => pendingChoice !== null && castVote(pendingChoice)}
      >
        <p>Your wallet votes with a weight of {contribution !== null ? formatEth(contribution) : "0"} ETH, your recorded contribution. A vote is final and cannot be changed.</p>
        <p>
          If approval reaches {formatBps(threshold)} of participating weight when voting closes, {formatEth(milestone.amount)} ETH becomes claimable by the creator. Otherwise no funds are released, and anyone can cancel the campaign to open refunds of the remaining balance.
        </p>
      </ConfirmDialog>
    </div>
  );
}
