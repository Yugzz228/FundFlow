// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./FundFlowCampaign.sol";

/// @title FundFlowFactory
/// @notice Deploys one FundFlowCampaign per campaign and indexes them. Holds no funds and has no
///         admin: it cannot change, pause or take money from any campaign it has created.
contract FundFlowFactory {
    struct Limits {
        uint256 maxMilestones;
        uint256 bpsDenominator;
        uint256 approvalThresholdBps;
        uint256 minVotingPeriod;
        uint256 maxVotingPeriod;
        uint256 maxFundraisingDuration;
        uint256 submissionWindow;
        uint256 maxTitleLength;
        uint256 maxDescriptionLength;
        uint256 maxUrlLength;
        uint256 maxMilestoneTextLength;
    }

    address[] private _campaigns;
    mapping(address => address[]) private _campaignsByCreator;

    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        uint256 indexed campaignIndex,
        string title,
        uint256 fundingTarget,
        uint256 deadline,
        uint256 milestoneCount
    );

    /// @notice Deploy a new campaign owned by the caller. All inputs are validated by the campaign
    ///         constructor; invalid input reverts with that contract's custom errors.
    function createCampaign(FundFlowCampaign.CampaignParams calldata params) external returns (address campaign) {
        campaign = address(new FundFlowCampaign(msg.sender, params));

        uint256 campaignIndex = _campaigns.length;
        _campaigns.push(campaign);
        _campaignsByCreator[msg.sender].push(campaign);

        emit CampaignCreated(
            campaign,
            msg.sender,
            campaignIndex,
            params.title,
            params.fundingTarget,
            params.deadline,
            params.milestoneDescriptions.length
        );
    }

    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaigns() external view returns (address[] memory) {
        return _campaigns;
    }

    function getCampaignsByCreator(address creator) external view returns (address[] memory) {
        return _campaignsByCreator[creator];
    }

    /// @notice The rules every campaign is held to, so the frontend validates against the same values.
    function limits() external pure returns (Limits memory) {
        return Limits({
            maxMilestones: MAX_MILESTONES,
            bpsDenominator: BPS_DENOMINATOR,
            approvalThresholdBps: APPROVAL_THRESHOLD_BPS,
            minVotingPeriod: MIN_VOTING_PERIOD,
            maxVotingPeriod: MAX_VOTING_PERIOD,
            maxFundraisingDuration: MAX_FUNDRAISING_DURATION,
            submissionWindow: SUBMISSION_WINDOW,
            maxTitleLength: MAX_TITLE_LENGTH,
            maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
            maxUrlLength: MAX_URL_LENGTH,
            maxMilestoneTextLength: MAX_MILESTONE_TEXT_LENGTH
        });
    }
}
