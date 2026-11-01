import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { Ban, CheckCircle2, CircleCheck, Coins, FilePlus2, FileText, Flag, HandCoins, Hourglass, RotateCcw, ThumbsDown, ThumbsUp, Trophy, Undo2 } from "lucide-react";
import { useData } from "../context/DataContext";
import { useWallet } from "../context/WalletContext";
import { formatDateTime, formatEth, sameAddress, shortHash, splitDemoTitle } from "../utils/format";
import { CancelReason, type Activity } from "../types";
import { Address, CopyButton } from "./Address";
import { EmptyState, Button } from "./ui";

const CANCEL_REASON: Record<number, string> = {
  [CancelReason.MilestoneRejected]: "milestone rejected",
  [CancelReason.MilestoneExpired]: "vote expired",
  [CancelReason.SubmissionWindowMissed]: "submission window missed",
  [CancelReason.CreatorCancelled]: "creator cancelled",
};

export function describeActivity(item: Activity): { label: string; icon: ComponentType<{ className?: string }>; note?: string } {
  const milestone = item.milestoneIndex !== null ? `Milestone ${item.milestoneIndex + 1}` : "";
  switch (item.type) {
    case "CampaignCreated":
      return { label: "Campaign created", icon: FilePlus2, note: "Target" };
    case "ContributionReceived":
      return { label: "Contribution", icon: Coins };
    case "CampaignFinalized":
      return { label: item.successful ? "Finalized: target reached" : "Finalized: target missed", icon: Flag, note: "Raised" };
    case "MilestoneEvidenceSubmitted":
      return { label: `${milestone} evidence submitted`, icon: FileText };
    case "VoteCast":
      return { label: `${milestone} vote: ${item.approve ? "approve" : "reject"}`, icon: item.approve ? ThumbsUp : ThumbsDown, note: "Weight" };
    case "MilestoneApproved":
      return { label: `${milestone} approved`, icon: CircleCheck, note: "Claimable" };
    case "MilestoneRejected":
      return { label: `${milestone} rejected`, icon: Ban };
    case "MilestoneExpired":
      return { label: `${milestone} vote expired`, icon: Hourglass };
    case "MilestoneFundsClaimed":
      return { label: `${milestone} funds claimed`, icon: HandCoins };
    case "CampaignCompleted":
      return { label: "Campaign completed", icon: Trophy, note: "Approved" };
    case "CampaignCancelled":
      return { label: `Cancelled: ${CANCEL_REASON[Number(item.detail)] ?? "see contract"}`, icon: Undo2, note: "Refund pool" };
    case "RefundClaimed":
      return { label: "Refund claimed", icon: RotateCcw };
  }
}

const PAGE_SIZE = 25;

/** Rows are real contract events. Hashes are shown for copying: a local chain has no block explorer to link to. */
export function TransactionHistory({ items, showCampaign = false, emptyTitle = "No on-chain activity yet" }: { items: Activity[]; showCampaign?: boolean; emptyTitle?: string }) {
  const { campaigns } = useData();
  const { address } = useWallet();
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (items.length === 0) return <EmptyState title={emptyTitle}>Contract events appear here once transactions are mined.</EmptyState>;

  const titleOf = (campaign: string) => splitDemoTitle(campaigns.find((c) => sameAddress(c.address, campaign))?.title ?? "").title || "Campaign";

  return (
    <div>
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line">
          {items.slice(0, limit).map((item) => {
            const { label, icon: Icon, note } = describeActivity(item);
            return (
              <li key={item.id} className="grid gap-x-5 gap-y-1.5 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon className="size-4 mt-0.5 text-text-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    {showCampaign && (
                      <Link to={`/campaigns/${item.campaign}`} className="block truncate text-[13px] text-text-2 hover:text-accent">
                        {titleOf(item.campaign)}
                      </Link>
                    )}
                    {item.amount !== null && (
                      <div className="text-[13px] text-text-2 num">
                        {note ? `${note}: ` : ""}
                        {formatEth(item.amount)} ETH
                      </div>
                    )}
                  </div>
                </div>
                <div className="pl-7 md:pl-0 min-w-0">
                  {item.wallet && <Address address={item.wallet} you={sameAddress(item.wallet, address)} />}
                  <div className="text-xs text-text-3 num">{item.timestamp ? formatDateTime(item.timestamp) : "Time unavailable"}</div>
                </div>
                <div className="pl-7 md:pl-0 min-w-0">
                  <div className="flex items-center gap-1 text-text-2">
                    <span className="font-mono text-xs" title={item.txHash}>{shortHash(item.txHash)}</span>
                    <CopyButton value={item.txHash} label="Copy transaction hash" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-3 num">
                    <CheckCircle2 className="size-3 text-accent" aria-hidden /> Confirmed · block {item.blockNumber}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {items.length > limit && (
        <div className="mt-4 text-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Show more ({items.length - limit} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
