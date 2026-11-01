import { Contract, Interface, JsonRpcProvider, type ContractRunner, type InterfaceAbi } from "ethers";
import factoryAbi from "../abi/FundFlowFactory.json";
import campaignAbi from "../abi/FundFlowCampaign.json";

export const factoryInterface = new Interface(factoryAbi as InterfaceAbi);
export const campaignInterface = new Interface(campaignAbi as InterfaceAbi);

/** Read-only connection, so visitors can browse without a wallet. Writes always go through a wallet signer. */
export function createReadProvider(rpcUrl: string, chainId: number) {
  return new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
}

export function factoryContract(address: string, runner: ContractRunner) {
  return new Contract(address, factoryInterface, runner);
}

export function campaignContract(address: string, runner: ContractRunner) {
  return new Contract(address, campaignInterface, runner);
}
