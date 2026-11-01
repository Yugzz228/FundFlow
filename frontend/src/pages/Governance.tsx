import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, SearchX, Vote } from "lucide-react";
import { VotingPanel } from "../components/VotingPanel";
import { EmptyState, LinkButton, LoadingState, MilestoneBadge, PageHeader } from "../components/ui";
import { useChain, useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { formatBps, formatDuration, formatEth, sameAddress, splitDemoTitle } from "../utils/format";
import { milestoneView } from "../utils/status";
import { MilestoneStatus, type Campaign, type Milestone } from "../types";

function VoteRow({ campaign, milestone }: { campaign: Campaign; milestone: Milestone }) {
  const now = useChainNow();
  const open = milestone.status === MilestoneStatus.Voting && now < milestone.votingDeadline;
  const participating = milestone.approveWeight + milestone.rejectWeight;
  const approveBps = participating > 0n ? Number((milestone.approveWeight * 10_000n) / participating) : 0;
  return (
    <li>
      <Link to={`/campaigns/${campaign.address}/milestones/${milestone.index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 hover:bg-hover/50 transition-colors">
        <div className="min-w-0 flex-1 basis-64">
          <div className="text-[13px] text-text-3 truncate">{splitDemoTitle(campaign.title).title} · Milestone {milestone.index + 1}</div>
          <div className="mt-0.5 font-medium">{milestone.description}</div>
          <div className="mt-1 text-[13px] text-text-2 num">
            {formatEth(participating)} ETH voted · {formatBps(approveBps)} approve
            {open && ` · ${formatDuration(milestone.votingDeadline - now)} left`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MilestoneBadge view={milestoneView(campaign, milestone, now)} />
          <ArrowRight className="size-4 text-text-3" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

export function Governance() {
  const { campaigns, loading } = useData();
  const { limits } = useChain();

  const { current, past } = useMemo(() => {
    const all = campaigns.flatMap((campaign) => campaign.milestones.filter((m) => m.status !== MilestoneStatus.Pending).map((milestone) => ({ campaign, milestone })));
    return {
      current: all.filter(({ milestone }) => milestone.status === MilestoneStatus.Voting).sort((a, b) => a.milestone.votingDeadline - b.milestone.votingDeadline),
      past: all.filter(({ milestone }) => milestone.status !== MilestoneStatus.Voting).sort((a, b) => b.milestone.resolvedAt - a.milestone.resolvedAt),
    };
  }, [campaigns]);

  return (
    <div className="page">
      <PageHeader eyebrow="Governance" title="Milestone votes">
        Contributors decide whether each milestone's funds become claimable. A milestone passes with at least {formatBps(limits?.approvalThresholdBps ?? 6000)} of the weight that participated, counted by the contract.
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <section aria-labelledby="current-votes">
            <h2 id="current-votes" className="display text-3xl mb-4">Current votes</h2>
            {current.length === 0 ? (
              <EmptyState icon={Vote} title="No votes are open" action={<LinkButton to="/campaigns" variant="secondary">Explore campaigns</LinkButton>}>
                A vote opens when a creator submits evidence for a milestone.
              </EmptyState>
            ) : (
              <ul className="card divide-y divide-line">
                {current.map(({ campaign, milestone }) => <VoteRow key={`${campaign.address}-${milestone.index}`} campaign={campaign} milestone={milestone} />)}
              </ul>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-votes" className="mt-10">
              <h2 id="past-votes" className="display text-3xl mb-4">Past votes</h2>
              <ul className="card divide-y divide-line">
                {past.map(({ campaign, milestone }) => <VoteRow key={`${campaign.address}-${milestone.index}`} campaign={campaign} milestone={milestone} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function MilestoneVote() {
  const { address, index } = useParams();
  const { campaigns, loading } = useData();

  const campaign = campaigns.find((c) => sameAddress(c.address, address));
  const milestone = /^\d+$/.test(index ?? "") ? campaign?.milestones[Number(index)] : undefined;

  if (loading) return <LoadingState />;
  if (!campaign || !milestone) {
    return (
      <div className="page py-16">
        <EmptyState icon={SearchX} title="Milestone not found on this chain" action={<LinkButton to="/governance">View all votes</LinkButton>} />
      </div>
    );
  }

  return (
    <div className="page max-w-3xl pt-8">
      <Link to={`/campaigns/${campaign.address}`} className="inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text">
        <ArrowLeft className="size-3.5" /> {splitDemoTitle(campaign.title).title}
      </Link>
      <div className="mt-5">
        <VotingPanel campaign={campaign} milestone={milestone} />
      </div>
    </div>
  );
}
