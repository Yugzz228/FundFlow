import type { Log, Provider } from "ethers";
import { campaignInterface, factoryInterface } from "./contracts";
import type { Activity, ActivityType } from "../types";

const ACTIVITY_TYPES = new Set<string>([
  "CampaignCreated",
  "ContributionReceived",
  "CampaignFinalized",
  "MilestoneEvidenceSubmitted",
  "VoteCast",
  "MilestoneApproved",
  "MilestoneRejected",
  "MilestoneExpired",
  "MilestoneFundsClaimed",
  "CampaignCompleted",
  "CampaignCancelled",
  "RefundClaimed",
]);

/** Block timestamps and transaction senders never change for a mined block, so they are cached per chain. */
export class EventReader {
  private blockTimes = new Map<number, number | null>();
  private senders = new Map<string, string>();

  constructor(private provider: Provider) {}

  /** Reads and normalizes events in a block range, oldest first. */
  async read(factoryAddress: string, campaignAddresses: string[], fromBlock: number, toBlock: number): Promise<Activity[]> {
    if (fromBlock > toBlock) return [];

    const [factoryLogs, campaignLogs] = await Promise.all([
      this.provider.getLogs({ address: factoryAddress, fromBlock, toBlock }),
      campaignAddresses.length ? this.provider.getLogs({ address: campaignAddresses, fromBlock, toBlock }) : Promise.resolve([] as Log[]),
    ]);
    const logs = [...factoryLogs, ...campaignLogs];

    await Promise.all([
      ...[...new Set(logs.map((log) => log.blockNumber))].map((n) => this.blockTime(n)),
      ...[...new Set(logs.map((log) => log.transactionHash))].map((hash) => this.sender(hash)),
    ]);

    const items: Activity[] = [];
    for (const log of logs) {
      const item = log.address.toLowerCase() === factoryAddress.toLowerCase() ? this.normalizeFactoryLog(log) : this.normalizeCampaignLog(log);
      if (item) items.push(item);
    }
    return items.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  }

  private async blockTime(blockNumber: number) {
    if (!this.blockTimes.has(blockNumber)) {
      const block = await this.provider.getBlock(blockNumber);
      this.blockTimes.set(blockNumber, block?.timestamp ?? null);
    }
  }

  private async sender(hash: string) {
    if (!this.senders.has(hash)) {
      const tx = await this.provider.getTransaction(hash);
      if (tx) this.senders.set(hash, tx.from);
    }
  }

  private base(log: Log, type: ActivityType, campaign: string): Activity {
    return {
      id: `${log.transactionHash}-${log.index}`,
      type,
      campaign,
      wallet: this.senders.get(log.transactionHash) ?? "",
      amount: null,
      milestoneIndex: null,
      detail: null,
      approve: null,
      successful: null,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.index,
      timestamp: this.blockTimes.get(log.blockNumber) ?? null,
    };
  }

  private normalizeFactoryLog(log: Log): Activity | null {
    const parsed = factoryInterface.parseLog(log);
    if (parsed?.name !== "CampaignCreated") return null;
    return {
      ...this.base(log, "CampaignCreated", parsed.args.campaign),
      wallet: parsed.args.creator,
      amount: parsed.args.fundingTarget,
      detail: parsed.args.title,
    };
  }

  private normalizeCampaignLog(log: Log): Activity | null {
    const parsed = campaignInterface.parseLog(log);
    if (!parsed || !ACTIVITY_TYPES.has(parsed.name)) return null;

    const item = this.base(log, parsed.name as ActivityType, log.address);
    const args = parsed.args;
    switch (parsed.name) {
      case "ContributionReceived":
        return { ...item, wallet: args.contributor, amount: args.amount };
      case "CampaignFinalized":
        return { ...item, amount: args.totalRaised, successful: args.successful };
      case "MilestoneEvidenceSubmitted":
        return { ...item, wallet: args.creator, milestoneIndex: Number(args.milestoneIndex), detail: args.evidence };
      case "VoteCast":
        return { ...item, wallet: args.voter, milestoneIndex: Number(args.milestoneIndex), amount: args.weight, approve: args.approve };
      case "MilestoneApproved":
        return { ...item, milestoneIndex: Number(args.milestoneIndex), amount: args.claimableAmount };
      case "MilestoneRejected":
      case "MilestoneExpired":
        return { ...item, milestoneIndex: Number(args.milestoneIndex) };
      case "MilestoneFundsClaimed":
        return { ...item, wallet: args.creator, milestoneIndex: Number(args.milestoneIndex), amount: args.amount };
      case "CampaignCompleted":
        return { ...item, amount: args.totalApproved };
      case "CampaignCancelled":
        return { ...item, wallet: args.caller, amount: args.refundPool, detail: String(Number(args.reason)) };
      case "RefundClaimed":
        return { ...item, wallet: args.contributor, amount: args.amount };
      default:
        return item;
    }
  }
}
