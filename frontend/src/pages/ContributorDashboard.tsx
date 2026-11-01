import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Coins, Compass, Flag, Layers, RotateCcw, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import { TransactionHistory } from "../components/TransactionHistory";
import { Badge, EmptyState, LinkButton, LoadingState, PageHeader, PhaseBadge, StatCard } from "../components/ui";
import { useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { useWallet } from "../context/WalletContext";
import { usePositions } from "../hooks/usePositions";
import { formatDuration, formatEth, sameAddress, splitDemoTitle } from "../utils/format";
import { activeMilestone, campaignPhase } from "../utils/status";
import { MilestoneStatus } from "../types";
import { ConnectPrompt } from "./CreatorDashboard";

function CampaignRow({ address, title, right, children }: { address: string; title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li>
      <Link to={address} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 hover:bg-hover/50 transition-colors">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{title}</div>
          {children && <div className="text-[13px] text-text-2 mt-0.5 num">{children}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {right}
          <ArrowRight className="size-4 text-text-3" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="display text-3xl mb-4">{title}</h2>
      {children}
    </section>
  );
}

export function ContributorDashboard() {
  const { address } = useWallet();
  const { campaigns, activity, loading } = useData();
  const { positions, loading: positionsLoading } = usePositions(address);
  const now = useChainNow();

  const supported = useMemo(
    () => campaigns.filter((c) => (positions.get(c.address)?.contribution ?? 0n) > 0n),
    [campaigns, positions],
  );

  const myActivity = useMemo(() => activity.filter((item) => sameAddress(item.wallet, address)), [activity, address]);
  const myVotes = useMemo(() => myActivity.filter((item) => item.type === "VoteCast"), [myActivity]);

  if (!address) {
    return (
      <div className="page">
        <PageHeader eyebrow="Contributor" title="Contributor dashboard" />
        <ConnectPrompt title="Connect the wallet you contribute with">This dashboard shows the contributions, votes and refunds of your connected wallet.</ConnectPrompt>
      </div>
    );
  }

  const position = (campaign: string) => positions.get(campaign);
  const totalContributed = supported.reduce((sum, c) => sum + (position(c.address)?.contribution ?? 0n), 0n);
  const activeVotes = supported.filter((c) => {
    const milestone = activeMilestone(c);
    return milestone?.status === MilestoneStatus.Voting && now < milestone.votingDeadline && !sameAddress(c.creator, address);
  });
  const refundable = supported.filter((c) => (position(c.address)?.refundable ?? 0n) > 0n);
  const claimed = supported.filter((c) => position(c.address)?.refundClaimed);
  const awaitingFinalization = supported.filter((c) => campaignPhase(c, now) === "awaiting-finalization");
  const totalRefundable = refundable.reduce((sum, c) => sum + (position(c.address)?.refundable ?? 0n), 0n);
  const totalRefunded = claimed.reduce((sum, c) => sum + (position(c.address)?.refundPaid ?? 0n), 0n);
  const titleOf = (campaign: string) => splitDemoTitle(campaigns.find((c) => sameAddress(c.address, campaign))?.title ?? "").title;

  return (
    <div className="page">
      <PageHeader eyebrow="Contributor" title="Contributor dashboard">
        Figures here are personal to your connected wallet, not campaign totals.
      </PageHeader>

      {loading || positionsLoading ? (
        <LoadingState />
      ) : supported.length === 0 ? (
        <EmptyState icon={Compass} title="This wallet has not contributed yet" action={<LinkButton to="/campaigns">Explore campaigns</LinkButton>}>
          Campaigns you fund with this wallet appear here, along with your votes and refunds.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            <StatCard label="Campaigns contributed to" value={supported.length} icon={Layers} />
            <StatCard label="You contributed" value={`${formatEth(totalContributed)} ETH`} icon={Coins} />
            <StatCard label="Votes awaiting you" value={activeVotes.filter((c) => position(c.address)?.currentVote === 0).length} hint={`${activeVotes.length} open in total`} icon={Vote} />
            <StatCard label="Refunds available" value={`${formatEth(totalRefundable)} ETH`} hint={`${refundable.length} campaign${refundable.length === 1 ? "" : "s"}`} icon={RotateCcw} />
            <StatCard label="Refunds received" value={`${formatEth(totalRefunded)} ETH`} hint={`${claimed.length} campaign${claimed.length === 1 ? "" : "s"}`} icon={CheckCircle2} />
            <StatCard label="Awaiting finalization" value={awaitingFinalization.length} hint="Anyone can finalize these" icon={Flag} />
          </div>

          {activeVotes.length > 0 && (
            <Group id="active-votes" title="Active milestone votes">
              <ul className="card divide-y divide-line">
                {activeVotes.map((campaign) => {
                  const milestone = activeMilestone(campaign)!;
                  const vote = position(campaign.address)?.currentVote ?? 0;
                  return (
                    <CampaignRow
                      key={campaign.address}
                      address={`/campaigns/${campaign.address}/milestones/${milestone.index}`}
                      title={splitDemoTitle(campaign.title).title}
                      right={vote === 0 ? <Badge tone="warn" icon={Vote}>Your vote needed</Badge> : <Badge tone="accent" icon={CheckCircle2}>Voted</Badge>}
                    >
                      Milestone {milestone.index + 1} · {formatDuration(milestone.votingDeadline - now)} left
                    </CampaignRow>
                  );
                })}
              </ul>
            </Group>
          )}

          {refundable.length > 0 && (
            <Group id="refunds-available" title="Refunds available">
              <ul className="card divide-y divide-line">
                {refundable.map((campaign) => (
                  <CampaignRow key={campaign.address} address={`/campaigns/${campaign.address}`} title={splitDemoTitle(campaign.title).title} right={<Badge tone="accent" icon={RotateCcw}>Claim on campaign page</Badge>}>
                    {formatEth(position(campaign.address)!.refundable)} ETH of your {formatEth(position(campaign.address)!.contribution)} ETH
                  </CampaignRow>
                ))}
              </ul>
            </Group>
          )}

          <Group id="contributions" title="Your contributions">
            <ul className="card divide-y divide-line">
              {supported.map((campaign) => (
                <CampaignRow key={campaign.address} address={`/campaigns/${campaign.address}`} title={splitDemoTitle(campaign.title).title} right={<PhaseBadge phase={campaignPhase(campaign, now)} />}>
                  You: {formatEth(position(campaign.address)!.contribution)} ETH · Campaign total: {formatEth(campaign.totalRaised)} ETH
                  {position(campaign.address)!.refundClaimed && ` · Refunded ${formatEth(position(campaign.address)!.refundPaid)} ETH`}
                </CampaignRow>
              ))}
            </ul>
          </Group>

          <Group id="voting-history" title="Voting history">
            {myVotes.length === 0 ? (
              <EmptyState icon={Vote} title="No votes cast by this wallet" />
            ) : (
              <ul className="card divide-y divide-line">
                {myVotes.map((item) => (
                  <CampaignRow
                    key={item.id}
                    address={`/campaigns/${item.campaign}/milestones/${item.milestoneIndex}`}
                    title={titleOf(item.campaign)}
                    right={item.approve ? <Badge tone="accent" icon={ThumbsUp}>Approved</Badge> : <Badge tone="danger" icon={ThumbsDown}>Rejected</Badge>}
                  >
                    Milestone {(item.milestoneIndex ?? 0) + 1} · weight {formatEth(item.amount ?? 0n)} ETH
                  </CampaignRow>
                ))}
              </ul>
            )}
          </Group>

          <Group id="recent-transactions" title="Recent transactions">
            <TransactionHistory items={myActivity.slice(0, 10)} showCampaign />
          </Group>
        </>
      )}
    </div>
  );
}
