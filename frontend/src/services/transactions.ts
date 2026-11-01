import type { ContractTransactionResponse, Signer } from "ethers";
import { campaignContract, factoryContract, factoryInterface } from "./contracts";
import type { NewCampaignInput } from "../types";

// Every state change goes through one of these functions, signed by the connected wallet.
// The contract decides whether each one succeeds.

type TxResult = Promise<ContractTransactionResponse>;

export function createCampaign(signer: Signer, factoryAddress: string, input: NewCampaignInput): TxResult {
  return factoryContract(factoryAddress, signer).createCampaign(input);
}

export function contribute(signer: Signer, campaign: string, wei: bigint): TxResult {
  return campaignContract(campaign, signer).contribute({ value: wei });
}

export function finalize(signer: Signer, campaign: string): TxResult {
  return campaignContract(campaign, signer).finalize();
}

export function submitEvidence(signer: Signer, campaign: string, milestoneIndex: number, evidence: string): TxResult {
  return campaignContract(campaign, signer).submitMilestoneEvidence(milestoneIndex, evidence);
}

export function vote(signer: Signer, campaign: string, milestoneIndex: number, approve: boolean): TxResult {
  return campaignContract(campaign, signer).vote(milestoneIndex, approve);
}

export function resolveMilestone(signer: Signer, campaign: string): TxResult {
  return campaignContract(campaign, signer).resolveMilestone();
}

export function claimMilestoneFunds(signer: Signer, campaign: string, milestoneIndex: number): TxResult {
  return campaignContract(campaign, signer).claimMilestoneFunds(milestoneIndex);
}

export function cancelCampaign(signer: Signer, campaign: string): TxResult {
  return campaignContract(campaign, signer).cancelCampaign();
}

export function claimRefund(signer: Signer, campaign: string): TxResult {
  return campaignContract(campaign, signer).claimRefund();
}

/** The new campaign's address, read from the CampaignCreated event in a confirmed receipt. */
export function campaignAddressFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): string | null {
  for (const log of logs) {
    try {
      const parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "CampaignCreated") return parsed.args.campaign;
    } catch {
      // Logs from other contracts in the same receipt are not factory events.
    }
  }
  return null;
}
