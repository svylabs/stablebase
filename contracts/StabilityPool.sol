// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDebtContract {
    function liquidate(
        uint256 amount
    ) external returns (uint256 collateralReceived);
}

contract StabilityPool {
    IERC20 public stakingToken; // Token that users stake and receive rewards in
    IDebtContract public debtContract; // External contract to liquidate debt

    uint256 public totalStakedRaw; // Total raw tokens staked in the pool
    uint256 public totalRewardPerToken; // Accumulated rewards per token staked
    uint256 public totalCollateralPerToken; // Accumulated collateral per token staked

    uint256 public stakeScalingFactor; // Current scaling factor
    uint256 public stakeScalingResetCount; // Number of times scaling factor has been reset
    mapping(uint256 => uint256) public cumulativeProductScalingFactors; // Cumulative product of scaling factors at each reset

    uint256 public constant precision = 1e18; // Precision for fixed-point calculations
    uint256 public constant minimumScalingFactor = 1e6; // Minimum scaling factor before reset

    // User data structure
    struct UserInfo {
        uint256 stake; // User's raw stake amount
        uint256 rewardDebt; // Rewards already paid out to the user
        uint256 collateralDebt; // Collateral already paid out to the user
        uint256 stakeResetCount; // Reset count when the user's stake was last updated
    }

    mapping(address => UserInfo) public users;

    // Events
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardAdded(uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event CollateralClaimed(address indexed user, uint256 amount);
    event LiquidationPerformed(
        uint256 amountStaked,
        uint256 collateralReceived
    );
    event ScalingFactorReset(uint256 newScalingFactor);
    event Received(address sender, uint256 amount);

    constructor(address _stakingToken, address _debtContract) {
        stakingToken = IERC20(_stakingToken);
        debtContract = IDebtContract(_debtContract);
        stakeScalingFactor = precision; // Initialize scaling factor to 1 (scaled by precision)
        stakeScalingResetCount = 0;
        cumulativeProductScalingFactors[0] = precision;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // Modifier to update user stake and rewards before executing function
    modifier updateUser(address _user) {
        _updateUserStake(_user);
        _;
    }

    // Stake tokens
    function stake(uint256 _amount) external updateUser(msg.sender) {
        require(_amount > 0, "Cannot stake zero tokens");
        UserInfo storage user = users[msg.sender];

        _updateRewards(user);

        stakingToken.transferFrom(msg.sender, address(this), _amount);

        user.stake += _amount;
        totalStakedRaw += _amount;

        // Update user's reward and collateral debts
        user.rewardDebt = (user.stake * totalRewardPerToken) / precision;
        user.collateralDebt =
            (user.stake * totalCollateralPerToken) /
            precision;

        emit Staked(msg.sender, _amount);
    }

    // Unstake tokens
    function unstake(uint256 _amount) external updateUser(msg.sender) {
        require(_amount > 0, "Cannot unstake zero tokens");
        UserInfo storage user = users[msg.sender];

        _updateRewards(user);

        require(_amount <= user.stake, "Invalid unstake amount");

        user.stake -= _amount;
        totalStakedRaw -= _amount;

        // Update user's reward and collateral debts
        user.rewardDebt = (user.stake * totalRewardPerToken) / precision;
        user.collateralDebt =
            (user.stake * totalCollateralPerToken) /
            precision;

        stakingToken.transfer(msg.sender, _amount);

        emit Unstaked(msg.sender, _amount);
    }

    // Claim accumulated rewards
    function claimRewards() external updateUser(msg.sender) {
        UserInfo storage user = users[msg.sender];
        uint256 pendingReward = userPendingReward(user);
        require(pendingReward > 0, "No rewards to claim");

        user.rewardDebt += pendingReward;

        stakingToken.transfer(msg.sender, pendingReward);

        emit RewardClaimed(msg.sender, pendingReward);
    }

    // Claim accumulated collateral
    function claimCollateral() external updateUser(msg.sender) {
        UserInfo storage user = users[msg.sender];
        uint256 pendingCollateral = userPendingCollateral(user);
        require(pendingCollateral > 0, "No collateral to claim");

        user.collateralDebt += pendingCollateral;

        payable(msg.sender).transfer(pendingCollateral);

        emit CollateralClaimed(msg.sender, pendingCollateral);
    }

    // Add rewards to the pool
    function addReward(uint256 _amount) external {
        require(_amount > 0, "Reward must be greater than zero");
        uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(totalEffectiveStake > 0, "No staked tokens");

        stakingToken.transferFrom(msg.sender, address(this), _amount);

        totalRewardPerToken += (_amount * precision) / totalEffectiveStake;

        emit RewardAdded(_amount);
    }

    // Perform liquidation using staked tokens
    function performLiquidation(uint256 _amount) external {
        uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(
            _amount > 0 && _amount < totalEffectiveStake,
            "Invalid liquidation amount"
        );

        // Calculate scaling factor reduction
        uint256 scalingFactorReduction = (_amount * precision) /
            totalEffectiveStake;
        uint256 newScalingFactor = stakeScalingFactor -
            ((stakeScalingFactor * scalingFactorReduction) / precision);

        // Check if scaling factor falls below minimum
        bool scalingFactorReset = false;
        if (newScalingFactor < minimumScalingFactor) {
            _resetScalingFactor();
            scalingFactorReset = true;

            // Recalculate scaling factor reduction after reset
            totalEffectiveStake = getTotalEffectiveStake();
            scalingFactorReduction =
                (_amount * precision) /
                totalEffectiveStake;
            newScalingFactor =
                stakeScalingFactor -
                ((stakeScalingFactor * scalingFactorReduction) / precision);

            // Update scaling factor
            stakeScalingFactor = newScalingFactor;
            // cumulativeProductScalingFactors is updated in _resetScalingFactor
        } else {
            // Update cumulative product scaling factors
            if (stakeScalingResetCount == 0) {
                cumulativeProductScalingFactors[
                    stakeScalingResetCount
                ] = stakeScalingFactor;
            } else {
                cumulativeProductScalingFactors[stakeScalingResetCount] =
                    (cumulativeProductScalingFactors[
                        stakeScalingResetCount - 1
                    ] * stakeScalingFactor) /
                    precision;
            }

            // Update scaling factor
            stakeScalingFactor = newScalingFactor;
        }

        // Transfer staked tokens to debt contract and perform liquidation
        stakingToken.transfer(address(debtContract), _amount);
        uint256 collateralReceived = debtContract.liquidate(_amount);
        require(collateralReceived > 0, "No collateral received");

        // Update total collateral per token
        totalCollateralPerToken +=
            (collateralReceived * precision) /
            totalEffectiveStake;

        emit LiquidationPerformed(_amount, collateralReceived);
    }

    // Internal function to reset scaling factor
    function _resetScalingFactor() internal {
        // Increment reset count
        stakeScalingResetCount += 1;

        // Update cumulative product scaling factors
        if (stakeScalingResetCount == 1) {
            // First reset
            cumulativeProductScalingFactors[1] = stakeScalingFactor;
        } else {
            cumulativeProductScalingFactors[stakeScalingResetCount] =
                (cumulativeProductScalingFactors[stakeScalingResetCount - 1] *
                    stakeScalingFactor) /
                precision;
        }

        // Reset scaling factor to precision
        stakeScalingFactor = precision;

        emit ScalingFactorReset(stakeScalingFactor);
    }

    // Internal function to update user's stake based on scaling factors
    function _updateUserStake(address _user) internal {
        UserInfo storage user = users[_user];
        if (user.stake > 0 && user.stakeResetCount <= stakeScalingResetCount) {
            // Calculate cumulative scaling factor since last reset
            uint256 cumulativeScaling = _getCumulativeScalingFactor(
                user.stakeResetCount,
                stakeScalingResetCount
            );
            // Adjust user's stake
            user.stake = (user.stake * cumulativeScaling) / precision;
            // Update user's reset count
            user.stakeResetCount = stakeScalingResetCount;
        }
    }

    // Internal function to get cumulative scaling factor between resets
    function _getCumulativeScalingFactor(
        uint256 fromReset,
        uint256 toReset
    ) internal view returns (uint256) {
        if (fromReset == toReset) {
            return precision;
        } else if (fromReset == 0) {
            // Avoid underflow when fromReset is zero
            return cumulativeProductScalingFactors[toReset];
        } else {
            require(toReset >= fromReset, "Invalid reset counts");
            uint256 numerator = cumulativeProductScalingFactors[toReset];
            uint256 denominator = cumulativeProductScalingFactors[fromReset];
            return (numerator * precision) / denominator;
        }
    }

    // Internal function to update user rewards
    function _updateRewards(UserInfo storage user) internal {
        uint256 userEffectiveStake = user.stake;

        if (userEffectiveStake > 0) {
            uint256 pendingReward = userPendingReward(user);
            uint256 pendingCollateral = userPendingCollateral(user);

            user.rewardDebt += pendingReward;
            user.collateralDebt += pendingCollateral;
        }

        // If total staked is zero after scaling, reset per-token accumulators
        if (getTotalEffectiveStake() == 0) {
            totalRewardPerToken = 0;
            totalCollateralPerToken = 0;
        }
    }

    // Calculate user's pending reward
    function userPendingReward(
        UserInfo storage user
    ) internal view returns (uint256) {
        uint256 userEffectiveStake = user.stake;
        return
            ((userEffectiveStake * totalRewardPerToken) / precision) -
            user.rewardDebt;
    }

    function userPendingReward(address user) public view returns (uint256) {
        return userPendingReward(users[user]);
    }

    function userPendingCollateral(address user) public view returns (uint256) {
        return userPendingCollateral(users[user]);
    }

    // Calculate user's pending collateral
    function userPendingCollateral(
        UserInfo storage user
    ) internal view returns (uint256) {
        uint256 userEffectiveStake = user.stake;
        return
            ((userEffectiveStake * totalCollateralPerToken) / precision) -
            user.collateralDebt;
    }

    // Get total effective stake after scaling
    function getTotalEffectiveStake() public view returns (uint256) {
        return totalStakedRaw;
    }
}
