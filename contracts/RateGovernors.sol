// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import OpenZeppelin contracts for security and standard functionality
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RateGovernors is ReentrancyGuard {
    // Stablecoin token (assumed to be ERC20)
    IERC20 public stablecoin;

    // Total stake of all Rate Governors
    uint256 public totalStake;
    uint256 public totalDebt;

    // Global cumulative variables for liquidation distribution
    uint256 public cumulativeDebtPerDebtUnit;
    uint256 public cumulativeCollateralPerDebtUnit;

    // Struct for Rate Governors
    struct RateGovernor {
        uint256 stakeAmount; // Amount of stablecoins staked
        uint256 debtAmount; // Total debt assigned to the Rate Governor
        uint256 collateralAmount; // Collateral assigned to the Rate Governor
        uint256 lastCumulativeDebtPerDebtUnit;
        uint256 lastCumulativeCollateralPerDebtUnit;
    }
    mapping(uint256 => RateGovernor) public rateGovernors;

    // Mapping to track ownership of IDs
    mapping(uint256 => address) public idOwners;

    // Events
    event Stake(uint256 indexed id, uint256 amount);
    event Unstake(uint256 indexed id, uint256 amount);
    event Distribute(uint256 debtAmount, uint256 collateralAmount);
    event UpdateRateGovernor(uint256 indexed id);

    // Constructor to initialize the stablecoin token
    constructor(IERC20 _stablecoin) {
        stablecoin = _stablecoin;
    }

    // Modifier to update a Rate Governor's balances before interaction
    modifier updateGovernorBalances(uint256 _id) {
        _updateRateGovernor(_id);
        _;
    }

    // Function for Rate Governors to stake stablecoins
    function stake(
        uint256 _id,
        uint256 _amount
    ) external nonReentrant updateGovernorBalances(_id) {
        require(_amount > 0, "Stake amount must be greater than zero");

        RateGovernor storage governor = rateGovernors[_id];

        // Transfer stablecoins from the caller to the contract
        stablecoin.transferFrom(msg.sender, address(this), _amount);

        // Update stake amounts
        governor.stakeAmount += _amount;
        totalStake += _amount;

        emit Stake(_id, _amount);
    }

    // Function for Rate Governors to unstake stablecoins
    function unstake(
        uint256 _id,
        uint256 _amount
    ) external nonReentrant updateGovernorBalances(_id) {
        RateGovernor storage governor = rateGovernors[_id];
        require(_amount > 0, "Unstake amount must be greater than zero");
        require(governor.stakeAmount >= _amount, "Insufficient stake");

        // Update stake amounts
        governor.stakeAmount -= _amount;
        totalStake -= _amount;

        // Transfer stablecoins back to the caller
        stablecoin.transfer(msg.sender, _amount);

        emit Unstake(_id, _amount);
    }

    // Function to distribute liquidated collateral and debt to Rate Governors
    function distributeCollateralAndDebt(
        uint256 _debtAmount,
        uint256 _collateralAmount
    ) external nonReentrant {
        // Update global cumulative variables for debt and collateral distribution
        if (totalDebtAssigned() > 0) {
            cumulativeDebtPerDebtUnit +=
                (_debtAmount * 1e18) /
                totalDebtAssigned();
            cumulativeCollateralPerDebtUnit +=
                (_collateralAmount * 1e18) /
                totalDebtAssigned();
        }

        emit Distribute(_debtAmount, _collateralAmount);
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

        // Update user's collateral amount
        governor.collateralAmount += pendingCollateralIncrease;

        // Update user's last cumulative snapshots
        governor.lastCumulativeDebtPerDebtUnit = cumulativeDebtPerDebtUnit;
        governor
            .lastCumulativeCollateralPerDebtUnit = cumulativeCollateralPerDebtUnit;

        emit UpdateRateGovernor(_id);
    }

    // Function to get the total debt assigned to Rate Governors
    function totalDebtAssigned() public view returns (uint256) {
        // Iterate through Rate Governors and sum their debt amounts
        // Note: This function may not be efficient if there are many Rate Governors.
        // In practice, you may want to maintain a totalDebt variable that updates with each debt assignment.
        return totalDebt;
        // Pseudo-code for iteration (actual implementation would depend on how IDs are stored)
        // for each governor in rateGovernors:
        //     totalDebt += governor.debtAmount;
    }

    // Additional functions can be added as needed
}
