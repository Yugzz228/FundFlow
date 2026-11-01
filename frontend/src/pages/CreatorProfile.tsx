import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { isAddress } from "ethers";
import { Ban, CheckCircle2, CircleCheck, Coins, Flag, Info, Layers, SearchX, XCircle } from "lucide-react";
import { Address } from "../components/Address";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, LinkButton, LoadingState, Notice, PageHeader, StatCard } from "../components/ui";
import { useData } from "../context/DataContext";
import { formatEth, sameAddress } from "../utils/format";
import { CampaignState, MilestoneStatus } from "../types";

export function CreatorProfile() {
  const { address } = useParams();
  const { campaigns, loading } = useData();

  const stats = useMemo(() => {
    const mine = campaigns.filter((c) => sameAddress(c.creator, address));
    const milestones = mine.flatMap((c) => c.milestones);
    const completed = mine.filter((c) => c.state === CampaignState.Completed).length;
    const failed = mine.filter((c) => c.state === CampaignState.Failed).length;
    const cancelled = mine.filter((c) => c.state === CampaignState.Cancelled).length;
    return {
      mine,
      funded: mine.filter((c) => c.state === CampaignState.MilestonePhase || c.state === CampaignState.Completed || c.state === CampaignState.Cancelled).length,
      completed,
      failed,
      cancelled,
      ended: completed + failed + cancelled,
      approved: milestones.filter((m) => m.status === MilestoneStatus.Approved).length,
      rejected: milestones.filter((m) => m.status === MilestoneStatus.Rejected || m.status === MilestoneStatus.Expired).length,
      released: mine.reduce((sum, c) => sum + c.totalReleased, 0n),
      refunded: mine.reduce((sum, c) => sum + c.totalRefunded, 0n),
    };
  }, [campaigns, address]);

  if (!isAddress(address ?? "")) {
    return (
      <div className="page py-16">
        <EmptyState icon={SearchX} title="That is not a valid wallet address" action={<LinkButton to="/campaigns">Explore campaigns</LinkButton>} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Creator profile" title="Track record">
        <span className="inline-flex items-center gap-2">Wallet <Address address={address!} copy /></span>
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : stats.mine.length === 0 ? (
        <EmptyState icon={Layers} title="No campaigns from this wallet on this chain" />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Campaigns created" value={stats.mine.length} icon={Layers} />
            <StatCard label="Successfully funded" value={stats.funded} icon={Flag} />
            <StatCard label="Milestones approved" value={stats.approved} icon={CircleCheck} />
            <StatCard label="Milestones not approved" value={stats.rejected} hint="Rejected or expired" icon={Ban} />
            <StatCard label="Funds released" value={`${formatEth(stats.released)} ETH`} icon={Coins} />
            <StatCard label="Refunded to contributors" value={`${formatEth(stats.refunded)} ETH`} icon={Coins} />
            <StatCard label="Campaigns cancelled" value={stats.cancelled} icon={XCircle} />
            <StatCard
              label="Completion"
              value={stats.ended > 0 ? `${stats.completed} of ${stats.ended}` : "None ended yet"}
              hint="Completed, out of all that have ended"
              icon={CheckCircle2}
            />
          </div>

          <div className="mt-5">
            <Notice icon={Info}>
              These figures are counted directly from this wallet's campaign contracts on this chain. Historical outcomes provide transparency but do not guarantee future project success, and FundFlow does not assign a trust score. One person can also use many wallets.
            </Notice>
          </div>

          <h2 className="display text-3xl mt-10 mb-4">Campaigns by this creator</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {stats.mine.map((campaign) => <CampaignCard key={campaign.address} campaign={campaign} />)}
          </div>
        </>
      )}
    </div>
  );
}
