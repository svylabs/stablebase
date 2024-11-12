// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStabilityPool.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMintableToken is IERC20 {
    function mint(address to, uint256 amount) external returns (bool);
}

contract StabilityPool is IStabilityPool, Ownable {
    IERC20 public stakingToken; // Token that users stake and receive rewards in
    address public stableBaseCDP; // External contract to liquidate debt

    uint256 public totalStakedRaw; // Total raw tokens staked in the pool
    uint256 public totalRewardPerToken; // Accumulated rewards per token staked
    uint256 public totalCollateralPerToken; // Accumulated collateral per token staked

    uint256 public rewardLoss;
    uint256 public collateralLoss;

    mapping(uint256 => StakeResetSnapshot) public stakeResetSnapshots; // Cumulative product of scaling factors at each reset

    // Maintaining a separate mapping for sbrRewardSnapshots instead of in userInfo to avoid potential gas costs later on
    struct SBRRewardClaim {
        uint256 rewardSnapshot;
        SBRRewardDistribution status;
    }
    mapping(address => SBRRewardClaim) public sbrRewardSnapshots;

    uint256 public totalSbrRewardPerToken = 0;
    uint256 public sbrRewardLoss = 0;

    uint256 public constant precision = 1e18; // Precision for fixed-point calculations
    uint256 public constant minimumScalingFactor = 1e9; // Minimum scaling factor before reset

    uint256 public stakeScalingFactor = precision; // Current scaling factor
    uint256 public stakeResetCount = 0; // Number of times scaling factor has been reset

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
    event SBRRewardsAdded(
        uint256 lastTime,
        uint256 currentTime,
        uint256 rewardAmount,
        uint256 totalRewardPerToken
    );
    event SBRRewardClaimed(address indexed user, uint256 rewardAmount);

    mapping(address => UserInfo) public users;

    modifier onlyDebtContract() {
        require(msg.sender == stableBaseCDP, "Caller is not the debt contract");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _stakingToken,
        address _stableBaseCDP,
        address _sbrToken
    ) external onlyOwner {
        stakingToken = IERC20(_stakingToken);
        stableBaseCDP = _stableBaseCDP;
        sbrToken = IMintableToken(_sbrToken);

        renounceOwnership();
    }

    receive() external payable onlyDebtContract {
        emit Received(msg.sender, msg.value);
    }

    // Stake tokens
    function stake(uint256 _amount) external {
        require(_amount > 0, "Cannot stake zero tokens");
        UserInfo storage user = users[msg.sender];
        _claim(user);

        require(
            stakingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer tokens failed"
        );

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

        require(
            stakingToken.transfer(msg.sender, _amount),
            "Transfer tokens failed"
        );

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
                    lastSBRRewardDistributedTime;
            }
            uint256 sbrReward = timeElapsed * sbrDistributionRate;
            if (totalStakedRaw > 0) {
                uint256 _sbrReward = sbrReward + sbrRewardLoss;
                uint256 _totalSbrRewardPerToken = ((_sbrReward *
                    stakeScalingFactor *
                    precision) / totalStakedRaw) / precision;
                totalSbrRewardPerToken += _totalSbrRewardPerToken;
                sbrRewardLoss =
                    _sbrReward -
                    ((_totalSbrRewardPerToken * totalStakedRaw * precision) /
                        stakeScalingFactor) /
                    precision;

                emit SBRRewardsAdded(
                    lastSBRRewardDistributedTime,
                    block.timestamp,
                    sbrReward,
                    totalSbrRewardPerToken
                );
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

    // Claim accumulated rewards
    function claim() external {
        UserInfo storage user = users[msg.sender];
        _claim(user);
    }

    // Add rewards to the pool
    function addReward(
        uint256 _amount
    ) external onlyDebtContract returns (bool) {
        require(_amount > 0, "Reward must be greater than zero");
        //uint256 totalEffectiveStake = getTotalEffectiveStake();
        //require(totalEffectiveStake > 0, "No staked tokens");
        uint256 _totalStakedRaw = totalStakedRaw;
        if (_totalStakedRaw == 0) {
            return false;
        }
        require(
            stakingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer tokens failed"
        );

        uint256 _totalAmount = _amount + rewardLoss;
        uint256 _rewardPerToken = ((_totalAmount *
            stakeScalingFactor *
            precision) / _totalStakedRaw) / precision;

        totalRewardPerToken += _rewardPerToken;

        rewardLoss =
            _totalAmount -
            (((_rewardPerToken * _totalStakedRaw * precision) /
                stakeScalingFactor) / precision);

        if (sbrRewardDistributionStatus != SBRRewardDistribution.ENDED) {
            _addSBRRewards();
        }

        emit RewardAdded(_amount);
        return true;
    }

    function addCollateralReward(
        uint256 amount
    ) external payable onlyDebtContract returns (bool) {
        require(amount > 0, "Reward must be greater than zero");
        require(msg.value == amount, "Invalid collateral amount");
        uint256 _totalStakedRaw = totalStakedRaw;
        if (_totalStakedRaw == 0) {
            return false;
        }

        uint256 _totalAmount = amount + collateralLoss;
        uint256 _collateralPerToken = ((_totalAmount *
            stakeScalingFactor *
            precision) / _totalStakedRaw) / precision;

        totalCollateralPerToken += _collateralPerToken;

        collateralLoss =
            _totalAmount -
            (((_collateralPerToken * _totalStakedRaw * precision) /
                stakeScalingFactor) / precision);

        emit CollateralRewardAdded(amount);
        return true;
    }

    function isLiquidationPossible(
        uint256 amount
    ) external view override returns (bool) {
        return amount <= totalStakedRaw;
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
    function performLiquidation(
        uint256 amount,
        uint256 collateral
    ) external payable onlyDebtContract returns (bool) {
        //require(msg.sender == debtContract, "Caller is not the debt contract");
        //uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(amount <= totalStakedRaw, "Invalid liquidation amount");
        require(msg.value == collateral, "Invalid collateral amount");

        uint256 previousScalingFactor = stakeScalingFactor;
        //uint256 scalingFactorReduction = (_amount * precision) / totalStakedRaw;
        // (1 - Amount / totalStakedRaw)
        uint256 newScalingFactor = ((totalStakedRaw - amount) * precision) /
            totalStakedRaw;
        uint256 cumulativeProductScalingFactor = (stakeScalingFactor *
            newScalingFactor) / precision;

        stakeScalingFactor = cumulativeProductScalingFactor;

        uint256 _collateral = collateral + collateralLoss;

        uint256 _totalCollateralPerToken = ((_collateral *
            previousScalingFactor *
            precision) / totalStakedRaw) / precision;

        // Update total collateral per token
        totalCollateralPerToken += _totalCollateralPerToken;
        collateralLoss =
            _collateral -
            ((_totalCollateralPerToken * totalStakedRaw * precision) /
                previousScalingFactor) /
            precision;

        emit LiquidationPerformed(
            amount,
            collateral,
            totalStakedRaw,
            stakeScalingFactor,
            totalCollateralPerToken
        );

        totalStakedRaw -= amount;

        if (cumulativeProductScalingFactor < minimumScalingFactor) {
            StakeResetSnapshot memory resetSnapshot = StakeResetSnapshot({
                scalingFactor: cumulativeProductScalingFactor,
                totalRewardPerToken: totalRewardPerToken,
                totalCollateralPerToken: totalCollateralPerToken,
                totalSBRRewardPerToken: totalSbrRewardPerToken
            });
            stakeResetSnapshots[stakeResetCount] = resetSnapshot;
            totalCollateralPerToken = 0;
            totalRewardPerToken = 0;
            totalSbrRewardPerToken = 0;
            stakeScalingFactor = precision;
            stakeResetCount++;
            emit ScalingFactorReset(stakeResetCount - 1, resetSnapshot);
        }
        return true;
    }

    function _updateUserStake(UserInfo storage user) internal {
        // Adjust user's stake
        // TODO: Check if this is needed or not
        if (user.cumulativeProductScalingFactor != 0) {
            user.stake = _getUserEffectiveStake(user);
        }

        // Update user's scaling factor and reset count
        user.cumulativeProductScalingFactor = stakeScalingFactor;
        user.stakeResetCount = stakeResetCount;
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

        user.rewardSnapshot = totalRewardPerToken;
        user.collateralSnapshot = totalCollateralPerToken;
        if (sbrRewardDistributionStatus != SBRRewardDistribution.ENDED) {
            sbrRewardSnapshots[msg.sender]
                .rewardSnapshot = totalSbrRewardPerToken;
        } else if (
            sbrRewardSnapshots[msg.sender].status !=
            SBRRewardDistribution.CLAIMED
        ) {
            sbrRewardSnapshots[msg.sender].status = SBRRewardDistribution
                .CLAIMED;
        }

        if (pendingReward != 0) {
            require(
                stakingToken.transfer(msg.sender, pendingReward),
                "Reward transfer failed"
            );
        }
        if (pendingCollateral != 0) {
            (bool success, ) = msg.sender.call{value: pendingCollateral}("");
            require(success, "Collateral transfer failed");
        }
        if (pendingSbrRewards != 0) {
            require(
                sbrToken.mint(msg.sender, pendingSbrRewards),
                "Mint failed"
            );
        }
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
        bool calculateSbrRewards = true;
        if (
            sbrRewardSnapshots[msg.sender].status ==
            SBRRewardDistribution.CLAIMED
        ) {
            calculateSbrRewards = false;
        }
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
            if (calculateSbrRewards) {
                pendingSbrRewards =
                    ((((totalSbrRewardPerToken -
                        sbrRewardSnapshots[msg.sender].rewardSnapshot) *
                        user.stake) * precision) /
                        user.cumulativeProductScalingFactor) /
                    precision;
            }
        } else {
            StakeResetSnapshot memory snapshot = stakeResetSnapshots[
                user.stakeResetCount
            ];
            pendingReward =
                ((((snapshot.totalRewardPerToken - user.rewardSnapshot) *
                    user.stake) * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;

            pendingCollateral =
                ((((snapshot.totalCollateralPerToken -
                    user.collateralSnapshot) * user.stake) * precision) /
                    user.cumulativeProductScalingFactor) /
                precision;

            if (calculateSbrRewards) {
                pendingSbrRewards =
                    ((((snapshot.totalSBRRewardPerToken -
                        sbrRewardSnapshots[msg.sender].rewardSnapshot) *
                        user.stake) * precision) /
                        user.cumulativeProductScalingFactor) /
                    precision;
            }

            // Calculate the user stake at reset snapshot
            uint256 userStake = ((user.stake *
                snapshot.scalingFactor *
                precision) / user.cumulativeProductScalingFactor) / precision;

            if (user.stakeResetCount + 1 != stakeResetCount) {
                snapshot = stakeResetSnapshots[user.stakeResetCount + 1];
                pendingReward +=
                    (snapshot.totalRewardPerToken * userStake) /
                    precision;
                pendingCollateral +=
                    (snapshot.totalCollateralPerToken * userStake) /
                    precision;
                if (calculateSbrRewards) {
                    pendingSbrRewards +=
                        (snapshot.totalSBRRewardPerToken * userStake) /
                        precision;
                }
            } else {
                pendingReward += (totalRewardPerToken * userStake) / precision;
                pendingCollateral +=
                    (totalCollateralPerToken * userStake) /
                    precision;
                if (calculateSbrRewards) {
                    pendingSbrRewards +=
                        (totalSbrRewardPerToken * userStake) /
                        precision;
                }
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

    function userPendingRewardAndCollateral(
        address _user
    ) public view returns (uint256, uint256, uint256) {
        UserInfo storage user = users[_user];
        if (user.cumulativeProductScalingFactor != 0) {
            return userPendingRewardAndCollateral(user);
        } else {
            return (0, 0, 0);
        }
    }

    function _getUserEffectiveStake(
        UserInfo memory user
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

    function getUser(address _user) public view returns (UserInfo memory user) {
        user = users[_user];
        if (user.cumulativeProductScalingFactor != 0) {
            uint256 userEffectiveStake = _getUserEffectiveStake(user);
            user.stake = userEffectiveStake;
        }
    }
}
