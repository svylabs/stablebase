// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IStabilityPool} from "./interfaces/IStabilityPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StabilityPool is IStabilityPool, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable sbdToken;
    IERC20 public immutable collateralToken;

    uint256 public totalStaked;
    mapping(address => uint256) public userStakes;
    mapping(address => RewardSnapshot) public userRewardSnapshots;
    RewardSnapshot public globalRewardSnapshot;

    uint256 private constant PRECISION = 1e18;

    constructor(address _sbdToken, address _collateralToken) {
        sbdToken = IERC20(_sbdToken);
        collateralToken = IERC20(_collateralToken);
    }

    function stake(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        updateRewards(msg.sender);
        sbdToken.safeTransferFrom(msg.sender, address(this), _amount);
        userStakes[msg.sender] += _amount;
        totalStaked += _amount;
    }

    function unstake(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        require(userStakes[msg.sender] >= _amount, "Insufficient stake");
        updateRewards(msg.sender);
        userStakes[msg.sender] -= _amount;
        totalStaked -= _amount;
        sbdToken.safeTransfer(msg.sender, _amount);
    }

    function withdrawRewards() external override nonReentrant {
        updateRewards(msg.sender);
        uint256 sbdReward = calculateReward(
            msg.sender,
            globalRewardSnapshot.sbdRewardPerShare,
            userRewardSnapshots[msg.sender].sbdRewardPerShare
        );
        uint256 collateralReward = calculateReward(
            msg.sender,
            globalRewardSnapshot.collateralRewardPerShare,
            userRewardSnapshots[msg.sender].collateralRewardPerShare
        );

        if (sbdReward > 0) {
            sbdToken.safeTransfer(msg.sender, sbdReward);
        }
        if (collateralReward > 0) {
            collateralToken.safeTransfer(msg.sender, collateralReward);
        }

        userRewardSnapshots[msg.sender] = globalRewardSnapshot;
    }

    function addRewards(uint256 _amount) external override {
        require(_amount > 0, "Amount must be greater than 0");
        require(totalStaked > 0, "No stakes in the pool");
        sbdToken.safeTransferFrom(msg.sender, address(this), _amount);
        globalRewardSnapshot.sbdRewardPerShare +=
            (_amount * PRECISION) /
            totalStaked;
    }

    function addCollateralRewards(uint256 _amount) external override {
        require(_amount > 0, "Amount must be greater than 0");
        require(totalStaked > 0, "No stakes in the pool");
        collateralToken.safeTransferFrom(msg.sender, address(this), _amount);
        globalRewardSnapshot.collateralRewardPerShare +=
            (_amount * PRECISION) /
            totalStaked;
    }

    function getTotalStaked() external view override returns (uint256) {
        return totalStaked;
    }

    function getUserStakedAmount(
        address _user
    ) external view override returns (uint256) {
        return userStakes[_user];
    }

    function getUserRewardSnapshot(
        address _user
    ) external view override returns (RewardSnapshot memory rewardSnapshot) {
        return userRewardSnapshots[_user];
    }

    function getGlobalRewardSnapshot()
        external
        view
        override
        returns (RewardSnapshot memory rewardSnapshot)
    {
        return globalRewardSnapshot;
    }

    function updateRewards(address _user) internal {
        if (userStakes[_user] > 0) {
            uint256 sbdReward = calculateReward(
                _user,
                globalRewardSnapshot.sbdRewardPerShare,
                userRewardSnapshots[_user].sbdRewardPerShare
            );
            uint256 collateralReward = calculateReward(
                _user,
                globalRewardSnapshot.collateralRewardPerShare,
                userRewardSnapshots[_user].collateralRewardPerShare
            );

            if (sbdReward > 0 || collateralReward > 0) {
                userRewardSnapshots[_user] = globalRewardSnapshot;
            }
        } else {
            userRewardSnapshots[_user] = globalRewardSnapshot;
        }
    }

    function calculateReward(
        address _user,
        uint256 _globalRewardPerShare,
        uint256 _userRewardPerShare
    ) internal view returns (uint256) {
        return
            (userStakes[_user] *
                (_globalRewardPerShare - _userRewardPerShare)) / PRECISION;
    }
}
