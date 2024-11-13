// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStabilityPool {
    struct UserInfo {
        uint256 stake; // User's raw stake amount
        uint256 rewardSnapshot; // Rewards already paid out to the user
        uint256 collateralSnapshot; // Collateral already paid out to the user
        uint256 cumulativeProductScalingFactor; // User's scaling factor at last update
        uint256 stakeResetCount; // User's stake reset count at last update
    }

    struct StakeResetSnapshot {
        uint256 scalingFactor;
        uint256 totalRewardPerToken;
        uint256 totalCollateralPerToken;
        uint256 totalSBRRewardPerToken;
    }

    function stake(uint256 _amount) external;

    function stake(uint256 _amount, address _frontend, uint256 fee) external;

    function unstake(uint256 _amount) external;

    function unstake(uint256 _amount, address _frontend, uint256 fee) external;

    function claim() external;

    function claim(address _frontend, uint256 fee) external;

    function isLiquidationPossible(uint256 amount) external view returns (bool);

    function performLiquidation(
        uint256 amount,
        uint256 collateral
    ) external payable returns (bool);

    function addReward(uint256 _amount) external returns (bool);

    function addCollateralReward(
        uint256 _amount
    ) external payable returns (bool);

    function getUser(address user) external returns (UserInfo memory userInfo);

    function userPendingReward(address user) external view returns (uint256);

    function userPendingCollateral(
        address user
    ) external view returns (uint256);

    // Events
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardAdded(uint256 amount);
    event CollateralRewardAdded(uint256 amount);
    event RewardClaimed(
        address indexed user,
        uint256 amount,
        uint256 collateral
    );
    event CollateralClaimed(address indexed user, uint256 amount);
    event LiquidationPerformed(
        uint256 amount,
        uint256 collateralReceived,
        uint256 totalStaked,
        uint256 stakeScalingFactor,
        uint256 totalCollateralPerToken
    );
    event ScalingFactorReset(
        uint256 indexed stakeResetCount,
        StakeResetSnapshot snapshot
    );
    event Received(address sender, uint256 amount);
}
