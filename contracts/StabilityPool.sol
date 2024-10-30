// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStabilityPool.sol";

interface IMintableToken is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract StabilityPool is IStabilityPool {
    IERC20 public stakingToken; // Token that users stake and receive rewards in
    address public debtContract; // External contract to liquidate debt

    uint256 public totalStakedRaw; // Total raw tokens staked in the pool
    uint256 public totalRewardPerToken; // Accumulated rewards per token staked
    uint256 public totalCollateralPerToken; // Accumulated collateral per token staked

    uint256 public stakeScalingFactor; // Current scaling factor
    uint256 public stakeResetCount; // Number of times scaling factor has been reset

    mapping(uint256 => StakeResetSnapshot) public stakeResetSnapshots; // Cumulative product of scaling factors at each reset

    // Maintaining a separate mapping for sbrRewardSnapshots instead of in userInfo to avoid potential gas costs later on
    mapping(address => uint256) public sbrRewardSnapshots;

    uint256 public totalSbrRewardPerToken = 0;

    uint256 public constant precision = 1e18; // Precision for fixed-point calculations
    uint256 public constant minimumScalingFactor = 1e9; // Minimum scaling factor before reset

    uint256 public sbrRewardDistributionEndTime = 0;
    uint256 public lastSBRRewardDistributedTime = 0;
    enum SBRRewardDistribution {
        NOT_STARTED,
        STARTED,
        ENDED,
        CLAIMED
    }
    SBRRewardDistribution public sbrRewardDistributionStatus =
        SBRRewardDistribution.NOT_STARTED;

    /**
       Distribute SBR reward to early users for 1 year, beginning from first person that stakes SBR.
       After 1 year, distribute SBR reward to all users.
       Total supply: 365 * 24 * 60 * 60 = 31536000
       31536000 / 365 = 864000 SBR per day
       864000 / 24 = 3600 SBR per hour
       3600 / 60 = 60 SBR per minute
       60 / 60 = 1 SBR per second
    */
    uint256 public sbrDistributionRate = 1e18; // 1 SBR per second
    IMintableToken public sbrToken;
    event SBRRewardsAdded(uint256 rewardAmount, uint256 totalRewardPerToken);
    event SBRRewardClaimed(address indexed user, uint256 rewardAmount);

    mapping(address => UserInfo) public users;

    modifier onlyDebtContract() {
        require(msg.sender == debtContract, "Caller is not the debt contract");
        _;
    }

    constructor(
        address _stakingToken,
        address _debtContract,
        address _sbrToken
    ) {
        stakingToken = IERC20(_stakingToken);
        debtContract = _debtContract;
        stakeScalingFactor = precision; // Initialize scaling factor to 1 (scaled by precision)
        stakeResetCount = 0;
        sbrToken = IMintableToken(_sbrToken);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // Stake tokens
    function stake(uint256 _amount) external {
        require(_amount > 0, "Cannot stake zero tokens");
        UserInfo storage user = users[msg.sender];
        _claim(user);

        stakingToken.transferFrom(msg.sender, address(this), _amount);

        user.stake += _amount;
        totalStakedRaw += _amount;

        emit Staked(msg.sender, _amount);
    }

    // Unstake tokens
    function unstake(uint256 _amount) external {
        require(_amount > 0, "Cannot unstake zero tokens");
        UserInfo storage user = users[msg.sender];
        _claim(user);

        require(_amount <= user.stake, "Invalid unstake amount");

        user.stake -= _amount;
        totalStakedRaw -= _amount;

        stakingToken.transfer(msg.sender, _amount);

        emit Unstaked(msg.sender, _amount);
    }

    function _claim(UserInfo storage user) internal {
        if (sbrRewardDistributionStatus != SBRRewardDistribution.ENDED) {
            _addSBRRewards();
        }
        (uint256 reward, uint256 collateral, ) = _updateRewards(user);
        _updateUserStake(user);
        emit RewardClaimed(msg.sender, reward, collateral);
    }

    function _addSBRRewards() internal {
        if (sbrRewardDistributionStatus == SBRRewardDistribution.STARTED) {
            uint256 timeElapsed = block.timestamp -
                lastSBRRewardDistributedTime;
            if (block.timestamp > sbrRewardDistributionEndTime) {
                sbrRewardDistributionStatus = SBRRewardDistribution.ENDED;
                timeElapsed =
                    sbrRewardDistributionEndTime -
                    lastSBRRewardDistributedTime +
                    1;
            }
            uint256 sbrReward = timeElapsed * sbrDistributionRate;
            if (totalStakedRaw > 0) {
                totalSbrRewardPerToken +=
                    ((sbrReward * stakeScalingFactor * precision) /
                        totalStakedRaw) /
                    precision;
                emit SBRRewardsAdded(sbrReward, totalSbrRewardPerToken);
            }
            lastSBRRewardDistributedTime = block.timestamp;
        } else if (
            sbrRewardDistributionStatus == SBRRewardDistribution.NOT_STARTED
        ) {
            lastSBRRewardDistributedTime = block.timestamp;
            sbrRewardDistributionEndTime = block.timestamp + 365 days;
            sbrRewardDistributionStatus = SBRRewardDistribution.STARTED;
        }
    }

    function _claimSBRTokens(UserInfo storage user) internal {
        if (user.cumulativeProductScalingFactor != 0) {
            uint256 totalSBRRewards = ((((totalSbrRewardPerToken -
                sbrRewardSnapshots[msg.sender]) * user.stake) * precision) /
                user.cumulativeProductScalingFactor) / precision;
            if (totalSBRRewards > 0) {
                sbrToken.mint(msg.sender, totalSBRRewards);
                emit SBRRewardClaimed(msg.sender, totalSBRRewards);
            }
        }
        sbrRewardSnapshots[msg.sender] = totalSbrRewardPerToken;
    }

    // Claim accumulated rewards
    function claim() external {
        UserInfo storage user = users[msg.sender];
        _claim(user);
    }

    // Add rewards to the pool
    function addReward(uint256 _amount) external onlyDebtContract {
        require(_amount > 0, "Reward must be greater than zero");
        //uint256 totalEffectiveStake = getTotalEffectiveStake();
        //require(totalEffectiveStake > 0, "No staked tokens");
        stakingToken.transferFrom(msg.sender, address(this), _amount);

        totalRewardPerToken +=
            ((_amount * stakeScalingFactor * precision) / totalStakedRaw) /
            precision;

        if (sbrRewardDistributionStatus != SBRRewardDistribution.ENDED) {
            _addSBRRewards();
        }

        emit RewardAdded(_amount);
    }

    // Perform liquidation using staked tokens
    // S[i][0] = Initial stake of a user i
    // T[0] = Initial total stake
    // A[n] = Amount to be liquidated at 'n' th liquidation
    // S[i][n] = S[i][n-1] * (1 - A[n] / T[n-1])
    // T[n] = T[n-1] - A[n]
    // S[i][n] = S[i][0] * (1 - A[1] / T[0]) * (1 - A[2] / T[1]) * ... * (1 - A[n] / T[n-1])
    // Scaling factor = (1 - A[1] / T[0]) * ... * (1  - A[n] / T[n-1])

    // Perform liquidation using staked tokens
    function performLiquidation(uint256 amount, uint256 collateral) external {
        require(msg.sender == debtContract, "Caller is not the debt contract");
        //uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(
            amount > 0 && amount <= totalStakedRaw,
            "Invalid liquidation amount"
        );
        require(collateral > 0, "No collateral received");

        uint256 previousScalingFactor = stakeScalingFactor;
        //uint256 scalingFactorReduction = (_amount * precision) / totalStakedRaw;
        // (1 - Amount / totalStakedRaw)
        uint256 newScalingFactor = ((totalStakedRaw - amount) * precision) /
            totalStakedRaw;
        uint256 cumulativeProductScalingFactor = (stakeScalingFactor *
            newScalingFactor) / precision;

        stakeScalingFactor = cumulativeProductScalingFactor;

        // Update total collateral per token
        totalCollateralPerToken +=
            ((collateral * previousScalingFactor * precision) /
                totalStakedRaw) /
            precision;

        totalStakedRaw -= amount;

        if (
            totalStakedRaw == 0 ||
            cumulativeProductScalingFactor < minimumScalingFactor
        ) {
            stakeScalingFactor = precision;
            stakeResetCount++;
            uint256 scalingFactor = previousScalingFactor;
            if (totalStakedRaw > 0) {
                scalingFactor = cumulativeProductScalingFactor;
            }
            StakeResetSnapshot memory resetSnapshot = StakeResetSnapshot({
                totalStakedRaw: totalStakedRaw,
                scalingFactor: scalingFactor,
                totalRewardPerToken: totalRewardPerToken,
                totalCollateralPerToken: totalCollateralPerToken,
                totalSBRRewardPerToken: totalSbrRewardPerToken
            });
            totalCollateralPerToken = 0;
            totalRewardPerToken = 0;
            totalSbrRewardPerToken = 0;
            stakeResetSnapshots[stakeResetCount] = resetSnapshot;
            emit ScalingFactorReset(stakeResetCount, resetSnapshot);
        }

        emit LiquidationPerformed(amount, collateral);
    }

    function _updateUserStake(UserInfo storage user) internal {
        // Adjust user's stake
        // TODO: Check if this is needed or not
        if (user.cumulativeProductScalingFactor != 0) {
            user.stake = _getUserEffectiveStake(user);
        }

        // Update user's scaling factor and reset count
        user.cumulativeProductScalingFactor = stakeScalingFactor;
    }

    // Internal function to update user rewards
    function _updateRewards(
        UserInfo storage user
    )
        internal
        returns (
            uint256 pendingReward,
            uint256 pendingCollateral,
            uint256 pendingSbrRewards
        )
    {
        if (user.cumulativeProductScalingFactor != 0) {
            (
                pendingReward,
                pendingCollateral,
                pendingSbrRewards
            ) = userPendingRewardAndCollateral(user);
        }
        if (pendingReward != 0) {
            stakingToken.transfer(msg.sender, pendingReward);
        }
        if (pendingCollateral != 0) {
            payable(msg.sender).transfer(pendingCollateral);
        }
        if (pendingSbrRewards != 0) {
            sbrToken.mint(msg.sender, pendingSbrRewards);
        }

        user.rewardSnapshot = totalRewardPerToken;
        user.collateralSnapshot = totalCollateralPerToken;
        sbrRewardSnapshots[msg.sender] = totalSbrRewardPerToken;
    }

    function userPendingRewardAndCollateral(
        UserInfo storage user
    )
        internal
        view
        returns (
            uint256 pendingReward,
            uint256 pendingCollateral,
            uint256 pendingSbrRewards
        )
    {
        if (user.stakeResetCount == stakeResetCount) {
            pendingReward =
                ((((totalRewardPerToken - user.rewardSnapshot) * user.stake) *
                    precision) / user.cumulativeProductScalingFactor) /
                precision;
            pendingCollateral =
                ((((totalCollateralPerToken - user.collateralSnapshot) *
                    user.stake) * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;
            pendingSbrRewards =
                ((((totalSbrRewardPerToken - sbrRewardSnapshots[msg.sender]) *
                    user.stake) * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;
        } else {
            StakeResetSnapshot memory snapshot = stakeResetSnapshots[
                user.stakeResetCount
            ];
            pendingReward =
                (((snapshot.totalRewardPerToken - user.rewardSnapshot) *
                    user.stake) * precision) /
                user.cumulativeProductScalingFactor;

            pendingCollateral =
                (((snapshot.totalCollateralPerToken - user.collateralSnapshot) *
                    user.stake) * precision) /
                user.cumulativeProductScalingFactor;

            pendingSbrRewards =
                (((snapshot.totalSBRRewardPerToken -
                    sbrRewardSnapshots[msg.sender]) * user.stake) * precision) /
                user.cumulativeProductScalingFactor;

            uint256 userStake = (user.stake * snapshot.scalingFactor) /
                user.cumulativeProductScalingFactor;

            if (user.stakeResetCount + 1 != stakeResetCount) {
                snapshot = stakeResetSnapshots[user.stakeResetCount + 1];
                pendingReward +=
                    ((snapshot.totalRewardPerToken * userStake * precision) /
                        snapshot.scalingFactor) /
                    precision;
                pendingCollateral +=
                    ((snapshot.totalCollateralPerToken *
                        userStake *
                        precision) / snapshot.scalingFactor) /
                    precision;
                pendingSbrRewards +=
                    ((snapshot.totalSBRRewardPerToken * userStake * precision) /
                        snapshot.scalingFactor) /
                    precision;
            } else {
                pendingReward +=
                    ((totalRewardPerToken * userStake * precision) /
                        stakeScalingFactor) /
                    precision;
                pendingCollateral +=
                    ((totalCollateralPerToken * userStake * precision) /
                        stakeScalingFactor) /
                    precision;
                pendingSbrRewards +=
                    ((totalSbrRewardPerToken * userStake * precision) /
                        stakeScalingFactor) /
                    precision;
            }
        }
    }

    function userPendingReward(
        UserInfo storage user
    ) internal view returns (uint256) {
        (uint256 pendingReward, , ) = userPendingRewardAndCollateral(user);
        return pendingReward;
    }

    function userPendingCollateral(
        UserInfo storage user
    ) internal view returns (uint256) {
        (, uint256 pendingCollateral, ) = userPendingRewardAndCollateral(user);
        return pendingCollateral;
    }

    function userPendingReward(address _user) public view returns (uint256) {
        UserInfo storage user = users[_user];
        return userPendingReward(user);
    }

    function userPendingCollateral(
        address _user
    ) public view returns (uint256) {
        UserInfo storage user = users[_user];
        return userPendingCollateral(user);
    }

    function _getUserEffectiveStake(
        UserInfo storage user
    ) internal view returns (uint256 stake) {
        if (user.stakeResetCount == stakeResetCount) {
            stake =
                (((user.stake * stakeScalingFactor) * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;
        } else {
            StakeResetSnapshot memory snapshot = stakeResetSnapshots[
                user.stakeResetCount
            ];
            stake =
                ((user.stake * snapshot.scalingFactor * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;

            if (user.stakeResetCount + 1 != stakeResetCount) {
                snapshot = stakeResetSnapshots[user.stakeResetCount + 1];
                stake = (stake * snapshot.scalingFactor) / precision;
            } else {
                stake = (stake * stakeScalingFactor) / precision;
            }
        }
        /*
        return
            (((user.stake * stakeScalingFactor) * precision) /
                user.cumulativeProductScalingFactor) / precision;
                */
    }

    function getUser(
        address _user
    ) public view returns (UserInfo memory userInfo) {
        UserInfo storage user = users[_user];
        if (user.cumulativeProductScalingFactor != 0) {
            uint256 userEffectiveStake = _getUserEffectiveStake(user);
            userInfo.stake = userEffectiveStake;
        }
    }
}
