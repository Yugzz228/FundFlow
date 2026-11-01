// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Limits shared by the campaign and the factory (which exposes them to the frontend).
uint256 constant BPS_DENOMINATOR = 10_000; // 10,000 basis points = 100%
uint256 constant APPROVAL_THRESHOLD_BPS = 6_000; // 60% of participating voting weight
uint256 constant MAX_MILESTONES = 10;
uint256 constant MIN_VOTING_PERIOD = 5 minutes;
uint256 constant MAX_VOTING_PERIOD = 30 days;
uint256 constant MAX_FUNDRAISING_DURATION = 365 days;
// How long the creator has to submit evidence for the current milestone before
// anyone may cancel the campaign. Without this, a silent creator could lock funds forever.
uint256 constant SUBMISSION_WINDOW = 90 days;
uint256 constant MAX_TITLE_LENGTH = 120;
uint256 constant MAX_DESCRIPTION_LENGTH = 2_000;
uint256 constant MAX_URL_LENGTH = 512;
uint256 constant MAX_MILESTONE_TEXT_LENGTH = 500;

/// @title FundFlowCampaign
/// @notice Holds the funds of one crowdfunding campaign and enforces its whole lifecycle:
///         fundraising -> finalization -> milestone evidence -> contributor vote -> release,
///         or refund if the campaign fails or is cancelled.
/// @dev Not professionally audited. Built for a local development network and test ETH only.
///      `contributions` and `totalRaised` freeze when fundraising ends, so voting weights and
///      refund shares cannot be changed afterwards.
contract FundFlowCampaign is ReentrancyGuard {
    enum CampaignState {
        Fundraising, // accepting contributions until the deadline
        MilestonePhase, // target reached; funds released milestone by milestone
        Failed, // target missed; contributors may claim full refunds
        Cancelled, // stopped during the milestone phase; remaining funds refundable
        Completed // every milestone approved
    }

    enum MilestoneStatus {
        Pending, // no evidence submitted yet
        Voting, // evidence submitted; vote open or awaiting resolution
        Approved, // reached the threshold; allocation is claimable by the creator
        Rejected, // votes were cast but the threshold was not reached
        Expired // voting ended with no votes at all
    }

    enum CancelReason {
        MilestoneRejected,
        MilestoneExpired,
        SubmissionWindowMissed,
        CreatorCancelled
    }

    struct CampaignParams {
        string title;
        string description;
        string imageUrl; // optional; recorded as-is, the content behind it is not immutable
        uint256 fundingTarget; // wei
        uint256 deadline; // unix timestamp
        uint256 votingPeriod; // seconds each milestone vote stays open
        string[] milestoneDescriptions;
        // Share of the total raised per milestone, in basis points. Integer basis points avoid
        // fractions: 3000 + 3000 + 4000 = 10000 means 30%, 30% and 40% of whatever is raised.
        uint16[] milestoneAllocationsBps;
    }

    struct Milestone {
        string description;
        string evidence;
        uint16 allocationBps;
        MilestoneStatus status;
        bool fundsClaimed; // approval and transfer are separate steps
        uint64 submittedAt;
        uint64 votingDeadline;
        uint64 resolvedAt;
        uint256 approveWeight;
        uint256 rejectWeight;
    }

    struct Summary {
        address creator;
        string title;
        string description;
        string imageUrl;
        uint256 fundingTarget;
        uint256 deadline;
        uint256 votingPeriod;
        CampaignState state;
        uint256 totalRaised;
        uint256 contributorCount;
        uint256 creatorContribution;
        uint256 milestoneCount;
        uint256 currentMilestone;
        uint256 currentMilestoneStartedAt;
        uint256 totalApproved;
        uint256 totalReleased;
        uint256 refundPool;
        uint256 totalRefunded;
        uint256 refundsClaimed;
        uint256 createdAt;
    }

    struct Position {
        uint256 contribution;
        bool refundClaimed;
        uint256 refundPaid;
        uint256 refundable; // what claimRefund would pay right now
    }

    address public immutable factory;
    address public immutable creator;
    uint256 public immutable fundingTarget;
    uint256 public immutable deadline;
    uint256 public immutable votingPeriod;
    uint256 public immutable createdAt;

    string public title;
    string public description;
    string public imageUrl;

    CampaignState public state;
    Milestone[] private _milestones;
    uint256 public currentMilestone;
    uint256 public currentMilestoneStartedAt;

    mapping(address => uint256) public contributions;
    uint256 public totalRaised;
    uint256 public contributorCount;

    uint256 public totalApproved; // sum of allocations of approved milestones (claimed or not)
    uint256 public totalReleased; // sum actually transferred to the creator

    uint256 public refundPool; // total refundable, fixed when the campaign fails or is cancelled
    uint256 public totalRefunded;
    uint256 public refundsClaimed; // number of contributors who have claimed
    mapping(address => bool) public refundClaimed;
    mapping(address => uint256) public refundPaid;

    // milestone index => voter => 0 (not voted), 1 (approve), 2 (reject)
    mapping(uint256 => mapping(address => uint8)) public voteOf;

    event ContributionReceived(address indexed contributor, uint256 amount, uint256 contributorTotal, uint256 totalRaised);
    event CampaignFinalized(bool indexed successful, uint256 totalRaised);
    event MilestoneEvidenceSubmitted(uint256 indexed milestoneIndex, address indexed creator, string evidence, uint256 votingDeadline);
    event VoteCast(uint256 indexed milestoneIndex, address indexed voter, bool approve, uint256 weight);
    event MilestoneApproved(uint256 indexed milestoneIndex, uint256 approveWeight, uint256 rejectWeight, uint256 claimableAmount);
    event MilestoneRejected(uint256 indexed milestoneIndex, uint256 approveWeight, uint256 rejectWeight);
    event MilestoneExpired(uint256 indexed milestoneIndex);
    event MilestoneFundsClaimed(uint256 indexed milestoneIndex, address indexed creator, uint256 amount);
    event CampaignCompleted(uint256 totalApproved);
    event CampaignCancelled(address indexed caller, CancelReason reason, uint256 refundPool);
    event RefundClaimed(address indexed contributor, uint256 amount);

    error ZeroFundingTarget();
    error InvalidDeadline();
    error EmptyTitle();
    error EmptyDescription();
    error TextTooLong();
    error InvalidVotingPeriod();
    error InvalidMilestoneCount();
    error MilestoneArrayMismatch();
    error EmptyMilestoneDescription();
    error ZeroMilestoneAllocation();
    error AllocationsMustTotal100Percent();

    error NotCreator();
    error NotAcceptingContributions();
    error ZeroContribution();
    error FundraisingEnded();
    error AlreadyFinalized();
    error DeadlineNotReached();
    error MilestonePhaseNotActive();
    error InvalidMilestone();
    error MilestoneAlreadySubmitted();
    error MilestoneOutOfOrder();
    error SubmissionWindowClosed();
    error EmptyEvidence();
    error VotingNotOpen();
    error VotingEnded();
    error CreatorCannotVote();
    error NotAContributor();
    error AlreadyVoted();
    error VotingStillOpen();
    error MilestoneNotApproved();
    error FundsAlreadyClaimed();
    error CancellationNotAllowed();
    error RefundNotAvailable();
    error RefundAlreadyClaimed();
    error InsufficientContractBalance();
    error TransferFailed();

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    /// @param creator_ The wallet that called the factory; never read from tx.origin.
    constructor(address creator_, CampaignParams memory params) {
        if (params.fundingTarget == 0) revert ZeroFundingTarget();
        if (params.deadline <= block.timestamp || params.deadline > block.timestamp + MAX_FUNDRAISING_DURATION) {
            revert InvalidDeadline();
        }
        if (bytes(params.title).length == 0) revert EmptyTitle();
        if (bytes(params.description).length == 0) revert EmptyDescription();
        if (
            bytes(params.title).length > MAX_TITLE_LENGTH ||
            bytes(params.description).length > MAX_DESCRIPTION_LENGTH ||
            bytes(params.imageUrl).length > MAX_URL_LENGTH
        ) revert TextTooLong();
        if (params.votingPeriod < MIN_VOTING_PERIOD || params.votingPeriod > MAX_VOTING_PERIOD) {
            revert InvalidVotingPeriod();
        }

        uint256 count = params.milestoneDescriptions.length;
        if (count == 0 || count > MAX_MILESTONES) revert InvalidMilestoneCount();
        if (count != params.milestoneAllocationsBps.length) revert MilestoneArrayMismatch();

        uint256 allocationSum;
        for (uint256 i = 0; i < count; i++) {
            uint256 textLength = bytes(params.milestoneDescriptions[i]).length;
            if (textLength == 0) revert EmptyMilestoneDescription();
            if (textLength > MAX_MILESTONE_TEXT_LENGTH) revert TextTooLong();
            if (params.milestoneAllocationsBps[i] == 0) revert ZeroMilestoneAllocation();
            allocationSum += params.milestoneAllocationsBps[i];

            Milestone storage milestone = _milestones.push();
            milestone.description = params.milestoneDescriptions[i];
            milestone.allocationBps = params.milestoneAllocationsBps[i];
        }
        if (allocationSum != BPS_DENOMINATOR) revert AllocationsMustTotal100Percent();

        factory = msg.sender;
        creator = creator_;
        fundingTarget = params.fundingTarget;
        deadline = params.deadline;
        votingPeriod = params.votingPeriod;
        createdAt = block.timestamp;
        title = params.title;
        description = params.description;
        imageUrl = params.imageUrl;
    }

    // ---------------------------------------------------------------------
    // Fundraising
    // ---------------------------------------------------------------------

    /// @notice Contribute test ETH. Funds stay locked in this contract. Contributions above the
    ///         target are accepted until the deadline and are governed by the same rules.
    function contribute() external payable {
        if (state != CampaignState.Fundraising) revert NotAcceptingContributions();
        // Contributions are valid strictly before the deadline and finalization from the deadline
        // onward, so at any timestamp exactly one of the two is possible.
        if (block.timestamp >= deadline) revert FundraisingEnded();
        if (msg.value == 0) revert ZeroContribution();

        if (contributions[msg.sender] == 0) contributorCount++;
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit ContributionReceived(msg.sender, msg.value, contributions[msg.sender], totalRaised);
    }

    /// @notice Permissionless: anyone can settle the outcome once the deadline has passed.
    function finalize() external {
        if (state != CampaignState.Fundraising) revert AlreadyFinalized();
        if (block.timestamp < deadline) revert DeadlineNotReached();

        bool successful = totalRaised >= fundingTarget;
        if (successful) {
            state = CampaignState.MilestonePhase;
            currentMilestoneStartedAt = block.timestamp;
        } else {
            state = CampaignState.Failed;
            refundPool = totalRaised;
        }
        emit CampaignFinalized(successful, totalRaised);
    }

    // ---------------------------------------------------------------------
    // Milestones and governance
    // ---------------------------------------------------------------------

    /// @notice Submit the evidence reference for the current milestone and open its vote.
    ///         Each milestone can be submitted once; a rejected milestone is not resubmittable.
    ///         The contract only records the reference and does not verify the content behind it.
    function submitMilestoneEvidence(uint256 milestoneIndex, string calldata evidence) external onlyCreator {
        if (state != CampaignState.MilestonePhase) revert MilestonePhaseNotActive();
        if (milestoneIndex >= _milestones.length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneAlreadySubmitted();
        if (milestoneIndex != currentMilestone) revert MilestoneOutOfOrder();
        if (block.timestamp >= currentMilestoneStartedAt + SUBMISSION_WINDOW) revert SubmissionWindowClosed();
        if (bytes(evidence).length == 0) revert EmptyEvidence();
        if (bytes(evidence).length > MAX_URL_LENGTH) revert TextTooLong();

        uint256 votingDeadline = block.timestamp + votingPeriod;
        milestone.evidence = evidence;
        milestone.status = MilestoneStatus.Voting;
        milestone.submittedAt = uint64(block.timestamp);
        milestone.votingDeadline = uint64(votingDeadline);

        emit MilestoneEvidenceSubmitted(milestoneIndex, msg.sender, evidence, votingDeadline);
    }

    /// @notice Vote on a milestone. Weight equals the voter's recorded contribution.
    ///         The creator is excluded even if they contributed, to avoid approving their own work.
    function vote(uint256 milestoneIndex, bool approve) external {
        if (milestoneIndex >= _milestones.length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Voting) revert VotingNotOpen();
        if (block.timestamp >= milestone.votingDeadline) revert VotingEnded();
        if (msg.sender == creator) revert CreatorCannotVote();

        uint256 weight = contributions[msg.sender];
        if (weight == 0) revert NotAContributor();
        if (voteOf[milestoneIndex][msg.sender] != 0) revert AlreadyVoted();

        voteOf[milestoneIndex][msg.sender] = approve ? 1 : 2;
        if (approve) {
            milestone.approveWeight += weight;
        } else {
            milestone.rejectWeight += weight;
        }

        emit VoteCast(milestoneIndex, msg.sender, approve, weight);
    }

    /// @notice Permissionless: settle the current vote. Possible once the voting deadline has
    ///         passed, or earlier if every eligible wallet has voted so the result cannot change.
    function resolveMilestone() external {
        if (state != CampaignState.MilestonePhase) revert MilestonePhaseNotActive();

        uint256 index = currentMilestone;
        Milestone storage milestone = _milestones[index];
        if (milestone.status != MilestoneStatus.Voting) revert VotingNotOpen();

        uint256 approveWeight = milestone.approveWeight;
        uint256 participating = approveWeight + milestone.rejectWeight;
        bool everyoneVoted = participating > 0 && participating == eligibleVotingWeight();
        if (block.timestamp < milestone.votingDeadline && !everyoneVoted) revert VotingStillOpen();

        milestone.resolvedAt = uint64(block.timestamp);

        if (participating == 0) {
            // No participation never counts as approval.
            milestone.status = MilestoneStatus.Expired;
            emit MilestoneExpired(index);
        } else if (approveWeight * BPS_DENOMINATOR >= participating * APPROVAL_THRESHOLD_BPS) {
            // Cross-multiplied so the 60% test needs no division and cannot round in anyone's favor.
            uint256 amount = milestoneAmount(index);
            milestone.status = MilestoneStatus.Approved;
            totalApproved += amount;
            emit MilestoneApproved(index, approveWeight, milestone.rejectWeight, amount);

            if (index + 1 == _milestones.length) {
                state = CampaignState.Completed;
                emit CampaignCompleted(totalApproved);
            } else {
                currentMilestone = index + 1;
                currentMilestoneStartedAt = block.timestamp;
            }
        } else {
            milestone.status = MilestoneStatus.Rejected;
            emit MilestoneRejected(index, approveWeight, milestone.rejectWeight);
        }
    }

    /// @notice Claim the allocation of an approved milestone. Approval only makes funds claimable;
    ///         this is the step that transfers them. Stays available after a later cancellation,
    ///         because refunds exclude approved allocations.
    function claimMilestoneFunds(uint256 milestoneIndex) external onlyCreator nonReentrant {
        if (milestoneIndex >= _milestones.length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Approved) revert MilestoneNotApproved();
        if (milestone.fundsClaimed) revert FundsAlreadyClaimed();

        uint256 amount = milestoneAmount(milestoneIndex);
        if (amount > address(this).balance) revert InsufficientContractBalance();

        // Checks-effects-interactions: state changes before the external call. If the transfer
        // fails the whole transaction reverts, so the claim stays available.
        milestone.fundsClaimed = true;
        totalReleased += amount;

        emit MilestoneFundsClaimed(milestoneIndex, msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Cancellation and refunds
    // ---------------------------------------------------------------------

    /// @notice Stop the campaign and open proportional refunds of all unapproved funds.
    ///         Allowed when:
    ///         - the current milestone was rejected or expired (anyone may call);
    ///         - the creator missed the submission window for the current milestone (anyone);
    ///         - the creator gives up while the current milestone is still pending (creator only).
    ///         Never allowed during an open or unresolved vote, so a vote cannot be escaped.
    function cancelCampaign() external {
        if (state != CampaignState.MilestonePhase) revert CancellationNotAllowed();

        MilestoneStatus status = _milestones[currentMilestone].status;
        CancelReason reason;
        if (status == MilestoneStatus.Rejected) {
            reason = CancelReason.MilestoneRejected;
        } else if (status == MilestoneStatus.Expired) {
            reason = CancelReason.MilestoneExpired;
        } else if (status == MilestoneStatus.Pending && msg.sender == creator) {
            reason = CancelReason.CreatorCancelled;
        } else if (status == MilestoneStatus.Pending && block.timestamp >= currentMilestoneStartedAt + SUBMISSION_WINDOW) {
            reason = CancelReason.SubmissionWindowMissed;
        } else {
            revert CancellationNotAllowed();
        }

        state = CampaignState.Cancelled;
        // Approved allocations belong to the creator whether or not they have been claimed yet,
        // so everything else is what contributors share.
        refundPool = totalRaised - totalApproved;

        emit CampaignCancelled(msg.sender, reason, refundPool);
    }

    /// @notice Claim a refund from a failed or cancelled campaign. See refundableOf for the formula.
    function claimRefund() external nonReentrant {
        if (state != CampaignState.Failed && state != CampaignState.Cancelled) revert RefundNotAvailable();
        if (contributions[msg.sender] == 0) revert NotAContributor();
        if (refundClaimed[msg.sender]) revert RefundAlreadyClaimed();

        uint256 amount = _refundEntitlement(msg.sender);
        if (amount > address(this).balance) revert InsufficientContractBalance();

        refundClaimed[msg.sender] = true;
        refundPaid[msg.sender] = amount;
        totalRefunded += amount;
        refundsClaimed++;

        emit RefundClaimed(msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Wei allocated to a milestone, based on the final amount raised.
    /// @dev Earlier milestones round down; the last one takes the remainder, so milestone amounts
    ///      always add up to exactly totalRaised and no release dust is left behind.
    function milestoneAmount(uint256 milestoneIndex) public view returns (uint256) {
        if (milestoneIndex >= _milestones.length) revert InvalidMilestone();

        if (milestoneIndex + 1 < _milestones.length) {
            return (totalRaised * _milestones[milestoneIndex].allocationBps) / BPS_DENOMINATOR;
        }
        uint256 allocatedToEarlier;
        for (uint256 i = 0; i < milestoneIndex; i++) {
            allocatedToEarlier += (totalRaised * _milestones[i].allocationBps) / BPS_DENOMINATOR;
        }
        return totalRaised - allocatedToEarlier;
    }

    /// @notice Total voting weight in the campaign: everything raised, minus the creator's own
    ///         contribution because the creator cannot vote.
    function eligibleVotingWeight() public view returns (uint256) {
        return totalRaised - contributions[creator];
    }

    /// @notice What the creator could claim right now across approved milestones.
    function claimableByCreator() external view returns (uint256) {
        return totalApproved - totalReleased;
    }

    /// @notice What claimRefund would currently pay `contributor`.
    function refundableOf(address contributor) public view returns (uint256) {
        if (state != CampaignState.Failed && state != CampaignState.Cancelled) return 0;
        if (contributions[contributor] == 0 || refundClaimed[contributor]) return 0;
        return _refundEntitlement(contributor);
    }

    function positionOf(address contributor) external view returns (Position memory) {
        return Position({
            contribution: contributions[contributor],
            refundClaimed: refundClaimed[contributor],
            refundPaid: refundPaid[contributor],
            refundable: refundableOf(contributor)
        });
    }

    function getMilestones() external view returns (Milestone[] memory) {
        return _milestones;
    }

    function getMilestoneAmounts() external view returns (uint256[] memory amounts) {
        amounts = new uint256[](_milestones.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            amounts[i] = milestoneAmount(i);
        }
    }

    function getSummary() external view returns (Summary memory) {
        return Summary({
            creator: creator,
            title: title,
            description: description,
            imageUrl: imageUrl,
            fundingTarget: fundingTarget,
            deadline: deadline,
            votingPeriod: votingPeriod,
            state: state,
            totalRaised: totalRaised,
            contributorCount: contributorCount,
            creatorContribution: contributions[creator],
            milestoneCount: _milestones.length,
            currentMilestone: currentMilestone,
            currentMilestoneStartedAt: currentMilestoneStartedAt,
            totalApproved: totalApproved,
            totalReleased: totalReleased,
            refundPool: refundPool,
            totalRefunded: totalRefunded,
            refundsClaimed: refundsClaimed,
            createdAt: createdAt
        });
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Refund formula: contribution * refundPool / totalRaised, rounded down. In a failed
    ///      campaign refundPool == totalRaised, so this is exactly the contribution. Rounding
    ///      dust goes to the last contributor to claim, who receives whatever remains of the
    ///      pool; total refunds therefore equal the pool exactly and can never exceed it.
    function _refundEntitlement(address contributor) private view returns (uint256) {
        if (refundsClaimed + 1 == contributorCount) {
            return refundPool - totalRefunded;
        }
        return (contributions[contributor] * refundPool) / totalRaised;
    }

    function _sendEth(address to, uint256 amount) private {
        // A low-level call is the recommended way to send ETH: transfer() forwards a fixed gas
        // stipend that smart-contract wallets may exceed. Reentrancy is covered by nonReentrant
        // on the callers and by updating state first.
        (bool sent, ) = payable(to).call{value: amount}("");
        if (!sent) revert TransferFailed();
    }
}
