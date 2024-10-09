// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RateGovernors {
    // Total stake and debt of all Rate Governors
    uint256 public totalStake;
    uint256 public totalDebt;
    uint256 public totalCollateral;

    // Global cumulative variables for liquidation distribution
    uint256 public cumulativeDebtPerDebtUnit;
    uint256 public cumulativeCollateralPerDebtUnit;

    // Struct for Rate Governors
    struct RateGovernor {
        uint256 stakeAmount; // Amount staked by the Rate Governor
        uint256 debtAmount; // Total debt assigned to the Rate Governor
        uint256 collateralAmount; // Collateral assigned to the Rate Governor
        uint256 lastCumulativeDebtPerDebtUnit;
        uint256 lastCumulativeCollateralPerDebtUnit;
    }
    mapping(uint256 => RateGovernor) public rateGovernors;

    // Events
    event Stake(uint256 indexed id, uint256 amount);
    event Unstake(uint256 indexed id, uint256 amount);
    event AssignDebt(uint256 indexed id, uint256 amount);
    event ReduceDebt(uint256 indexed id, uint256 amount);
    event Distribute(uint256 debtAmount, uint256 collateralAmount);
    event UpdateRateGovernor(uint256 indexed id);

    // Modifier to update a Rate Governor's balances before interaction
    modifier updateGovernorBalances(uint256 _id) {
        _updateRateGovernor(_id);
        _;
    }

    // Function for Rate Governors to stake
    function stake(
        uint256 _id,
        uint256 _amount
    ) external updateGovernorBalances(_id) {
        require(_amount > 0, "Stake amount must be greater than zero");

        RateGovernor storage governor = rateGovernors[_id];

        // Update stake amounts
        governor.stakeAmount += _amount;
        totalStake += _amount;

        emit Stake(_id, _amount);
    }

    // Function for Rate Governors to unstake
    function unstake(
        uint256 _id,
        uint256 _amount
    ) external updateGovernorBalances(_id) {
        RateGovernor storage governor = rateGovernors[_id];
        require(_amount > 0, "Unstake amount must be greater than zero");
        require(governor.stakeAmount >= _amount, "Insufficient stake");

        // Update stake amounts
        governor.stakeAmount -= _amount;
        totalStake -= _amount;

        emit Unstake(_id, _amount);
    }

    // Function to assign debt to a Rate Governor
    function assignDebt(
        uint256 _id,
        uint256 _amount,
        uint256 _collateralAmount
    ) external updateGovernorBalances(_id) {
        require(_amount > 0, "Debt amount must be greater than zero");

        RateGovernor storage governor = rateGovernors[_id];

        // Update debt amounts
        governor.debtAmount += _amount;
        governor.collateralAmount += _collateralAmount;
        totalDebt += _amount;
        totalCollateral += _collateralAmount;

        emit AssignDebt(_id, _amount);
    }

    // Function to reduce debt of a Rate Governor
    function reduceDebt(
        uint256 _id,
        uint256 _amount,
        uint256 _collateralAmount
    ) external updateGovernorBalances(_id) {
        RateGovernor storage governor = rateGovernors[_id];
        require(_amount > 0, "Amount must be greater than zero");
        require(governor.debtAmount >= _amount, "Amount exceeds debt");

        // Update debt amounts
        governor.debtAmount -= _amount;
        governor.collateralAmount -= _collateralAmount;
        totalDebt -= _amount;
        totalCollateral -= _collateralAmount;

        emit ReduceDebt(_id, _amount);
    }

    // Function to distribute liquidated collateral and debt to Rate Governors
    function distributeCollateralAndDebt(
        uint256 _debtAmount,
        uint256 _collateralAmount
    ) external {
        if (totalDebt > 0) {
            cumulativeDebtPerDebtUnit += (_debtAmount * 1e18) / totalDebt;
            cumulativeCollateralPerDebtUnit +=
                (_collateralAmount * 1e18) /
                totalDebt;
        }

        // Update totalDebt to include the distributed debt
        //totalDebt += _debtAmount;
        //totalCollateral += _collateralAmount;

        emit Distribute(_debtAmount, _collateralAmount);
    }

    function updateRateGovernor(uint256 _id) external {
        _updateRateGovernor(_id);
    }

    // Internal function to update a Rate Governor's balances
    function _updateRateGovernor(uint256 _id) internal {
        RateGovernor storage governor = rateGovernors[_id];
        uint256 userDebt = governor.debtAmount;

        uint256 lastDebtCumulative = governor.lastCumulativeDebtPerDebtUnit;
        uint256 lastCollateralCumulative = governor
            .lastCumulativeCollateralPerDebtUnit;

        if (userDebt == 0) {
            governor.lastCumulativeDebtPerDebtUnit = cumulativeDebtPerDebtUnit;
            governor
                .lastCumulativeCollateralPerDebtUnit = cumulativeCollateralPerDebtUnit;
            return;
        }

        // Calculate pending debt increase
        uint256 pendingDebtIncrease = ((cumulativeDebtPerDebtUnit -
            lastDebtCumulative) * userDebt) / 1e18;

        // Calculate pending collateral increase
        uint256 pendingCollateralIncrease = ((cumulativeCollateralPerDebtUnit -
            lastCollateralCumulative) * userDebt) / 1e18;

        // Update user's debt amount
        governor.debtAmount += pendingDebtIncrease;
        // Removed the line that adds pendingDebtIncrease to totalDebt to prevent double-counting
        totalDebt += pendingDebtIncrease;

        // Update user's collateral amount
        governor.collateralAmount += pendingCollateralIncrease;
        totalCollateral += pendingCollateralIncrease;

        // Update user's last cumulative snapshots
        governor.lastCumulativeDebtPerDebtUnit = cumulativeDebtPerDebtUnit;
        governor
            .lastCumulativeCollateralPerDebtUnit = cumulativeCollateralPerDebtUnit;

        emit UpdateRateGovernor(_id);
    }
}
