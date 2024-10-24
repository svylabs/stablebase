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
    uint256 public stakeResetCount; // Number of times scaling factor has been reset
    mapping(uint256 => uint256) public cumulativeProductScalingFactors; // Cumulative product of scaling factors at each reset

    uint256 public constant precision = 1e18; // Precision for fixed-point calculations
    uint256 public constant minimumScalingFactor = 1e6; // Minimum scaling factor before reset

    // User data structure
    struct UserInfo {
        uint256 stake; // User's raw stake amount
        uint256 rewardDebt; // Rewards already paid out to the user
        uint256 collateralDebt; // Collateral already paid out to the user
        uint256 scalingFactor; // User's scaling factor at last update
        uint256 stakeResetCount; // User's reset count at last update
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
        cumulativeProductScalingFactors[0] = precision; // Initialize cumulative product of scaling factors
        stakeResetCount = 0;
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
    function claimRewards() external {
        UserInfo storage user = users[msg.sender];
        uint256 pendingReward = userPendingReward(user);
        require(pendingReward > 0, "No rewards to claim");

        user.rewardDebt += pendingReward;

        stakingToken.transfer(msg.sender, pendingReward);

        _updateUserStake(msg.sender);

        emit RewardClaimed(msg.sender, pendingReward);
    }

    // Claim accumulated collateral
    function claimCollateral() external {
        UserInfo storage user = users[msg.sender];
        uint256 pendingCollateral = userPendingCollateral(user);
        require(pendingCollateral > 0, "No collateral to claim");

        user.collateralDebt += pendingCollateral;

        payable(msg.sender).transfer(pendingCollateral);

        _updateUserStake(msg.sender);

        emit CollateralClaimed(msg.sender, pendingCollateral);
    }

    // Add rewards to the pool
    function addReward(uint256 _amount) external {
        require(_amount > 0, "Reward must be greater than zero");
        uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(totalEffectiveStake > 0, "No staked tokens");

        stakingToken.transferFrom(msg.sender, address(this), _amount);

        totalRewardPerToken += (_amount * precision) / totalStakedRaw;

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
    function performLiquidation(uint256 _amount) external {
        uint256 totalEffectiveStake = getTotalEffectiveStake();
        require(
            _amount > 0 && _amount <= totalEffectiveStake,
            "Invalid liquidation amount"
        );

        uint256 previousScalingFactor = stakeScalingFactor;
        uint256 scalingFactorReduction = (_amount * precision) /
            totalEffectiveStake;
        uint256 newScalingFactor = stakeScalingFactor -
            ((stakeScalingFactor * scalingFactorReduction) / precision);

        if (newScalingFactor <= minimumScalingFactor) {
            // Update cumulative product scaling factors before reset
            // Calculate the cumulative scaling factor up to the reset point
            cumulativeProductScalingFactors[stakeResetCount + 1] =
                (cumulativeProductScalingFactors[stakeResetCount] *
                    newScalingFactor) /
                previousScalingFactor;

            // Increment reset count and reset scaling factor
            stakeResetCount += 1;
            stakeScalingFactor = precision;

            emit ScalingFactorReset(stakeScalingFactor);
        } else {
            // Update cumulative product scaling factors
            cumulativeProductScalingFactors[stakeResetCount] =
                (cumulativeProductScalingFactors[stakeResetCount] *
                    newScalingFactor) /
                previousScalingFactor;

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
            totalStakedRaw;

        emit LiquidationPerformed(_amount, collateralReceived);
    }

    // Internal function to get cumulative scaling factor between two reset counts
    function _getCumulativeScalingFactor(
        uint256 fromReset,
        uint256 toReset
    ) internal view returns (uint256) {
        require(toReset >= fromReset, "Invalid reset counts");

        uint256 numerator = cumulativeProductScalingFactors[toReset];
        uint256 denominator = cumulativeProductScalingFactors[fromReset];

        return (numerator * precision) / denominator;
    }

    // Internal function to update user's stake based on scaling factors
    function _updateUserStake(address _user) internal {
        UserInfo storage user = users[_user];

        uint256 cumulativeScalingFactor = precision;

        if (user.stakeResetCount == stakeResetCount) {
            // No resets have occurred since the user's last interaction
            if (user.scalingFactor != 0) {
                cumulativeScalingFactor =
                    (stakeScalingFactor * precision) /
                    user.scalingFactor;
            }
        } else {
            // Resets have occurred
            cumulativeScalingFactor = _getCumulativeScalingFactor(
                user.stakeResetCount,
                stakeResetCount
            );
        }

        // Adjust user's stake
        user.stake = (user.stake * cumulativeScalingFactor) / precision;
        // Update user's scaling factor and reset count
        user.scalingFactor = stakeScalingFactor;
        user.stakeResetCount = stakeResetCount;
    }

    // Internal function to update user rewards
    function _updateRewards(UserInfo storage user) internal {
        uint256 pendingReward = userPendingReward(user);
        uint256 pendingCollateral = userPendingCollateral(user);

        if (pendingReward > 0) {
            user.rewardDebt += pendingReward;
        }
        if (pendingCollateral > 0) {
            user.collateralDebt += pendingCollateral;
        }
    }

    // Internal function to get user's effective stake
    function getUserEffectiveStake(
        UserInfo storage user
    ) internal view returns (uint256) {
        if (user.stake == 0) {
            return 0;
        }

        uint256 cumulativeScalingFactor = 1e18;

        if (user.stakeResetCount == stakeResetCount) {
            // No resets have occurred since the user's last interaction
            if (user.scalingFactor != 0) {
                cumulativeScalingFactor =
                    (stakeScalingFactor * precision) /
                    user.scalingFactor;
            }
        } else {
            // Resets have occurred
            cumulativeScalingFactor = _getCumulativeScalingFactor(
                user.stakeResetCount,
                stakeResetCount
            );
        }

        return (user.stake * cumulativeScalingFactor) / precision;
    }

    function userPendingReward(
        UserInfo storage user
    ) internal view returns (uint256) {
        uint256 userEffectiveStake = getUserEffectiveStake(user);
        return
            ((user.stake * totalRewardPerToken) / precision) - user.rewardDebt;
    }

    function userPendingCollateral(
        UserInfo storage user
    ) internal view returns (uint256) {
        uint256 userEffectiveStake = getUserEffectiveStake(user);
        return
            ((user.stake * totalCollateralPerToken) / precision) -
            user.collateralDebt;
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

    // Get total effective stake after scaling
    function getTotalEffectiveStake() public view returns (uint256) {
        uint256 cumulativeScalingFactor = cumulativeProductScalingFactors[
            stakeResetCount
        ];
        return (totalStakedRaw * cumulativeScalingFactor) / precision;
    }

    function getUser(
        address _user
    ) public view returns (UserInfo memory userInfo) {
        UserInfo storage user = users[_user];
        uint256 userEffectiveStake = getUserEffectiveStake(user);
        userInfo.stake = userEffectiveStake;
    }
}
