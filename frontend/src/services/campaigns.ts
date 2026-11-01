import type { Provider } from "ethers";
import { campaignContract, factoryContract } from "./contracts";
import type { Campaign, Limits, Milestone, Position } from "../types";

export async function fetchLimits(factoryAddress: string, provider: Provider): Promise<Limits> {
  const raw = await factoryContract(factoryAddress, provider).limits();
  return {
    maxMilestones: Number(raw.maxMilestones),
    bpsDenominator: Number(raw.bpsDenominator),
    approvalThresholdBps: Number(raw.approvalThresholdBps),
    minVotingPeriod: Number(raw.minVotingPeriod),
    maxVotingPeriod: Number(raw.maxVotingPeriod),
    maxFundraisingDuration: Number(raw.maxFundraisingDuration),
    submissionWindow: Number(raw.submissionWindow),
    maxTitleLength: Number(raw.maxTitleLength),
    maxDescriptionLength: Number(raw.maxDescriptionLength),
    maxUrlLength: Number(raw.maxUrlLength),
    maxMilestoneTextLength: Number(raw.maxMilestoneTextLength),
  };
}

export async function fetchCampaign(address: string, provider: Provider): Promise<Campaign> {
  const contract = campaignContract(address, provider);
  const [summary, rawMilestones, amounts] = await Promise.all([
    contract.getSummary(),
    contract.getMilestones(),
    contract.getMilestoneAmounts(),
  ]);

  const milestones: Milestone[] = rawMilestones.map((m: Record<string, never>, index: number) => ({
    index,
    description: m.description,
    evidence: m.evidence,
    allocationBps: Number(m.allocationBps),
    amount: amounts[index] as bigint,
    status: Number(m.status),
    fundsClaimed: m.fundsClaimed,
    submittedAt: Number(m.submittedAt),
    votingDeadline: Number(m.votingDeadline),
    resolvedAt: Number(m.resolvedAt),
    approveWeight: m.approveWeight,
    rejectWeight: m.rejectWeight,
  }));

  return {
    address,
    creator: summary.creator,
    title: summary.title,
    description: summary.description,
    imageUrl: summary.imageUrl,
    fundingTarget: summary.fundingTarget,
    deadline: Number(summary.deadline),
    votingPeriod: Number(summary.votingPeriod),
    state: Number(summary.state),
    totalRaised: summary.totalRaised,
    contributorCount: Number(summary.contributorCount),
    creatorContribution: summary.creatorContribution,
    currentMilestone: Number(summary.currentMilestone),
    currentMilestoneStartedAt: Number(summary.currentMilestoneStartedAt),
    totalApproved: summary.totalApproved,
    totalReleased: summary.totalReleased,
    refundPool: summary.refundPool,
    totalRefunded: summary.totalRefunded,
    refundsClaimed: Number(summary.refundsClaimed),
    createdAt: Number(summary.createdAt),
    milestones,
  };
}

export async function fetchAllCampaigns(factoryAddress: string, provider: Provider): Promise<Campaign[]> {
  const addresses: string[] = await factoryContract(factoryAddress, provider).getCampaigns();
  return Promise.all(addresses.map((address) => fetchCampaign(address, provider)));
}

export async function fetchPositions(campaigns: Campaign[], wallet: string, provider: Provider): Promise<Map<string, Position>> {
  const entries = await Promise.all(
    campaigns.map(async (campaign): Promise<[string, Position]> => {
      const contract = campaignContract(campaign.address, provider);
      const [position, currentVote] = await Promise.all([
        contract.positionOf(wallet),
        contract.voteOf(campaign.currentMilestone, wallet),
      ]);
      return [
        campaign.address,
        {
          campaign: campaign.address,
          contribution: position.contribution,
          refundClaimed: position.refundClaimed,
          refundPaid: position.refundPaid,
          refundable: position.refundable,
          currentVote: Number(currentVote),
        },
      ];
    }),
  );
  return new Map(entries);
}
