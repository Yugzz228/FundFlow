import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { DAY, State, TARGET, validParams } from "./helpers";

describe("FundFlowFactory", () => {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();
    const factory = await (await ethers.getContractFactory("FundFlowFactory")).deploy();
    const campaignFactory = await ethers.getContractFactory("FundFlowCampaign");
    return { factory, campaignInterface: campaignFactory, deployer, alice, bob };
  }

  describe("valid creation", () => {
    it("deploys a campaign owned by the caller, with all parameters stored", async () => {
      const { factory, alice } = await loadFixture(deploy);
      const params = await validParams({ imageUrl: "https://example.test/a.png" });
      await factory.connect(alice).createCampaign(params);

      const [address] = await factory.getCampaigns();
      const campaign = await ethers.getContractAt("FundFlowCampaign", address);
      const summary = await campaign.getSummary();

      expect(summary.creator).to.equal(alice.address);
      expect(summary.title).to.equal(params.title);
      expect(summary.description).to.equal(params.description);
      expect(summary.imageUrl).to.equal(params.imageUrl);
      expect(summary.fundingTarget).to.equal(TARGET);
      expect(summary.deadline).to.equal(params.deadline);
      expect(summary.votingPeriod).to.equal(params.votingPeriod);
      expect(summary.state).to.equal(State.Fundraising);
      expect(summary.milestoneCount).to.equal(3n);
      expect(await campaign.factory()).to.equal(await factory.getAddress());

      const milestones = await campaign.getMilestones();
      expect(milestones.map((m) => m.allocationBps)).to.deep.equal([3000n, 3000n, 4000n]);
      expect(milestones.map((m) => m.description)).to.deep.equal(["Prototype", "Pilot", "Launch"]);
    });

    it("emits CampaignCreated with indexed campaign, creator and index", async () => {
      const { factory, alice } = await loadFixture(deploy);
      const params = await validParams();
      await expect(factory.connect(alice).createCampaign(params))
        .to.emit(factory, "CampaignCreated")
        .withArgs(anyValue, alice.address, 0n, params.title, TARGET, params.deadline, 3n);
    });

    it("indexes campaigns globally and per creator", async () => {
      const { factory, alice, bob } = await loadFixture(deploy);
      await factory.connect(alice).createCampaign(await validParams());
      await factory.connect(bob).createCampaign(await validParams());
      await factory.connect(alice).createCampaign(await validParams());

      const all = await factory.getCampaigns();
      expect(await factory.campaignCount()).to.equal(3n);
      expect(await factory.getCampaignsByCreator(alice.address)).to.deep.equal([all[0], all[2]]);
      expect(await factory.getCampaignsByCreator(bob.address)).to.deep.equal([all[1]]);
    });

    it("accepts the milestone limit and a single 100% milestone", async () => {
      const { factory, alice } = await loadFixture(deploy);
      await expect(
        factory.connect(alice).createCampaign(
          await validParams({
            milestoneDescriptions: Array(10).fill("step"),
            milestoneAllocationsBps: Array(10).fill(1000),
          }),
        ),
      ).to.emit(factory, "CampaignCreated");
      await expect(
        factory.connect(alice).createCampaign(
          await validParams({ milestoneDescriptions: ["only"], milestoneAllocationsBps: [10000] }),
        ),
      ).to.emit(factory, "CampaignCreated");
    });

    it("exposes the rules the frontend validates against", async () => {
      const { factory } = await loadFixture(deploy);
      const limits = await factory.limits();
      expect(limits.maxMilestones).to.equal(10n);
      expect(limits.approvalThresholdBps).to.equal(6000n);
      expect(limits.bpsDenominator).to.equal(10000n);
    });
  });

  describe("invalid creation", () => {
    const cases: [string, string, () => Promise<object>][] = [
      ["zero funding target", "ZeroFundingTarget", async () => ({ fundingTarget: 0 })],
      ["deadline in the past", "InvalidDeadline", async () => ({ deadline: (await time.latest()) - 1 })],
      ["deadline too far ahead", "InvalidDeadline", async () => ({ deadline: (await time.latest()) + 400 * DAY })],
      ["empty title", "EmptyTitle", async () => ({ title: "" })],
      ["empty description", "EmptyDescription", async () => ({ description: "" })],
      ["over-long title", "TextTooLong", async () => ({ title: "x".repeat(121) })],
      ["over-long image URL", "TextTooLong", async () => ({ imageUrl: "x".repeat(513) })],
      ["voting period too short", "InvalidVotingPeriod", async () => ({ votingPeriod: 60 })],
      ["voting period too long", "InvalidVotingPeriod", async () => ({ votingPeriod: 31 * DAY })],
      ["no milestones", "InvalidMilestoneCount", async () => ({ milestoneDescriptions: [], milestoneAllocationsBps: [] })],
      [
        "too many milestones",
        "InvalidMilestoneCount",
        async () => ({ milestoneDescriptions: Array(11).fill("s"), milestoneAllocationsBps: Array(11).fill(909) }),
      ],
      ["mismatched arrays", "MilestoneArrayMismatch", async () => ({ milestoneAllocationsBps: [5000, 5000] })],
      ["empty milestone text", "EmptyMilestoneDescription", async () => ({ milestoneDescriptions: ["a", "", "c"] })],
      ["zero allocation", "ZeroMilestoneAllocation", async () => ({ milestoneAllocationsBps: [0, 6000, 4000] })],
      ["allocations under 100%", "AllocationsMustTotal100Percent", async () => ({ milestoneAllocationsBps: [3000, 3000, 3999] })],
      ["allocations over 100%", "AllocationsMustTotal100Percent", async () => ({ milestoneAllocationsBps: [3000, 3000, 4001] })],
    ];

    for (const [name, error, overrides] of cases) {
      it(`rejects ${name}`, async () => {
        const { factory, campaignInterface, alice } = await loadFixture(deploy);
        await expect(
          factory.connect(alice).createCampaign(await validParams(await overrides())),
        ).to.be.revertedWithCustomError(campaignInterface, error);
      });
    }

    it("does not index a campaign when creation reverts", async () => {
      const { factory, alice } = await loadFixture(deploy);
      await expect(factory.connect(alice).createCampaign(await validParams({ title: "" }))).to.be.reverted;
      expect(await factory.campaignCount()).to.equal(0n);
    });
  });
});
