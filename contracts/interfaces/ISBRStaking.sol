pragma solidity ^0.8.20;

interface ISBRStaking {
    struct Stake {
        uint256 stake; // User's raw stake amount
        uint256 rewardSnapshot; // Rewards already paid out to the user
        uint256 collateralSnapshot; // Collateral already paid out to the user
    }

    function stake(uint256 _amount) external;

    function unstake(uint256 _amount) external;

    function claim() external;

    function addReward(uint256 _amount) external;

    function addCollateralReward(uint256 _amount) external;

    function getStake(address user) external view returns (Stake memory stake);

    function userPendingReward(address user) external view returns (uint256);

    // Events
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(
        address indexed user,
        uint256 rewardAmount,
        uint256 collateralReward
    );
    event RewardAdded(uint256 amount);
    event CollateralRewardAdded(uint256 amount);
}
