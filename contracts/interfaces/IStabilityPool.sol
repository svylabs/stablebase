// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IStabilityPool {
    struct RewardSnapshot {
        uint256 sbdRewardPerShare;
        uint256 collateralRewardPerShare;
    }

    struct UserStake {
        uint256 amount;
        uint256 scaledAmount;
        uint256 snapshotTotalBorrowedSBD;
    }

    function stake(uint256 _amount) external;

    function unstake(uint256 _amount) external;

    function withdrawRewards() external;

    function addRewards(uint256 _amount) external;

    function addCollateralRewards(uint256 _amount) external;

    function getTotalStaked() external view returns (uint256);

    function getUserStakedAmount(address _user) external view returns (uint256);

    function getUserRewardSnapshot(
        address _user
    ) external view returns (RewardSnapshot memory rewardSnapshot);

    function getGlobalRewardSnapshot()
        external
        view
        returns (RewardSnapshot memory rewardSnapshot);

    function getUserStake(
        address _user
    ) external view returns (UserStake memory);
}
