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
    uint256 public totalBorrowedSBD;
    mapping(address => UserStake) public userStakes;
    mapping(address => RewardSnapshot) public userRewardSnapshots;
    RewardSnapshot public globalRewardSnapshot;

    uint256 private constant PRECISION = 1e18;

    // Events
    event Staked(address indexed user, uint256 amount);
    event Unstaked(
        address indexed user,
        uint256 requestedAmount,
        uint256 actualAmount
    );
    event RewardPaid(
        address indexed user,
        uint256 sbdReward,
        uint256 collateralReward
    );
    event SBDRewardsAdded(uint256 amount);
    event CollateralRewardsAdded(uint256 amount);
    event SBDBorrowed(uint256 amount);

    constructor(address _sbdToken, address _collateralToken) {
        sbdToken = IERC20(_sbdToken);
        collateralToken = IERC20(_collateralToken);
    }

    function stake(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");

        _updateAndTransferRewards(msg.sender);

        sbdToken.safeTransferFrom(msg.sender, address(this), _amount);

        userStakes[msg.sender].amount += _amount;
        userStakes[msg.sender].snapshotTotalBorrowedSBD = totalBorrowedSBD;
        totalStaked += _amount;

        emit Staked(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external override nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        require(userStakes[msg.sender].amount >= _amount, "Insufficient stake");

        _updateAndTransferRewards(msg.sender);

        uint256 availableToUnstake = _calculateAvailableToUnstake(
            msg.sender,
            _amount
        );
        require(availableToUnstake > 0, "No available SBD to unstake");

        userStakes[msg.sender].amount -= _amount;
        totalStaked -= _amount;

        sbdToken.safeTransfer(msg.sender, availableToUnstake);

        // Update the snapshot after unstaking
        userStakes[msg.sender].snapshotTotalBorrowedSBD = totalBorrowedSBD;

        emit Unstaked(msg.sender, _amount, availableToUnstake);
    }

    function withdrawRewards() external override nonReentrant {
        _updateAndTransferRewards(msg.sender);
    }

    function addRewards(uint256 _amount) external override {
        require(_amount > 0, "Amount must be greater than 0");
        require(totalStaked > 0, "No stakes in the pool");
        globalRewardSnapshot.sbdRewardPerShare +=
            (_amount * PRECISION) /
            totalStaked;

        emit SBDRewardsAdded(_amount);
    }

    function addCollateralRewards(uint256 _amount) external override {
        require(_amount > 0, "Amount must be greater than 0");
        require(totalStaked > 0, "No stakes in the pool");
        globalRewardSnapshot.collateralRewardPerShare +=
            (_amount * PRECISION) /
            totalStaked;

        emit CollateralRewardsAdded(_amount);
    }

    function borrowSBD(uint256 _amount) external {
        require(msg.sender == address(0x0), "Only StableBaseCDP can borrow");
        require(_amount > 0, "Amount must be greater than 0");
        require(
            _amount <= totalStaked - totalBorrowedSBD,
            "Insufficient SBD in pool"
        );

        totalBorrowedSBD += _amount;
        sbdToken.safeTransfer(msg.sender, _amount);

        emit SBDBorrowed(_amount);
    }

    function _calculateAvailableToUnstake(
        address _user,
        uint256 _amount
    ) internal view returns (uint256) {
        UserStake memory stake = userStakes[_user];
        uint256 borrowedSinceStake = totalBorrowedSBD -
            stake.snapshotTotalBorrowedSBD;
        if (borrowedSinceStake == 0) {
            return _amount;
        }
        uint256 availableRatio = ((stake.amount - borrowedSinceStake) *
            PRECISION) / stake.amount;
        return (_amount * availableRatio) / PRECISION;
    }

    function getUserAvailableSBD(
        address _user
    ) external view returns (uint256) {
        return _calculateAvailableToUnstake(_user, userStakes[_user].amount);
    }

    function getTotalStaked() external view override returns (uint256) {
        return totalStaked;
    }

    function getUserStakedAmount(
        address _user
    ) external view override returns (uint256) {
        return userStakes[_user].amount;
    }

    function getUserRewardSnapshot(
        address _user
    ) external view override returns (RewardSnapshot memory) {
        return userRewardSnapshots[_user];
    }

    function getUserStake(
        address _user
    ) external view returns (UserStake memory) {
        return userStakes[_user];
    }

    function getGlobalRewardSnapshot()
        external
        view
        override
        returns (RewardSnapshot memory)
    {
        return globalRewardSnapshot;
    }

    function _updateAndTransferRewards(address _user) internal {
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

        if (sbdReward > 0) {
            sbdToken.safeTransfer(_user, sbdReward);
        }
        if (collateralReward > 0) {
            collateralToken.safeTransfer(_user, collateralReward);
        }

        userRewardSnapshots[_user] = globalRewardSnapshot;

        if (sbdReward > 0 || collateralReward > 0) {
            emit RewardPaid(_user, sbdReward, collateralReward);
        }
    }

    function calculateReward(
        address _user,
        uint256 _globalRewardPerShare,
        uint256 _userRewardPerShare
    ) internal view returns (uint256) {
        return
            (userStakes[_user].amount *
                (_globalRewardPerShare - _userRewardPerShare)) / PRECISION;
    }
}
