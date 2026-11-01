import { parseEther, toQuantity, type JsonRpcProvider } from "ethers";

export const FAUCET_AMOUNT_ETH = "100";

/**
 * Sends test ETH to a wallet from the local Hardhat node's first account. This is a normal on-chain
 * transfer. The node signs it, so no key is held here, and it only works on a development node:
 * a real network has no unlocked accounts to send from.
 */
export async function requestTestEth(provider: JsonRpcProvider, to: string): Promise<void> {
  const accounts: string[] = await provider.send("eth_accounts", []);
  if (accounts.length === 0) throw new Error("This node has no unlocked test accounts.");

  const hash: string = await provider.send("eth_sendTransaction", [
    { from: accounts[0], to, value: toQuantity(parseEther(FAUCET_AMOUNT_ETH)) },
  ]);
  const receipt = await provider.waitForTransaction(hash);
  if (receipt?.status !== 1) throw new Error("The test ETH transfer failed.");
}
