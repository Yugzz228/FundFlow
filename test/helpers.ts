import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FundFlowCampaign, FundFlowFactory } from "../typechain-types";

export const DAY = 86_400;
export const VOTING_PERIOD = 3 * DAY;
export const SUBMISSION_WINDOW = 90 * DAY;
export const TARGET = ethers.parseEther("10");

export const State = { Fundraising: 0n, MilestonePhase: 1n, Failed: 2n, Cancelled: 3n, Completed: 4n };
export const Status = { Pending: 0n, Voting: 1n, Approved: 2n, Rejected: 3n, Expired: 4n };
export const Reason = { MilestoneRejected: 0n, MilestoneExpired: 1n, SubmissionWindowMissed: 2n, CreatorCancelled: 3n };

export async function validParams(overrides: Partial<FundFlowCampaign.CampaignParamsStruct> = {}) {
  return {
    title: "Solar Kiosk",
    description: "Solar charging kiosks for campus",
    imageUrl: "",
    fundingTarget: TARGET,
    deadline: (await time.latest()) + 7 * DAY,
    votingPeriod: VOTING_PERIOD,
    milestoneDescriptions: ["Prototype", "Pilot", "Launch"],
    milestoneAllocationsBps: [3000, 3000, 4000],
    ...overrides,
  };
}

export async function createCampaign(
  factory: FundFlowFactory,
  creator: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  overrides: Partial<FundFlowCampaign.CampaignParamsStruct> = {},
) {
  const params = await validParams(overrides);
  const addresses = await factory.getCampaignsByCreator(creator.address);
  await factory.connect(creator).createCampaign(params);
  const after = await factory.getCampaignsByCreator(creator.address);
  if (after.length !== addresses.length + 1) throw new Error("campaign was not indexed");
  return ethers.getContractAt("FundFlowCampaign", after[after.length - 1]);
}

/** Deadline passes and the campaign is finalized. */
export async function endFundraising(campaign: FundFlowCampaign) {
  await time.increaseTo(await campaign.deadline());
  await campaign.finalize();
}

/** Wallets vote on the current milestone; the vote is then resolved after its deadline. Returns the resolving transaction. */
export async function runVote(
  campaign: FundFlowCampaign,
  creator: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  votes: [Awaited<ReturnType<typeof ethers.getSigners>>[number], boolean][],
  evidence = "ipfs://evidence",
) {
  const index = await campaign.currentMilestone();
  await campaign.connect(creator).submitMilestoneEvidence(index, evidence);
  for (const [voter, approve] of votes) await campaign.connect(voter).vote(index, approve);
  const milestone = (await campaign.getMilestones())[Number(index)];
  await time.increaseTo(milestone.votingDeadline);
  return campaign.resolveMilestone();
}
