import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Coins, FilePlus2, FileUp, Flag, HandCoins, Layers, TrendingUp, Vote, Wallet } from "lucide-react";
import { RaisedByCampaignChart } from "../components/Charts";
import { TrancheRail } from "../components/FundingProgress";
import { TransactionHistory } from "../components/TransactionHistory";
import { EmptyState, FilterChips, LinkButton, LoadingState, PageHeader, PhaseBadge, StatCard } from "../components/ui";
import { ConnectWalletAction } from "../components/WalletConnectButton";
import { useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { useWallet } from "../context/WalletContext";
import { formatEth, progressBps, sameAddress, splitDemoTitle } from "../utils/format";
import { activeMilestone, campaignPhase, canResolve } from "../utils/status";
import { CampaignState, MilestoneStatus, type Campaign } from "../types";

type Filter = "all" | "fundraising" | "needs-evidence" | "voting" | "claimable" | "ended";

export function ConnectPrompt({ title, children }: { title: string; children: string }) {
  return (
    <EmptyState icon={Wallet} title={title} action={<ConnectWalletAction />}>
      {children}
    </EmptyState>
  );
}

export function CreatorDashboard() {
  const { address } = useWallet();
  const { campaigns, activity, loading } = useData();
  const now = useChainNow();
  const [filter, setFilter] = useState<Filter>("all");

  const mine = useMemo(() => campaigns.filter((c) => sameAddress(c.creator, address)).sort((a, b) => b.createdAt - a.createdAt), [campaigns, address]);

  const needsEvidence = (c: Campaign) => activeMilestone(c)?.status === MilestoneStatus.Pending;
  const awaitingVotes = (c: Campaign) => activeMilestone(c)?.status === MilestoneStatus.Voting;
  const claimable = (c: Campaign) => c.totalApproved - c.totalReleased;
  const isSuccessful = (c: Campaign) => c.state === CampaignState.MilestonePhase || c.state === CampaignState.Completed || c.state === CampaignState.Cancelled;

  const matches: Record<Filter, (c: Campaign) => boolean> = {
    all: () => true,
    fundraising: (c) => c.state === CampaignState.Fundraising,
    "needs-evidence": needsEvidence,
    voting: awaitingVotes,
    claimable: (c) => claimable(c) > 0n,
    ended: (c) => c.state === CampaignState.Failed || c.state === CampaignState.Cancelled || c.state === CampaignState.Completed,
  };

  const recent = useMemo(() => {
    const addresses = new Set(mine.map((c) => c.address.toLowerCase()));
    return activity.filter((item) => addresses.has(item.campaign.toLowerCase()));
  }, [mine, activity]);

  if (!address) {
    return (
      <div className="page">
        <PageHeader eyebrow="Creator" title="Creator dashboard" />
        <ConnectPrompt title="Connect the wallet you create campaigns with">This dashboard reads campaigns created by your connected wallet.</ConnectPrompt>
      </div>
    );
  }

  const totalRaised = mine.reduce((sum, c) => sum + c.totalRaised, 0n);
  const totalClaimable = mine.reduce((sum, c) => sum + claimable(c), 0n);
  const visible = mine.filter(matches[filter]);

  return (
    <div className="page">
      <PageHeader eyebrow="Creator" title="Creator dashboard" action={<LinkButton to="/create"><FilePlus2 className="size-4" /> New campaign</LinkButton>}>
        All figures are read from your campaign contracts on the local chain.
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : mine.length === 0 ? (
        <EmptyState icon={FilePlus2} title="This wallet has not created a campaign" action={<LinkButton to="/create">Start a campaign</LinkButton>}>
          Campaigns you create with this wallet appear here.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Campaigns created" value={mine.length} icon={Layers} />
            <StatCard label="Total raised" value={`${formatEth(totalRaised)} ETH`} icon={Coins} />
            <StatCard label="Fundraising now" value={mine.filter(matches.fundraising).length} icon={TrendingUp} />
            <StatCard label="Successful" value={mine.filter(isSuccessful).length} hint="Reached their target" icon={Flag} />
            <StatCard label="Need milestone evidence" value={mine.filter(needsEvidence).length} icon={FileUp} />
            <StatCard label="Milestones awaiting votes" value={mine.filter(awaitingVotes).length} icon={Vote} />
            <StatCard label="Claimable by you" value={`${formatEth(totalClaimable)} ETH`} hint="Approved, not yet transferred" icon={HandCoins} />
            <StatCard label="Released to you" value={`${formatEth(mine.reduce((sum, c) => sum + c.totalReleased, 0n))} ETH`} icon={Wallet} />
          </div>

          <section className="mt-10" aria-labelledby="my-campaigns">
            <h2 id="my-campaigns" className="display text-3xl mb-4">Your campaigns</h2>
            <FilterChips
              label="Filter your campaigns"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: mine.length },
                { value: "fundraising", label: "Fundraising", count: mine.filter(matches.fundraising).length },
                { value: "needs-evidence", label: "Needs evidence", count: mine.filter(needsEvidence).length },
                { value: "voting", label: "In voting", count: mine.filter(awaitingVotes).length },
                { value: "claimable", label: "Funds claimable", count: mine.filter(matches.claimable).length },
                { value: "ended", label: "Ended", count: mine.filter(matches.ended).length },
              ]}
            />
            <div className="mt-4">
              {visible.length === 0 ? (
                <EmptyState title="Nothing matches this filter" />
              ) : (
                <ul className="card divide-y divide-line">
                  {visible.map((campaign) => {
                    const active = activeMilestone(campaign);
                    let next: string | null = null;
                    if (claimable(campaign) > 0n) next = `${formatEth(claimable(campaign))} ETH to claim`;
                    else if (campaignPhase(campaign, now) === "awaiting-finalization") next = "Ready to finalize";
                    else if (active?.status === MilestoneStatus.Pending) next = `Submit milestone ${active.index + 1} evidence`;
                    else if (active && canResolve(campaign, active, now)) next = "Vote ready to resolve";
                    else if (active?.status === MilestoneStatus.Voting) next = `Milestone ${active.index + 1} in voting`;
                    return (
                      <li key={campaign.address}>
                        <Link to={`/campaigns/${campaign.address}`} className="grid gap-3 p-4 sm:p-5 hover:bg-hover/50 transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <PhaseBadge phase={campaignPhase(campaign, now)} />
                              {next && <span className="text-[13px] text-warn">{next}</span>}
                            </div>
                            <div className="mt-1.5 font-medium truncate">{splitDemoTitle(campaign.title).title}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] text-text-2 num">
                              {formatEth(campaign.totalRaised)} of {formatEth(campaign.fundingTarget)} ETH · {Math.floor(progressBps(campaign.totalRaised, campaign.fundingTarget) / 100)}%
                            </div>
                            <div className="mt-2"><TrancheRail campaign={campaign} /></div>
                          </div>
                          <ArrowRight className="size-4 text-text-3 hidden md:block" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="mt-10" aria-labelledby="raised-chart">
            <h2 id="raised-chart" className="display text-3xl mb-4">ETH raised per campaign</h2>
            <div className="card p-4 sm:p-5"><RaisedByCampaignChart campaigns={mine} /></div>
          </section>

          <section className="mt-10" aria-labelledby="creator-activity">
            <h2 id="creator-activity" className="display text-3xl mb-4">Recent activity</h2>
            <TransactionHistory items={recent.slice(0, 10)} showCampaign />
          </section>
        </>
      )}
    </div>
  );
}
