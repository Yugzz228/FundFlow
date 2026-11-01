import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FundFlowCampaign, FundFlowFactory } from "../typechain-types";

// Development-only: creates LOCAL DEMONSTRATION campaigns through the real contracts, using real
// transactions from Hardhat's test accounts. Titles carry the "[Local demo]" prefix and the frontend
// labels them accordingly. Running it moves the local chain clock forward by several days.

type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

const DAY = 86_400;
const eth = ethers.parseEther;

async function advance(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== 31337) throw new Error("The demo seed only runs on the local Hardhat chain.");

  const deployment = JSON.parse(readFileSync(join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const factory = (await ethers.getContractAt("FundFlowFactory", deployment.factoryAddress)) as unknown as FundFlowFactory;
  const [, maya, jonas, ana, ben, chloe, dev] = await ethers.getSigners();

  const create = async (
    creator: Signer,
    title: string,
    description: string,
    target: string,
    durationDays: number,
    milestones: [string, number][],
    votingDays = 2,
  ): Promise<FundFlowCampaign> => {
    const latest = (await ethers.provider.getBlock("latest"))!.timestamp;
    const tx = await factory.connect(creator).createCampaign({
      title: `[Local demo] ${title}`,
      description,
      imageUrl: "",
      fundingTarget: eth(target),
      deadline: latest + durationDays * DAY,
      votingPeriod: votingDays * DAY,
      milestoneDescriptions: milestones.map(([text]) => text),
      milestoneAllocationsBps: milestones.map(([, bps]) => bps),
    });
    await tx.wait();
    const created = await factory.getCampaignsByCreator(creator.address);
    return ethers.getContractAt("FundFlowCampaign", created[created.length - 1]) as unknown as Promise<FundFlowCampaign>;
  };

  const fund = async (campaign: FundFlowCampaign, gifts: [Signer, string][]) => {
    for (const [wallet, amount] of gifts) await (await campaign.connect(wallet).contribute({ value: eth(amount) })).wait();
  };

  /** Evidence, votes, then resolution once every eligible wallet has voted or the period has ended. */
  const decide = async (campaign: FundFlowCampaign, creator: Signer, evidence: string, votes: [Signer, boolean][], everyoneVotes: boolean) => {
    const index = await campaign.currentMilestone();
    await (await campaign.connect(creator).submitMilestoneEvidence(index, evidence)).wait();
    for (const [wallet, approve] of votes) await (await campaign.connect(wallet).vote(index, approve)).wait();
    if (!everyoneVotes) await advance(Number(await campaign.votingPeriod()));
    await (await campaign.resolveMilestone()).wait();
    return index;
  };

  console.log("Creating campaigns...");
  const completed = await create(maya, "Campus Water Quality Sensors",
    "Low-cost sensors that publish water quality readings from campus buildings. All milestones were approved by contributors in this demo.",
    "4", 1, [["Assemble and calibrate the first sensor batch", 5000], ["Install sensors and publish the open dashboard", 5000]]);
  const voting = await create(maya, "Open Lab Notebook for Student Researchers",
    "A shared, versioned lab notebook for undergraduate research groups. The first milestone is released and the second is out for a vote.",
    "6", 1, [["Working notebook prototype with two pilot labs", 3000], ["Multi-lab beta with export to PDF and CSV", 3000], ["Public launch and onboarding guide", 4000]], 14);
  const cancelled = await create(jonas, "Community Repair Café Toolkit",
    "Tools and guides for monthly repair events. Contributors approved the first milestone, rejected the second, and the campaign was cancelled.",
    "5", 1, [["Buy the shared tool kit", 4000], ["Run three public repair events", 3000], ["Publish the organizer handbook", 3000]]);
  const awaitingEvidence = await create(jonas, "Bike Share Docking Stations",
    "Solar-powered bike docks for the north campus. Funded and waiting for the creator to submit evidence for the first milestone.",
    "3", 1, [["Install two pilot docks", 5000], ["Expand to six docks", 5000]]);
  const failed = await create(maya, "Language Exchange Mobile App",
    "A peer language exchange app for international students. This campaign missed its target, so contributors can claim full refunds.",
    "20", 1, [["Build the matching prototype", 5000], ["Release to app stores", 5000]]);
  const awaitingFinalization = await create(jonas, "Maker Space Laser Cutter",
    "A shared laser cutter for the student maker space. The deadline has passed and anyone can now finalize this campaign.",
    "2", 1, [["Purchase and install the cutter", 7000], ["Run safety training sessions", 3000]]);

  console.log("Contributing...");
  await fund(completed, [[ana, "2.5"], [ben, "1.5"]]);
  await fund(voting, [[ana, "3"], [ben, "2"], [chloe, "1.5"]]);
  await fund(cancelled, [[ben, "3"], [chloe, "1.25"], [dev, "0.75"]]);
  await fund(awaitingEvidence, [[chloe, "2"], [dev, "1.2"]]);
  await fund(failed, [[ana, "1"], [dev, "0.5"]]);
  await fund(awaitingFinalization, [[ana, "1.4"], [ben, "0.9"]]);

  await advance(DAY + 60);

  console.log("Finalizing and running milestone votes...");
  for (const campaign of [completed, voting, cancelled, awaitingEvidence, failed]) await (await campaign.finalize()).wait();

  await decide(completed, maya, "https://example.test/water-sensors/calibration-report", [[ana, true], [ben, true]], true);
  await (await completed.connect(maya).claimMilestoneFunds(0)).wait();
  await decide(completed, maya, "https://example.test/water-sensors/dashboard", [[ana, true], [ben, true]], true);
  await (await completed.connect(maya).claimMilestoneFunds(1)).wait();

  await decide(cancelled, jonas, "https://example.test/repair-cafe/tool-receipts", [[ben, true], [chloe, true], [dev, true]], true);
  await (await cancelled.connect(jonas).claimMilestoneFunds(0)).wait();
  await decide(cancelled, jonas, "https://example.test/repair-cafe/event-photos", [[ben, false], [chloe, true], [dev, false]], true);
  await (await cancelled.connect(ben).cancelCampaign()).wait();

  await decide(voting, maya, "https://example.test/lab-notebook/pilot-report", [[ana, true], [ben, true], [chloe, true]], true);
  await (await voting.connect(maya).claimMilestoneFunds(0)).wait();
  await (await voting.connect(maya).submitMilestoneEvidence(1, "https://example.test/lab-notebook/beta-release")).wait();
  await (await voting.connect(ana).vote(1, true)).wait();
  await (await voting.connect(chloe).vote(1, false)).wait();

  // Created last so the clock changes above do not end their fundraising.
  const open = await create(jonas, "Accessible Campus Map",
    "A wayfinding map with step-free routes, ramps and lift status. Open for contributions.",
    "8", 30, [["Survey routes across campus", 2500], ["Build and test the map with users", 4500], ["Launch and hand over to the student union", 3000]]);
  await fund(open, [[ana, "1.75"], [chloe, "2.5"], [dev, "0.8"]]);
  const openFunded = await create(maya, "Peer Tutoring Scheduler",
    "Scheduling and attendance for volunteer peer tutors. Already past its target and still open until the deadline.",
    "1.5", 21, [["Pilot with one department", 4000], ["Roll out across the faculty", 6000]]);
  await fund(openFunded, [[ben, "1"], [dev, "0.9"]]);

  console.log(`Done. ${await factory.campaignCount()} campaigns now exist on this local chain.`);
  console.log("Wallets used (Hardhat test accounts):");
  console.log(`  #1 creator     ${maya.address}`);
  console.log(`  #2 creator     ${jonas.address}`);
  console.log(`  #3 contributor ${ana.address}`);
  console.log(`  #4 contributor ${ben.address}`);
  console.log(`  #5 contributor ${chloe.address}`);
  console.log(`  #6 contributor ${dev.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
