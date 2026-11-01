import { useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Users } from "lucide-react";
import { useChainNow } from "../context/ChainContext";
import { formatDuration, splitDemoTitle } from "../utils/format";
import { campaignPhase } from "../utils/status";
import type { Campaign } from "../types";
import { Address } from "./Address";
import { FundingProgress, TrancheRail } from "./FundingProgress";
import { DemoBadge, PhaseBadge } from "./ui";

/** Only http(s) image URLs are rendered, and a broken link quietly falls back to no image. */
export function CampaignImage({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!/^https?:\/\//i.test(url) || failed) return null;
  return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`w-full object-cover ${className ?? ""}`} />;
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const now = useChainNow();
  const phase = campaignPhase(campaign, now);
  const { title, isDemo } = splitDemoTitle(campaign.title);

  return (
    <Link
      to={`/campaigns/${campaign.address}`}
      className="card group flex flex-col overflow-hidden transition-colors duration-200 hover:border-line-strong hover:bg-raised"
    >
      <CampaignImage url={campaign.imageUrl} className="h-36" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <PhaseBadge phase={phase} />
          {isDemo && <DemoBadge />}
        </div>
        <h3 className="display mt-3.5 text-[26px] leading-[1.12] group-hover:text-accent-strong transition-colors">{title}</h3>
        <p className="mt-2 text-sm text-text-2 line-clamp-2">{campaign.description}</p>

        <div className="mt-auto pt-5">
          <FundingProgress raised={campaign.totalRaised} target={campaign.fundingTarget} />
          <div className="mt-4">
            <TrancheRail campaign={campaign} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-text-3">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5" />
              {campaign.milestones.length} milestone{campaign.milestones.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 num">
              <Users className="size-3.5" />
              {campaign.contributorCount}
            </span>
            <span className="num">{phase === "fundraising" ? `${formatDuration(campaign.deadline - now)} left` : phase === "awaiting-finalization" ? "Deadline passed" : ""}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-line text-[13px] text-text-3 flex items-center gap-1.5">
            by <Address address={campaign.creator} />
          </div>
        </div>
      </div>
    </Link>
  );
}
