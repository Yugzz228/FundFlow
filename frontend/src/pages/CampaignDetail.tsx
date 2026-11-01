import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarClock, Crown, FileUp, Flag, HandCoins, RotateCcw, SearchX, ShieldAlert, Users, XCircle } from "lucide-react";
import { Address } from "../components/Address";
import { CampaignImage } from "../components/CampaignCard";
import { FundingChart } from "../components/Charts";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ContributionForm } from "../components/ContributionForm";
import { FundingProgress, TrancheRail } from "../components/FundingProgress";
import { MilestoneTimeline } from "../components/MilestoneTimeline";
import { TransactionHistory } from "../components/TransactionHistory";
import { EVIDENCE_DISCLAIMER } from "../components/VotingPanel";
import { Button, DemoBadge, EmptyState, LinkButton, LoadingState, Notice, PhaseBadge } from "../components/ui";
import { useChain, useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { useTransactions } from "../context/TransactionContext";
import { useWallet } from "../context/WalletContext";
import { fetchPositions } from "../services/campaigns";
import * as tx from "../services/transactions";
import { formatDateTime, formatDuration, formatEth, sameAddress, splitDemoTitle } from "../utils/format";
import { activeMilestone, campaignPhase, canResolve, cancelEligibility, claimableMilestones } from "../utils/status";
import { CampaignState, MilestoneStatus, type Campaign, type Position } from "../types";

function usePosition(campaign: Campaign | undefined, wallet: string | null) {
  const { provider } = useChain();
  const [position, setPosition] = useState<Position | null>(null);
  useEffect(() => {
    if (!campaign || !wallet || !provider) {
      setPosition(null);
      return;
    }
    let stale = false;
    fetchPositions([campaign], wallet, provider)
      .then((positions) => {
        if (!stale) setPosition(positions.get(campaign.address) ?? null);
      })
      .catch((error: unknown) => console.error("[FundFlow] failed to read position", error));
    return () => {
      stale = true;
    };
  }, [campaign, wallet, provider]);
  return position;
}

interface PendingAction {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  label: string;
  run: Parameters<ReturnType<typeof useTransactions>["send"]>[1];
}

function EvidenceForm({ campaign, milestoneIndex }: { campaign: Campaign; milestoneIndex: number }) {
  const { send, busy } = useTransactions();
  const { limits } = useChain();
  const [evidence, setEvidence] = useState("");
  const [confirming, setConfirming] = useState(false);
  const max = limits?.maxUrlLength ?? 512;
  const value = evidence.trim();
  const valid = value.length > 0 && new TextEncoder().encode(value).length <= max;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) setConfirming(true);
      }}
    >
      <label htmlFor="evidence" className="text-sm font-medium">Submit evidence for milestone {milestoneIndex + 1}</label>
      <input
        id="evidence"
        className="field mt-2"
        placeholder="URL or content identifier"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
      />
      <p className="mt-1.5 text-xs text-text-3">A milestone can only be submitted once. Submitting opens the vote for {formatDuration(campaign.votingPeriod)}.</p>
      <Button type="submit" className="w-full mt-3" disabled={!valid || busy}>
        <FileUp className="size-4" /> Submit evidence
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Submit this evidence?"
        confirmLabel="Submit evidence"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          const receipt = await send(`Submit evidence for milestone ${milestoneIndex + 1}`, (signer) => tx.submitEvidence(signer, campaign.address, milestoneIndex, value));
          if (receipt) setEvidence("");
        }}
      >
        <p className="break-all font-mono text-[13px] text-text">{value}</p>
        <p>This is stored on-chain and cannot be edited or resubmitted. {EVIDENCE_DISCLAIMER}</p>
      </ConfirmDialog>
    </form>
  );
}

/** Shows only the actions the contract would currently accept from this wallet. */
function ActionPanel({ campaign, position }: { campaign: Campaign; position: Position | null }) {
  const now = useChainNow();
  const { limits } = useChain();
  const { address } = useWallet();
  const { send, busy } = useTransactions();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const phase = campaignPhase(campaign, now);
  const isCreator = sameAddress(address, campaign.creator);
  const active = activeMilestone(campaign);
  const cancel = cancelEligibility(campaign, limits, now);
  const claimable = isCreator ? claimableMilestones(campaign) : [];
  const isContributor = !!position && position.contribution > 0n;
  const refundOpen = campaign.state === CampaignState.Failed || campaign.state === CampaignState.Cancelled;
  const windowEnd = limits ? campaign.currentMilestoneStartedAt + limits.submissionWindow : 0;
  const canSubmit = isCreator && active?.status === MilestoneStatus.Pending && now < windowEnd;
  const voteOpen = active?.status === MilestoneStatus.Voting && now < active.votingDeadline;

  const sections: React.ReactNode[] = [];

  if (phase === "awaiting-finalization") {
    sections.push(
      <div key="finalize">
        <p className="text-sm text-text-2">The deadline has passed. Anyone can finalize this campaign; the contract compares the amount raised with the target and sets the outcome.</p>
        <Button
          className="w-full mt-3"
          disabled={busy}
          onClick={() =>
            setPending({
              title: "Finalize this campaign?",
              body: `${formatEth(campaign.totalRaised)} of ${formatEth(campaign.fundingTarget)} ETH was raised. The contract records the outcome permanently: milestone phase if the target was met, refunds if not.`,
              confirmLabel: "Finalize",
              label: "Finalize campaign",
              run: (signer) => tx.finalize(signer, campaign.address),
            })
          }
        >
          <Flag className="size-4" /> Finalize campaign
        </Button>
      </div>,
    );
  }

  if (canSubmit && active) {
    sections.push(
      <div key="evidence">
        <EvidenceForm campaign={campaign} milestoneIndex={active.index} />
        <p className="mt-2 text-xs text-text-3 num">Submission window closes in {formatDuration(windowEnd - now)}.</p>
      </div>,
    );
  }

  if (active && voteOpen) {
    sections.push(
      <div key="vote">
        <p className="text-sm text-text-2">Milestone {active.index + 1} is out for a vote, with {formatDuration(active.votingDeadline - now)} left.</p>
        <LinkButton to={`/campaigns/${campaign.address}/milestones/${active.index}`} className="w-full mt-3" variant={isContributor && !isCreator && position?.currentVote === 0 ? "primary" : "secondary"}>
          {isContributor && !isCreator && position?.currentVote === 0 ? "Inspect evidence and vote" : "View vote"} <ArrowRight className="size-4" />
        </LinkButton>
      </div>,
    );
  }

  if (active && canResolve(campaign, active, now)) {
    sections.push(
      <div key="resolve">
        <p className="text-sm text-text-2">{now >= active.votingDeadline ? "Voting has ended." : "Every eligible wallet has voted."} Anyone can settle the result.</p>
        <Button className="w-full mt-3" disabled={busy} onClick={() => void send(`Resolve milestone ${active.index + 1} vote`, (signer) => tx.resolveMilestone(signer, campaign.address))}>
          Resolve vote
        </Button>
      </div>,
    );
  }

  for (const milestone of claimable) {
    sections.push(
      <div key={`claim-${milestone.index}`}>
        <p className="text-sm text-text-2">Milestone {milestone.index + 1} was approved. {formatEth(milestone.amount)} ETH is claimable but has not been transferred.</p>
        <Button
          className="w-full mt-3"
          disabled={busy}
          onClick={() =>
            setPending({
              title: `Claim milestone ${milestone.index + 1} funds?`,
              body: `The contract will transfer ${formatEth(milestone.amount)} ETH to your wallet. Each milestone can be claimed once.`,
              confirmLabel: "Claim funds",
              label: `Claim milestone ${milestone.index + 1} funds`,
              run: (signer) => tx.claimMilestoneFunds(signer, campaign.address, milestone.index),
            })
          }
        >
          <HandCoins className="size-4" /> Claim {formatEth(milestone.amount)} ETH
        </Button>
      </div>,
    );
  }

  if (refundOpen && position && position.refundable > 0n) {
    sections.push(
      <div key="refund">
        <p className="text-sm text-text-2">
          {campaign.state === CampaignState.Failed
            ? "This campaign missed its target, so your full contribution is refundable."
            : "This campaign was cancelled. Your refund is your proportional share of the funds that were not approved for release."}
        </p>
        <Button
          className="w-full mt-3"
          disabled={busy}
          onClick={() =>
            setPending({
              title: "Claim your refund?",
              body: `The contract will transfer ${formatEth(position.refundable)} ETH to your wallet. A refund can only be claimed once.`,
              confirmLabel: "Claim refund",
              label: "Claim refund",
              run: (signer) => tx.claimRefund(signer, campaign.address),
            })
          }
        >
          <RotateCcw className="size-4" /> Claim {formatEth(position.refundable)} ETH refund
        </Button>
      </div>,
    );
  }

  if (cancel && (cancel.anyone || (cancel.creator && isCreator))) {
    sections.push(
      <div key="cancel">
        <p className="text-sm text-text-2">{cancel.reason} Cancelling is permanent and opens refunds of {formatEth(campaign.totalRaised - campaign.totalApproved)} ETH.</p>
        <Button
          variant="danger"
          className="w-full mt-3"
          disabled={busy}
          onClick={() =>
            setPending({
              title: "Cancel this campaign?",
              body: `No further milestones can run. ${formatEth(campaign.totalRaised - campaign.totalApproved)} ETH becomes refundable to contributors in proportion to their contributions. Allocations already approved stay with the creator.`,
              confirmLabel: "Cancel campaign",
              danger: true,
              label: "Cancel campaign",
              run: (signer) => tx.cancelCampaign(signer, campaign.address),
            })
          }
        >
          <XCircle className="size-4" /> Cancel campaign
        </Button>
      </div>,
    );
  }

  if (sections.length === 0) return null;
  return (
    <section aria-label="Available actions" className="card p-5">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        {isCreator && <Crown className="size-4 text-accent" />}
        {isCreator ? "Campaign management" : "Available actions"}
      </h2>
      <div className="space-y-5 divide-y divide-line [&>*:not(:first-child)]:pt-5">{sections}</div>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ""}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        danger={pending?.danger}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) void send(pending.label, pending.run);
        }}
      >
        <p>{pending?.body}</p>
      </ConfirmDialog>
    </section>
  );
}

function PositionCard({ campaign, position }: { campaign: Campaign; position: Position | null }) {
  const { address } = useWallet();
  if (!address || !position) return null;
  const isCreator = sameAddress(address, campaign.creator);
  if (position.contribution === 0n && !isCreator) return null;
  return (
    <section aria-label="Your position" className="card p-5 text-sm">
      <h2 className="font-medium mb-3">Your position</h2>
      <dl className="space-y-2">
        <div className="flex justify-between gap-3"><dt className="text-text-3">Your contribution</dt><dd className="num">{formatEth(position.contribution)} ETH</dd></div>
        {position.contribution > 0n && campaign.totalRaised > 0n && (
          <div className="flex justify-between gap-3"><dt className="text-text-3">Voting weight</dt><dd className="num">{isCreator ? "None (creator)" : `${formatEth(position.contribution)} ETH`}</dd></div>
        )}
        {position.refundClaimed && <div className="flex justify-between gap-3"><dt className="text-text-3">Refund received</dt><dd className="num">{formatEth(position.refundPaid)} ETH</dd></div>}
        {isCreator && <div className="flex justify-between gap-3"><dt className="text-text-3">Funds released to you</dt><dd className="num">{formatEth(campaign.totalReleased)} ETH</dd></div>}
      </dl>
    </section>
  );
}

function RefundSummary({ campaign }: { campaign: Campaign }) {
  if (campaign.state !== CampaignState.Failed && campaign.state !== CampaignState.Cancelled) return null;
  return (
    <section aria-label="Refunds" className="card p-5 text-sm">
      <h2 className="font-medium mb-3">Refunds</h2>
      <dl className="space-y-2">
        <div className="flex justify-between gap-3"><dt className="text-text-3">Refund pool</dt><dd className="num">{formatEth(campaign.refundPool)} ETH</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-3">Claimed so far</dt><dd className="num">{formatEth(campaign.totalRefunded)} ETH</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-text-3">Contributors refunded</dt><dd className="num">{campaign.refundsClaimed} of {campaign.contributorCount}</dd></div>
        {campaign.state === CampaignState.Cancelled && campaign.totalApproved > 0n && (
          <div className="flex justify-between gap-3"><dt className="text-text-3">Approved for creator (not refundable)</dt><dd className="num">{formatEth(campaign.totalApproved)} ETH</dd></div>
        )}
      </dl>
    </section>
  );
}

export function CampaignDetail() {
  const { address: campaignAddress } = useParams();
  const { campaigns, activity, loading } = useData();
  const { address } = useWallet();
  const now = useChainNow();

  const campaign = campaigns.find((c) => sameAddress(c.address, campaignAddress));
  const position = usePosition(campaign, address);

  const history = useMemo(() => activity.filter((item) => sameAddress(item.campaign, campaignAddress)), [activity, campaignAddress]);
  const contributors = useMemo(() => {
    const totals = new Map<string, bigint>();
    for (const item of history) {
      if (item.type === "ContributionReceived" && item.amount !== null) totals.set(item.wallet, (totals.get(item.wallet) ?? 0n) + item.amount);
    }
    return [...totals.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  }, [history]);

  if (loading) return <LoadingState />;
  if (!campaign) {
    return (
      <div className="page py-16">
        <EmptyState icon={SearchX} title="Campaign not found on this chain" action={<LinkButton to="/campaigns">Explore campaigns</LinkButton>}>
          It may have existed on a previous local chain. Resetting the chain removes everything stored on it.
        </EmptyState>
      </div>
    );
  }

  const phase = campaignPhase(campaign, now);
  const { title, isDemo } = splitDemoTitle(campaign.title);
  const creatorIsYou = sameAddress(address, campaign.creator);

  return (
    <div className="page pt-8">
      <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text">
        <ArrowLeft className="size-3.5" /> All campaigns
      </Link>

      <header className="mt-5 pb-8">
        <div className="flex flex-wrap gap-1.5">
          <PhaseBadge phase={phase} />
          {isDemo && <DemoBadge />}
        </div>
        <h1 className="display mt-4 text-4xl sm:text-6xl max-w-4xl">{title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-3">
          <span className="inline-flex items-center gap-1.5">Creator <Address address={campaign.creator} profile copy you={creatorIsYou} /></span>
          <span className="inline-flex items-center gap-1.5">Contract <Address address={campaign.address} copy /></span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_370px] items-start">
        <div className="space-y-12 min-w-0 order-2 lg:order-1">
          <section>
            <CampaignImage url={campaign.imageUrl} className="h-64 rounded-[14px] mb-5 border border-line" />
            <p className="text-[17px] text-text-2 whitespace-pre-line">{campaign.description}</p>
          </section>

          <section aria-labelledby="milestones-heading">
            <h2 id="milestones-heading" className="display text-3xl">Milestones</h2>
            <p className="mt-2 mb-4 text-sm text-text-2 max-w-2xl">
              Allocations were fixed when this campaign was created and cannot be changed. Each one needs at least 60% of participating voting weight before its funds become claimable.
            </p>
            <div className="mb-5"><TrancheRail campaign={campaign} tall /></div>
            <div className="mb-5"><Notice icon={ShieldAlert}>{EVIDENCE_DISCLAIMER}</Notice></div>
            <MilestoneTimeline campaign={campaign} />
          </section>

          <section aria-labelledby="funding-heading">
            <h2 id="funding-heading" className="display text-3xl mb-4">Funding over time</h2>
            <div className="card p-4 sm:p-5">
              <FundingChart campaign={campaign} activity={history} />
            </div>
          </section>

          <section aria-labelledby="contributors-heading">
            <h2 id="contributors-heading" className="display text-3xl mb-4">Contributors</h2>
            {contributors.length === 0 ? (
              <EmptyState icon={Users} title="No contributions yet" />
            ) : (
              <ul className="card divide-y divide-line">
                {contributors.map(([wallet, total]) => (
                  <li key={wallet} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Address address={wallet} you={sameAddress(wallet, address)} copy />
                    <span className="num">{formatEth(total)} ETH</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="display text-3xl mb-4">On-chain history</h2>
            <TransactionHistory items={history} />
          </section>
        </div>

        <aside className="space-y-4 order-1 lg:order-2 lg:sticky lg:top-20">
          <section aria-label="Funding" className="card p-5">
            <FundingProgress raised={campaign.totalRaised} target={campaign.fundingTarget} large />
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-text-3"><Users className="size-3.5" /> Contributors</dt>
                <dd className="mt-0.5 num">{campaign.contributorCount}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-text-3"><CalendarClock className="size-3.5" /> {phase === "fundraising" ? "Time left" : "Deadline"}</dt>
                <dd className="mt-0.5 num" title={formatDateTime(campaign.deadline)}>{phase === "fundraising" ? formatDuration(campaign.deadline - now) : formatDateTime(campaign.deadline)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-3">Released to creator</dt>
                <dd className="mt-0.5 num">{formatEth(campaign.totalReleased)} ETH</dd>
              </div>
              <div>
                <dt className="text-xs text-text-3">Vote duration</dt>
                <dd className="mt-0.5 num">{formatDuration(campaign.votingPeriod)}</dd>
              </div>
            </dl>
            {campaign.creatorContribution > 0n && (
              <p className="mt-4 text-xs text-text-3 num">Includes {formatEth(campaign.creatorContribution)} ETH from the creator, who cannot vote with it.</p>
            )}
            {phase === "fundraising" && (
              <div className="mt-5 pt-5 border-t border-line">
                <ContributionForm campaign={campaign} />
              </div>
            )}
          </section>
          <ActionPanel campaign={campaign} position={position} />
          <PositionCard campaign={campaign} position={position} />
          <RefundSummary campaign={campaign} />
        </aside>
      </div>
    </div>
  );
}
