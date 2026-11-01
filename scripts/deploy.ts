import { artifacts, ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const LOCAL_CHAIN_ID = 31337;

function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  // This project only ever runs on a local development chain with test ETH.
  if (Number(chainId) !== LOCAL_CHAIN_ID) {
    throw new Error(`Refusing to deploy to chain ${chainId}: FundFlow is for the local Hardhat network only.`);
  }

  const [deployer] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("FundFlowFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const receipt = await factory.deploymentTransaction()!.wait();

  const address = await factory.getAddress();
  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    factoryAddress: address,
    deploymentBlock: receipt!.blockNumber,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    abi: {
      FundFlowFactory: "frontend/src/abi/FundFlowFactory.json",
      FundFlowCampaign: "frontend/src/abi/FundFlowCampaign.json",
    },
  };

  writeJson(join(ROOT, "deployments", `${network.name}.json`), deployment);
  writeJson(join(ROOT, "frontend", "public", "deployment.json"), deployment);

  // Keep the ABIs the frontend compiles against in step with the contracts.
  for (const name of ["FundFlowFactory", "FundFlowCampaign"]) {
    const { abi } = await artifacts.readArtifact(name);
    writeJson(join(ROOT, "frontend", "src", "abi", `${name}.json`), abi);
  }

  // Verify the deployed contract really answers before reporting success.
  const limits = await factory.limits();
  console.log(`FundFlowFactory deployed to ${address} on ${network.name} (chain ${chainId}), block ${receipt!.blockNumber}`);
  console.log(`Verified: campaignCount=${await factory.campaignCount()}, maxMilestones=${limits.maxMilestones}`);
  console.log(`Wrote deployments/${network.name}.json and frontend/public/deployment.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
