// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStabilityPool.sol";

contract StabilityPool is IStabilityPool {
    IERC20 public stakingToken; // Token that users stake and receive rewards in
    address public debtContract; // External contract to liquidate debt

    uint256 public totalStakedRaw; // Total raw tokens staked in the pool
    uint256 public totalRewardPerToken; // Accumulated rewards per token staked
    uint256 public totalCollateralPerToken; // Accumulated collateral per token staked

    uint256 public stakeScalingFactor; // Current scaling factor
    uint256 public stakeResetCount; // Number of times scaling factor has been reset
    mapping(uint256 => uint256) public cumulativeProductScalingFactors; // Cumulative product of scaling factors at each reset

    uint256 public constant precision = 1e18; // Precision for fixed-point calculations
    uint256 public constant minimumScalingFactor = 1e6; // Minimum scaling factor before reset

    mapping(address => UserInfo) public users;

    modifier onlyDebtContract() {
        require(msg.sender == debtContract, "Caller is not the debt contract");
        _;
    }

    constructor(address _stakingToken, address _debtContract) {
        stakingToken = IERC20(_stakingToken);
        debtContract = _debtContract;
        stakeScalingFactor = precision; // Initialize scaling factor to 1 (scaled by precision)
        cumulativeProductScalingFactors[0] = precision; // Initialize cumulative product of scaling factors
        stakeResetCount = 0;
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
        (uint256 reward, uint256 collateral) = _updateRewards(user);
        _updateUserStake(user);
        emit RewardClaimed(msg.sender, reward, collateral);
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

        uint256 previousScalingFactor = stakeScalingFactor;
        //uint256 scalingFactorReduction = (_amount * precision) / totalStakedRaw;
        // (1 - Amount / totalStakedRaw)
        uint256 newScalingFactor = ((totalStakedRaw - amount) * precision) /
            totalStakedRaw;
        uint256 cumulativeProductScalingFactor = (stakeScalingFactor *
            newScalingFactor) / precision;

        // When cumulative product scaling factor is less than minimum scaling factor, reset scaling factor
        // Implies that the product of all scaling factors has become too small
        // we need to reset the scaling factor
        // which is to say cumulativeProductScalingFactor is equal to the maximum scaling now which is 1.
        /*
        if (cumulativeProductScalingFactor <= minimumScalingFactor) {
            // Update cumulative product scaling factors before reset
            // TODO: What to do with this.
            cumulativeProductScalingFactors[stakeResetCount + 1] =
                (cumulativeProductScalingFactors[stakeResetCount] *
                    newScalingFactor) /
                stakeScalingFactor;

            // Increment reset count and reset scaling factor
            stakeResetCount += 1;
            stakeScalingFactor = precision;

            emit ScalingFactorReset(stakeScalingFactor);
        } else {
            // Update cumulative product scaling factors
            cumulativeProductScalingFactors[
                stakeResetCount
            ] = cumulativeProductScalingFactor;

            // Update scaling factor
            stakeScalingFactor = cumulativeProductScalingFactor;
        }*/

        stakeScalingFactor = cumulativeProductScalingFactor;

        // Transfer staked tokens to debt contract and perform liquidation
        //stakingToken.transfer(address(debtContract), _amount);
        //uint256 collateralReceived = debtContract.liquidate(_amount);
        require(collateral > 0, "No collateral received");

        // Update total collateral per token
        totalCollateralPerToken +=
            ((collateral * previousScalingFactor * precision) /
                totalStakedRaw) /
            precision;

        // TODO: Check if this is needed or not
        totalStakedRaw -= amount;

        emit LiquidationPerformed(amount, collateral);
    }

    function _updateUserStake(UserInfo storage user) internal {
        // Adjust user's stake
        // TODO: Check if this is needed or not
        if (user.cumulativeProductScalingFactor != 0) {
            user.stake = ((((user.stake * stakeScalingFactor) * precision) /
                user.cumulativeProductScalingFactor) / precision);
        }

        // Update user's scaling factor and reset count
        user.cumulativeProductScalingFactor = stakeScalingFactor;
    }

    // Internal function to update user rewards
    function _updateRewards(
        UserInfo storage user
    ) internal returns (uint256 pendingReward, uint256 pendingCollateral) {
        if (user.cumulativeProductScalingFactor != 0) {
            pendingReward = userPendingReward(user);
            pendingCollateral = userPendingCollateral(user);
        }
        if (pendingReward != 0) {
            stakingToken.transfer(msg.sender, pendingReward);
        }
        if (pendingCollateral != 0) {
            payable(msg.sender).transfer(pendingCollateral);
        }

        user.rewardSnapshot = totalRewardPerToken;
        user.collateralSnapshot = totalCollateralPerToken;
    }

    function userPendingReward(
        UserInfo storage user
    ) internal view returns (uint256) {
        return
            ((((totalRewardPerToken - user.rewardSnapshot) * user.stake) *
                precision) / user.cumulativeProductScalingFactor) / precision;
    }

    function userPendingCollateral(
        UserInfo storage user
    ) internal view returns (uint256) {
        return
            ((((totalCollateralPerToken - user.collateralSnapshot) *
                user.stake) * precision) /
                user.cumulativeProductScalingFactor) / precision;
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

    function getUserEffectiveStake(
        UserInfo storage user
    ) internal view returns (uint256) {
        return
            (((user.stake * stakeScalingFactor) * precision) /
                user.cumulativeProductScalingFactor) / precision;
    }

    function getUser(
        address _user
    ) public view returns (UserInfo memory userInfo) {
        UserInfo storage user = users[_user];
        if (user.cumulativeProductScalingFactor != 0) {
            uint256 userEffectiveStake = getUserEffectiveStake(user);
            userInfo.stake = userEffectiveStake;
        }
    }
}
