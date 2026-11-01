import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import { createCampaign, DAY, endFundraising, Reason, runVote, State, Status, SUBMISSION_WINDOW, TARGET, validParams, VOTING_PERIOD } from "./helpers";

const eth = ethers.parseEther;

describe("FundFlowCampaign", () => {
  async function fundraising() {
    const [deployer, creator, alice, bob, carol, outsider] = await ethers.getSigners();
    const factory = await (await ethers.getContractFactory("FundFlowFactory")).deploy();
    const campaign = await createCampaign(factory, creator);
    return { factory, campaign, deployer, creator, alice, bob, carol, outsider };
  }

  /** Alice 6, Bob 3, Carol 1 of a 10 ETH target; finalized and in the milestone phase. */
  async function milestonePhase() {
    const ctx = await fundraising();
    const { campaign, alice, bob, carol } = ctx;
    await campaign.connect(alice).contribute({ value: eth("6") });
    await campaign.connect(bob).contribute({ value: eth("3") });
    await campaign.connect(carol).contribute({ value: eth("1") });
    await endFundraising(campaign);
    return ctx;
  }

  /** Alice 3 and Bob 1 of a 10 ETH target; finalized as failed. */
  async function failed() {
    const ctx = await fundraising();
    await ctx.campaign.connect(ctx.alice).contribute({ value: eth("3") });
    await ctx.campaign.connect(ctx.bob).contribute({ value: eth("1") });
    await endFundraising(ctx.campaign);
    return ctx;
  }

  describe("contributions", () => {
    it("records a contribution and emits an event", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await expect(campaign.connect(alice).contribute({ value: eth("1") }))
        .to.emit(campaign, "ContributionReceived")
        .withArgs(alice.address, eth("1"), eth("1"), eth("1"));

      expect(await campaign.contributions(alice.address)).to.equal(eth("1"));
      expect(await campaign.totalRaised()).to.equal(eth("1"));
      expect(await campaign.contributorCount()).to.equal(1n);
      expect(await ethers.provider.getBalance(campaign)).to.equal(eth("1"));
    });

    it("accumulates multiple contributions without double counting the contributor", async () => {
      const { campaign, alice, bob } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: eth("1") });
      await campaign.connect(bob).contribute({ value: eth("2") });
      await campaign.connect(alice).contribute({ value: eth("0.5") });

      expect(await campaign.contributions(alice.address)).to.equal(eth("1.5"));
      expect(await campaign.totalRaised()).to.equal(eth("3.5"));
      expect(await campaign.contributorCount()).to.equal(2n);
    });

    it("rejects zero-value contributions", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await expect(campaign.connect(alice).contribute({ value: 0 })).to.be.revertedWithCustomError(campaign, "ZeroContribution");
    });

    it("rejects plain ETH transfers, so all funds go through contribute()", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await expect(alice.sendTransaction({ to: await campaign.getAddress(), value: eth("1") })).to.be.reverted;
    });

    it("accepts a contribution in the last second before the deadline", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await time.setNextBlockTimestamp((await campaign.deadline()) - 1n);
      await expect(campaign.connect(alice).contribute({ value: eth("1") })).to.emit(campaign, "ContributionReceived");
    });

    it("rejects a contribution exactly at the deadline", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await time.setNextBlockTimestamp(await campaign.deadline());
      await expect(campaign.connect(alice).contribute({ value: eth("1") })).to.be.revertedWithCustomError(campaign, "FundraisingEnded");
    });

    it("rejects contributions to finalized campaigns, successful or failed", async () => {
      const a = await loadFixture(milestonePhase);
      await expect(a.campaign.connect(a.alice).contribute({ value: 1 })).to.be.revertedWithCustomError(a.campaign, "NotAcceptingContributions");
      const b = await loadFixture(failed);
      await expect(b.campaign.connect(b.alice).contribute({ value: 1 })).to.be.revertedWithCustomError(b.campaign, "NotAcceptingContributions");
    });

    it("accepts contributions beyond the target until the deadline", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: TARGET });
      await campaign.connect(alice).contribute({ value: eth("5") });
      expect(await campaign.totalRaised()).to.equal(TARGET + eth("5"));
      expect(await campaign.state()).to.equal(State.Fundraising);
    });
  });

  describe("finalization", () => {
    it("rejects finalization one second before the deadline, even if the target is met", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: TARGET });
      await time.setNextBlockTimestamp((await campaign.deadline()) - 1n);
      await expect(campaign.finalize()).to.be.revertedWithCustomError(campaign, "DeadlineNotReached");
    });

    it("finalizes a successful campaign exactly at the deadline, called by anyone", async () => {
      const { campaign, alice, outsider } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: TARGET });
      await time.setNextBlockTimestamp(await campaign.deadline());
      await expect(campaign.connect(outsider).finalize()).to.emit(campaign, "CampaignFinalized").withArgs(true, TARGET);
      expect(await campaign.state()).to.equal(State.MilestonePhase);
      expect(await campaign.refundPool()).to.equal(0n);
    });

    it("marks a campaign failed when one wei short of the target", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: TARGET - 1n });
      await time.increaseTo(await campaign.deadline());
      await expect(campaign.finalize()).to.emit(campaign, "CampaignFinalized").withArgs(false, TARGET - 1n);
      expect(await campaign.state()).to.equal(State.Failed);
      expect(await campaign.refundPool()).to.equal(TARGET - 1n);
    });

    it("marks a campaign with no contributions failed", async () => {
      const { campaign } = await loadFixture(fundraising);
      await time.increaseTo(await campaign.deadline());
      await campaign.finalize();
      expect(await campaign.state()).to.equal(State.Failed);
    });

    it("cannot be finalized twice", async () => {
      const { campaign } = await loadFixture(milestonePhase);
      await expect(campaign.finalize()).to.be.revertedWithCustomError(campaign, "AlreadyFinalized");
    });

    it("gives the creator no way to withdraw from a failed campaign", async () => {
      const { campaign, creator } = await loadFixture(failed);
      await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "MilestoneNotApproved");
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "x")).to.be.revertedWithCustomError(campaign, "MilestonePhaseNotActive");
      await expect(campaign.connect(creator).claimRefund()).to.be.revertedWithCustomError(campaign, "NotAContributor");
      expect(await ethers.provider.getBalance(campaign)).to.equal(eth("4"));
    });
  });

  describe("milestone evidence", () => {
    it("lets the creator submit evidence, opening a bounded vote", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      const tx = await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://proof");
      const now = await time.latest();
      await expect(tx).to.emit(campaign, "MilestoneEvidenceSubmitted").withArgs(0n, creator.address, "ipfs://proof", BigInt(now + VOTING_PERIOD));

      const [milestone] = await campaign.getMilestones();
      expect(milestone.status).to.equal(Status.Voting);
      expect(milestone.evidence).to.equal("ipfs://proof");
      expect(milestone.submittedAt).to.equal(BigInt(now));
      expect(milestone.votingDeadline).to.equal(BigInt(now + VOTING_PERIOD));
    });

    it("rejects submission by anyone but the creator", async () => {
      const { campaign, alice } = await loadFixture(milestonePhase);
      await expect(campaign.connect(alice).submitMilestoneEvidence(0, "x")).to.be.revertedWithCustomError(campaign, "NotCreator");
    });

    it("rejects submission before the campaign succeeds", async () => {
      const { campaign, creator, alice } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: TARGET });
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "x")).to.be.revertedWithCustomError(campaign, "MilestonePhaseNotActive");
    });

    it("requires milestones in sequence", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      await expect(campaign.connect(creator).submitMilestoneEvidence(1, "x")).to.be.revertedWithCustomError(campaign, "MilestoneOutOfOrder");
      await expect(campaign.connect(creator).submitMilestoneEvidence(9, "x")).to.be.revertedWithCustomError(campaign, "InvalidMilestone");
    });

    it("blocks the next milestone while the current vote is unresolved", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await campaign.connect(alice).vote(0, true);
      await expect(campaign.connect(creator).submitMilestoneEvidence(1, "y")).to.be.revertedWithCustomError(campaign, "MilestoneOutOfOrder");
    });

    it("rejects duplicate submission, during and after the vote", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "y")).to.be.revertedWithCustomError(campaign, "MilestoneAlreadySubmitted");
      await campaign.connect(alice).vote(0, false);
      await time.increase(VOTING_PERIOD);
      await campaign.resolveMilestone();
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "y")).to.be.revertedWithCustomError(campaign, "MilestoneAlreadySubmitted");
    });

    it("rejects empty or over-long evidence", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "")).to.be.revertedWithCustomError(campaign, "EmptyEvidence");
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "x".repeat(513))).to.be.revertedWithCustomError(campaign, "TextTooLong");
    });

    it("closes submission once the window has passed", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      await time.increase(SUBMISSION_WINDOW);
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "x")).to.be.revertedWithCustomError(campaign, "SubmissionWindowClosed");
    });
  });

  describe("governance", () => {
    it("lets a contributor vote with weight equal to their contribution", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await expect(campaign.connect(alice).vote(0, true)).to.emit(campaign, "VoteCast").withArgs(0n, alice.address, true, eth("6"));

      const [milestone] = await campaign.getMilestones();
      expect(milestone.approveWeight).to.equal(eth("6"));
      expect(milestone.rejectWeight).to.equal(0n);
      expect(await campaign.voteOf(0, alice.address)).to.equal(1n);
    });

    it("rejects voting before evidence is submitted", async () => {
      const { campaign, alice } = await loadFixture(milestonePhase);
      await expect(campaign.connect(alice).vote(0, true)).to.be.revertedWithCustomError(campaign, "VotingNotOpen");
    });

    it("rejects non-contributors", async () => {
      const { campaign, creator, outsider } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await expect(campaign.connect(outsider).vote(0, true)).to.be.revertedWithCustomError(campaign, "NotAContributor");
    });

    it("excludes the creator from voting even when they contributed", async () => {
      const { campaign, creator, alice } = await loadFixture(fundraising);
      await campaign.connect(creator).contribute({ value: eth("9") });
      await campaign.connect(alice).contribute({ value: eth("1") });
      await endFundraising(campaign);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await expect(campaign.connect(creator).vote(0, true)).to.be.revertedWithCustomError(campaign, "CreatorCannotVote");
      expect(await campaign.eligibleVotingWeight()).to.equal(eth("1"));
    });

    it("rejects duplicate votes, including a change of mind", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await campaign.connect(alice).vote(0, true);
      await expect(campaign.connect(alice).vote(0, true)).to.be.revertedWithCustomError(campaign, "AlreadyVoted");
      await expect(campaign.connect(alice).vote(0, false)).to.be.revertedWithCustomError(campaign, "AlreadyVoted");
    });

    it("accepts a vote in the last second and rejects one at the voting deadline", async () => {
      const { campaign, creator, alice, bob } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      const { votingDeadline } = (await campaign.getMilestones())[0];
      await time.setNextBlockTimestamp(votingDeadline - 1n);
      await campaign.connect(alice).vote(0, true);
      await time.setNextBlockTimestamp(votingDeadline);
      await expect(campaign.connect(bob).vote(0, true)).to.be.revertedWithCustomError(campaign, "VotingEnded");
    });

    it("rejects votes after the milestone is resolved", async () => {
      const { campaign, creator, alice, bob } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, true]]);
      await expect(campaign.connect(bob).vote(0, true)).to.be.revertedWithCustomError(campaign, "VotingNotOpen");
    });

    it("rejects resolution while the vote is open and before submission", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await expect(campaign.resolveMilestone()).to.be.revertedWithCustomError(campaign, "VotingNotOpen");
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await campaign.connect(alice).vote(0, true);
      await expect(campaign.resolveMilestone()).to.be.revertedWithCustomError(campaign, "VotingStillOpen");
    });

    it("resolves early only when all eligible weight has voted", async () => {
      const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await campaign.connect(alice).vote(0, true);
      await campaign.connect(bob).vote(0, true);
      await expect(campaign.resolveMilestone()).to.be.revertedWithCustomError(campaign, "VotingStillOpen");
      await campaign.connect(carol).vote(0, true);
      await expect(campaign.resolveMilestone()).to.emit(campaign, "MilestoneApproved");
    });

    it("cannot be resolved twice", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, false]]);
      await expect(campaign.resolveMilestone()).to.be.revertedWithCustomError(campaign, "VotingNotOpen");
    });

    describe("approval threshold (60% of participating weight)", () => {
      it("approves at exactly 60%", async () => {
        const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
        // Alice 6 approves; Bob 3 and Carol 1 reject: exactly 6/10.
        await runVote(campaign, creator, [[alice, true], [bob, false], [carol, false]]);
        expect((await campaign.getMilestones())[0].status).to.equal(Status.Approved);
      });

      it("rejects one wei under 60%", async () => {
        const { campaign, creator, alice, bob } = await loadFixture(fundraising);
        await campaign.connect(alice).contribute({ value: eth("6") - 1n });
        await campaign.connect(bob).contribute({ value: eth("4") + 1n });
        await endFundraising(campaign);
        const tx = runVote(campaign, creator, [[alice, true], [bob, false]]);
        await expect(tx).to.emit(campaign, "MilestoneRejected");
        expect((await campaign.getMilestones())[0].status).to.equal(Status.Rejected);
      });

      it("measures against participating weight, not total weight", async () => {
        const { campaign, creator, carol } = await loadFixture(milestonePhase);
        // Carol holds only 10% of the weight but is the only participant.
        await runVote(campaign, creator, [[carol, true]]);
        expect((await campaign.getMilestones())[0].status).to.equal(Status.Approved);
      });

      it("does not let a rejected milestone release funds or advance", async () => {
        const { campaign, creator, alice, bob } = await loadFixture(milestonePhase);
        await runVote(campaign, creator, [[alice, false], [bob, true]]);
        expect(await campaign.claimableByCreator()).to.equal(0n);
        expect(await campaign.currentMilestone()).to.equal(0n);
        await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "MilestoneNotApproved");
        await expect(campaign.connect(creator).submitMilestoneEvidence(1, "y")).to.be.revertedWithCustomError(campaign, "MilestoneOutOfOrder");
      });

      it("does not approve an expired vote with no participation", async () => {
        const { campaign, creator } = await loadFixture(milestonePhase);
        await expect(runVote(campaign, creator, [])).to.emit(campaign, "MilestoneExpired").withArgs(0n);
        expect((await campaign.getMilestones())[0].status).to.equal(Status.Expired);
        expect(await campaign.claimableByCreator()).to.equal(0n);
        await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "MilestoneNotApproved");
      });

      it("keeps weights frozen: a voter's weight cannot grow after fundraising", async () => {
        const { campaign, alice } = await loadFixture(milestonePhase);
        await expect(campaign.connect(alice).contribute({ value: eth("100") })).to.be.reverted;
        expect(await campaign.contributions(alice.address)).to.equal(eth("6"));
      });
    });
  });

  describe("fund release", () => {
    it("separates approval, claimability and transfer", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await expect(runVote(campaign, creator, [[alice, true]]))
        .to.emit(campaign, "MilestoneApproved")
        .withArgs(0n, eth("6"), 0n, eth("3"));

      // Approved and claimable, but nothing transferred yet.
      let [milestone] = await campaign.getMilestones();
      expect(milestone.status).to.equal(Status.Approved);
      expect(milestone.fundsClaimed).to.equal(false);
      expect(await campaign.claimableByCreator()).to.equal(eth("3"));
      expect(await campaign.totalReleased()).to.equal(0n);
      expect(await ethers.provider.getBalance(campaign)).to.equal(eth("10"));

      const claim = await campaign.connect(creator).claimMilestoneFunds(0);
      await expect(claim).to.emit(campaign, "MilestoneFundsClaimed").withArgs(0n, creator.address, eth("3"));
      await expect(claim).to.changeEtherBalances([campaign, creator], [-eth("3"), eth("3")]);

      [milestone] = await campaign.getMilestones();
      expect(milestone.fundsClaimed).to.equal(true);
      expect(await campaign.claimableByCreator()).to.equal(0n);
      expect(await campaign.totalReleased()).to.equal(eth("3"));
    });

    it("only lets the creator claim", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, true]]);
      await expect(campaign.connect(alice).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "NotCreator");
    });

    it("rejects claims on unapproved and non-existent milestones", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "MilestoneNotApproved");
      await expect(campaign.connect(creator).claimMilestoneFunds(7)).to.be.revertedWithCustomError(campaign, "InvalidMilestone");
    });

    it("rejects a second claim of the same milestone", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, true]]);
      await campaign.connect(creator).claimMilestoneFunds(0);
      await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "FundsAlreadyClaimed");
    });

    it("completes after the last approval and releases exactly the total raised", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, true]]);
      await runVote(campaign, creator, [[alice, true]]);
      await expect(runVote(campaign, creator, [[alice, true]])).to.emit(campaign, "CampaignCompleted").withArgs(eth("10"));
      expect(await campaign.state()).to.equal(State.Completed);

      for (const index of [0, 1, 2]) await campaign.connect(creator).claimMilestoneFunds(index);
      expect(await campaign.totalReleased()).to.equal(eth("10"));
      expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
      await expect(campaign.connect(creator).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundNotAvailable");
    });

    it("leaves no release dust when the total does not divide evenly", async () => {
      const [, creator, alice] = await ethers.getSigners();
      const factory = await (await ethers.getContractFactory("FundFlowFactory")).deploy();
      const campaign = await createCampaign(factory, creator, {
        fundingTarget: 1,
        milestoneDescriptions: ["a", "b", "c"],
        milestoneAllocationsBps: [3333, 3333, 3334],
      });
      const raised = 10_007n;
      await campaign.connect(alice).contribute({ value: raised });
      await endFundraising(campaign);

      const amounts = await campaign.getMilestoneAmounts();
      expect(amounts[0]).to.equal((raised * 3333n) / 10000n);
      expect(amounts[0] + amounts[1] + amounts[2]).to.equal(raised);

      for (const _ of amounts) await runVote(campaign, creator, [[alice, true]]);
      for (const index of [0, 1, 2]) await campaign.connect(creator).claimMilestoneFunds(index);
      expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
    });

    it("guards the claim against a contract balance shortfall", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, true]]);
      await setBalance(await campaign.getAddress(), eth("1"));
      await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.be.revertedWithCustomError(campaign, "InsufficientContractBalance");
    });
  });

  describe("failed transfers and reentrancy", () => {
    async function contractCreator() {
      const ctx = await fundraising();
      const { factory, alice } = ctx;
      const actor = await (await ethers.getContractFactory("MockActor")).deploy();
      const iface = factory.interface;
      await actor.execute(await factory.getAddress(), iface.encodeFunctionData("createCampaign", [await validParams()]));
      const [address] = await factory.getCampaignsByCreator(await actor.getAddress());
      const campaign = await ethers.getContractAt("FundFlowCampaign", address);

      await campaign.connect(alice).contribute({ value: TARGET });
      await endFundraising(campaign);
      const ci = campaign.interface;
      const target = await campaign.getAddress();
      await actor.execute(target, ci.encodeFunctionData("submitMilestoneEvidence", [0, "x"]));
      await campaign.connect(alice).vote(0, true);
      await time.increase(VOTING_PERIOD);
      await campaign.resolveMilestone();
      return { ...ctx, campaign, actor, target, ci };
    }

    it("keeps a claim available when the creator's wallet refuses ETH", async () => {
      const { campaign, actor, target, ci } = await loadFixture(contractCreator);
      await actor.setMode(1); // Reject
      const claim = ci.encodeFunctionData("claimMilestoneFunds", [0]);

      await expect(actor.execute(target, claim)).to.be.revertedWithCustomError(campaign, "TransferFailed");
      expect((await campaign.getMilestones())[0].fundsClaimed).to.equal(false);
      expect(await campaign.totalReleased()).to.equal(0n);
      expect(await ethers.provider.getBalance(campaign)).to.equal(TARGET);

      await actor.setMode(0); // Accept
      await actor.execute(target, claim);
      expect((await campaign.getMilestones())[0].fundsClaimed).to.equal(true);
      expect(await ethers.provider.getBalance(actor)).to.equal(eth("3"));
    });

    it("blocks a creator re-entering claimMilestoneFunds", async () => {
      const { campaign, actor, target, ci } = await loadFixture(contractCreator);
      const claim = ci.encodeFunctionData("claimMilestoneFunds", [0]);
      await actor.setReenter(target, claim);

      await actor.execute(target, claim);
      expect(await actor.reenterAttempts()).to.equal(1n);
      expect(await actor.reenterSucceeded()).to.equal(false);
      expect(await ethers.provider.getBalance(actor)).to.equal(eth("3"));
      expect(await campaign.totalReleased()).to.equal(eth("3"));
    });

    async function contractContributor() {
      const ctx = await fundraising();
      const { campaign, alice } = ctx;
      const actor = await (await ethers.getContractFactory("MockActor")).deploy();
      const target = await campaign.getAddress();
      const ci = campaign.interface;
      await actor.execute(target, ci.encodeFunctionData("contribute"), { value: eth("2") });
      await campaign.connect(alice).contribute({ value: eth("1") });
      await endFundraising(campaign);
      return { ...ctx, actor, target, ci };
    }

    it("blocks a contributor re-entering claimRefund", async () => {
      const { campaign, actor, target, ci } = await loadFixture(contractContributor);
      const refund = ci.encodeFunctionData("claimRefund");
      await actor.setReenter(target, refund);

      await actor.execute(target, refund);
      expect(await actor.reenterAttempts()).to.equal(1n);
      expect(await actor.reenterSucceeded()).to.equal(false);
      expect(await ethers.provider.getBalance(actor)).to.equal(eth("2"));
      expect(await ethers.provider.getBalance(campaign)).to.equal(eth("1"));
    });

    it("keeps a refund available when the contributor's wallet refuses ETH", async () => {
      const { campaign, actor, target, ci } = await loadFixture(contractContributor);
      const refund = ci.encodeFunctionData("claimRefund");
      await actor.setMode(1);
      await expect(actor.execute(target, refund)).to.be.revertedWithCustomError(campaign, "TransferFailed");
      expect(await campaign.refundClaimed(await actor.getAddress())).to.equal(false);
      expect(await campaign.totalRefunded()).to.equal(0n);

      await actor.setMode(0);
      await actor.execute(target, refund);
      expect(await campaign.refundClaimed(await actor.getAddress())).to.equal(true);
    });
  });

  describe("failed-campaign refunds", () => {
    it("refunds each contributor exactly what they contributed", async () => {
      const { campaign, alice, bob } = await loadFixture(failed);
      expect(await campaign.refundableOf(alice.address)).to.equal(eth("3"));

      const refund = await campaign.connect(alice).claimRefund();
      await expect(refund).to.emit(campaign, "RefundClaimed").withArgs(alice.address, eth("3"));
      await expect(refund).to.changeEtherBalances([campaign, alice], [-eth("3"), eth("3")]);
      await expect(campaign.connect(bob).claimRefund()).to.changeEtherBalances([campaign, bob], [-eth("1"), eth("1")]);

      expect(await campaign.totalRefunded()).to.equal(eth("4"));
      expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
    });

    it("rejects non-contributors, including the creator", async () => {
      const { campaign, outsider, creator } = await loadFixture(failed);
      await expect(campaign.connect(outsider).claimRefund()).to.be.revertedWithCustomError(campaign, "NotAContributor");
      await expect(campaign.connect(creator).claimRefund()).to.be.revertedWithCustomError(campaign, "NotAContributor");
    });

    it("rejects a double refund", async () => {
      const { campaign, alice } = await loadFixture(failed);
      await campaign.connect(alice).claimRefund();
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundAlreadyClaimed");
      expect(await campaign.refundableOf(alice.address)).to.equal(0n);
    });

    it("is unavailable until the campaign is finalized as failed", async () => {
      const { campaign, alice } = await loadFixture(fundraising);
      await campaign.connect(alice).contribute({ value: eth("1") });
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundNotAvailable");
      await time.increaseTo(await campaign.deadline());
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundNotAvailable");
      await campaign.finalize();
      await expect(campaign.connect(alice).claimRefund()).to.emit(campaign, "RefundClaimed");
    });

    it("is unavailable on a successful campaign", async () => {
      const { campaign, alice } = await loadFixture(milestonePhase);
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundNotAvailable");
    });

    it("refuses to pay more than the contract holds", async () => {
      const { campaign, alice } = await loadFixture(failed);
      await setBalance(await campaign.getAddress(), eth("1"));
      await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "InsufficientContractBalance");
      expect(await campaign.refundClaimed(alice.address)).to.equal(false);
    });

    it("ignores ETH force-fed to the contract when computing refunds", async () => {
      const { campaign, alice, bob } = await loadFixture(failed);
      await setBalance(await campaign.getAddress(), eth("50"));
      await campaign.connect(alice).claimRefund();
      await campaign.connect(bob).claimRefund();
      expect(await campaign.totalRefunded()).to.equal(eth("4"));
    });
  });

  describe("cancellation", () => {
    it("is not allowed while fundraising or after failure", async () => {
      const a = await loadFixture(fundraising);
      await expect(a.campaign.connect(a.creator).cancelCampaign()).to.be.revertedWithCustomError(a.campaign, "CancellationNotAllowed");
      const b = await loadFixture(failed);
      await expect(b.campaign.connect(b.creator).cancelCampaign()).to.be.revertedWithCustomError(b.campaign, "CancellationNotAllowed");
    });

    it("cannot be used to escape an open or unresolved vote", async () => {
      const { campaign, creator, alice, outsider } = await loadFixture(milestonePhase);
      await campaign.connect(creator).submitMilestoneEvidence(0, "x");
      await expect(campaign.connect(creator).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await campaign.connect(alice).vote(0, false);
      await time.increase(VOTING_PERIOD);
      await expect(campaign.connect(outsider).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
    });

    it("can be triggered by anyone after a rejection", async () => {
      const { campaign, creator, alice, outsider } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, [[alice, false]]);
      await expect(campaign.connect(outsider).cancelCampaign())
        .to.emit(campaign, "CampaignCancelled")
        .withArgs(outsider.address, Reason.MilestoneRejected, eth("10"));
      expect(await campaign.state()).to.equal(State.Cancelled);
    });

    it("can be triggered by anyone after an expired vote", async () => {
      const { campaign, creator, outsider } = await loadFixture(milestonePhase);
      await runVote(campaign, creator, []);
      await expect(campaign.connect(outsider).cancelCampaign())
        .to.emit(campaign, "CampaignCancelled")
        .withArgs(outsider.address, Reason.MilestoneExpired, eth("10"));
    });

    it("lets the creator give up while the current milestone is pending, but nobody else", async () => {
      const { campaign, creator, alice } = await loadFixture(milestonePhase);
      await expect(campaign.connect(alice).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await expect(campaign.connect(creator).cancelCampaign())
        .to.emit(campaign, "CampaignCancelled")
        .withArgs(creator.address, Reason.CreatorCancelled, eth("10"));
    });

    it("lets anyone cancel when the creator misses the submission window", async () => {
      const { campaign, outsider } = await loadFixture(milestonePhase);
      await time.increase(SUBMISSION_WINDOW - 2);
      await expect(campaign.connect(outsider).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await time.increase(2);
      await expect(campaign.connect(outsider).cancelCampaign())
        .to.emit(campaign, "CampaignCancelled")
        .withArgs(outsider.address, Reason.SubmissionWindowMissed, eth("10"));
    });

    it("restarts the submission window after each approval", async () => {
      const { campaign, creator, alice, outsider } = await loadFixture(milestonePhase);
      await time.increase(SUBMISSION_WINDOW - 10 * DAY);
      await runVote(campaign, creator, [[alice, true]]);
      await time.increase(20 * DAY);
      await expect(campaign.connect(outsider).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await expect(campaign.connect(creator).submitMilestoneEvidence(1, "y")).to.emit(campaign, "MilestoneEvidenceSubmitted");
    });

    it("cannot happen twice, and blocks further milestones", async () => {
      const { campaign, creator } = await loadFixture(milestonePhase);
      await campaign.connect(creator).cancelCampaign();
      await expect(campaign.connect(creator).cancelCampaign()).to.be.revertedWithCustomError(campaign, "CancellationNotAllowed");
      await expect(campaign.connect(creator).submitMilestoneEvidence(0, "x")).to.be.revertedWithCustomError(campaign, "MilestonePhaseNotActive");
      await expect(campaign.resolveMilestone()).to.be.revertedWithCustomError(campaign, "MilestonePhaseNotActive");
    });

    describe("proportional refunds", () => {
      it("shares the whole balance when nothing was released", async () => {
        const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
        await campaign.connect(creator).cancelCampaign();
        await expect(campaign.connect(alice).claimRefund()).to.changeEtherBalance(alice, eth("6"));
        await expect(campaign.connect(bob).claimRefund()).to.changeEtherBalance(bob, eth("3"));
        await expect(campaign.connect(carol).claimRefund()).to.changeEtherBalance(carol, eth("1"));
        expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
      });

      it("excludes funds already released: only the remainder is refundable", async () => {
        const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
        await runVote(campaign, creator, [[alice, true]]); // 30% approved
        await campaign.connect(creator).claimMilestoneFunds(0);
        await runVote(campaign, creator, [[alice, false]]); // second milestone rejected
        await campaign.cancelCampaign();

        expect(await campaign.refundPool()).to.equal(eth("7"));
        await expect(campaign.connect(alice).claimRefund()).to.changeEtherBalance(alice, eth("4.2"));
        await expect(campaign.connect(bob).claimRefund()).to.changeEtherBalance(bob, eth("2.1"));
        await expect(campaign.connect(carol).claimRefund()).to.changeEtherBalance(carol, eth("0.7"));
        expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
        expect(await campaign.totalReleased() + (await campaign.totalRefunded())).to.equal(eth("10"));
      });

      it("reserves an approved but unclaimed allocation for the creator", async () => {
        const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
        await runVote(campaign, creator, [[alice, true]]); // approved, not claimed yet
        await campaign.connect(creator).cancelCampaign();

        expect(await campaign.refundPool()).to.equal(eth("7"));
        for (const wallet of [alice, bob, carol]) await campaign.connect(wallet).claimRefund();
        expect(await ethers.provider.getBalance(campaign)).to.equal(eth("3"));

        // Order must not matter: contributors cannot drain the creator's approved share.
        await expect(campaign.connect(creator).claimMilestoneFunds(0)).to.changeEtherBalance(creator, eth("3"));
        expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
      });

      it("prevents the creator taking unreleased funds after cancellation", async () => {
        const { campaign, creator, alice } = await loadFixture(milestonePhase);
        await runVote(campaign, creator, [[alice, true]]);
        await campaign.connect(creator).claimMilestoneFunds(0);
        await campaign.connect(creator).cancelCampaign();
        await expect(campaign.connect(creator).claimMilestoneFunds(1)).to.be.revertedWithCustomError(campaign, "MilestoneNotApproved");
        await expect(campaign.connect(creator).claimRefund()).to.be.revertedWithCustomError(campaign, "NotAContributor");
      });

      it("treats a creator who contributed like any contributor, for their own share only", async () => {
        const { campaign, creator, alice } = await loadFixture(fundraising);
        await campaign.connect(creator).contribute({ value: eth("5") });
        await campaign.connect(alice).contribute({ value: eth("5") });
        await endFundraising(campaign);
        await campaign.connect(creator).cancelCampaign();
        await expect(campaign.connect(creator).claimRefund()).to.changeEtherBalance(creator, eth("5"));
        await expect(campaign.connect(alice).claimRefund()).to.changeEtherBalance(alice, eth("5"));
      });

      it("gives rounding dust to the last claimer, so the pool pays out exactly", async () => {
        const [, creator, alice, bob, carol] = await ethers.getSigners();
        const factory = await (await ethers.getContractFactory("FundFlowFactory")).deploy();
        const campaign = await createCampaign(factory, creator, {
          fundingTarget: 1,
          milestoneDescriptions: ["a", "b"],
          milestoneAllocationsBps: [3333, 6667],
        });
        await campaign.connect(alice).contribute({ value: 1000n });
        await campaign.connect(bob).contribute({ value: 1000n });
        await campaign.connect(carol).contribute({ value: 1001n });
        await endFundraising(campaign);

        await runVote(campaign, creator, [[alice, true]]);
        await campaign.connect(creator).claimMilestoneFunds(0);
        await campaign.connect(creator).cancelCampaign();

        const raised = 3001n;
        const released = (raised * 3333n) / 10000n;
        const pool = raised - released;
        expect(await campaign.refundPool()).to.equal(pool);

        const floorShare = (contribution: bigint) => (contribution * pool) / raised;
        await expect(campaign.connect(alice).claimRefund()).to.emit(campaign, "RefundClaimed").withArgs(alice.address, floorShare(1000n));
        await expect(campaign.connect(bob).claimRefund()).to.emit(campaign, "RefundClaimed").withArgs(bob.address, floorShare(1000n));

        const lastShare = pool - 2n * floorShare(1000n);
        expect(lastShare).to.be.greaterThan(floorShare(1001n)); // the case really does produce dust
        expect(lastShare - floorShare(1001n)).to.be.lessThan(3n); // at most (contributors - 1) wei
        expect(await campaign.refundableOf(carol.address)).to.equal(lastShare);
        await expect(campaign.connect(carol).claimRefund()).to.emit(campaign, "RefundClaimed").withArgs(carol.address, lastShare);

        expect(await campaign.totalRefunded()).to.equal(pool);
        expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
      });

      it("never pays out more than the pool, whatever the claim order", async () => {
        const { campaign, creator, alice, bob, carol } = await loadFixture(milestonePhase);
        await runVote(campaign, creator, [[alice, true]]);
        await campaign.connect(creator).claimMilestoneFunds(0);
        await campaign.connect(creator).cancelCampaign();
        const pool = await campaign.refundPool();
        for (const wallet of [carol, alice, bob]) {
          await campaign.connect(wallet).claimRefund();
          expect(await campaign.totalRefunded()).to.be.lessThanOrEqual(pool);
        }
        await expect(campaign.connect(alice).claimRefund()).to.be.revertedWithCustomError(campaign, "RefundAlreadyClaimed");
        expect(await ethers.provider.getBalance(campaign)).to.equal(0n);
      });
    });
  });

  describe("views", () => {
    it("reports a contributor's position", async () => {
      const { campaign, alice, outsider } = await loadFixture(failed);
      let position = await campaign.positionOf(alice.address);
      expect(position.contribution).to.equal(eth("3"));
      expect(position.refundable).to.equal(eth("3"));
      expect(position.refundClaimed).to.equal(false);

      await campaign.connect(alice).claimRefund();
      position = await campaign.positionOf(alice.address);
      expect(position.refundClaimed).to.equal(true);
      expect(position.refundPaid).to.equal(eth("3"));
      expect(position.refundable).to.equal(0n);

      expect((await campaign.positionOf(outsider.address)).contribution).to.equal(0n);
    });

    it("reports no refund before refunds open", async () => {
      const { campaign, alice } = await loadFixture(milestonePhase);
      expect(await campaign.refundableOf(alice.address)).to.equal(0n);
    });
  });
});
