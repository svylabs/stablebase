pragma solidity ^0.8.20;

interface IStabilityPool {
    function stake(uint256 _amount) external;

    function unstake(uint256 _amount) external;

    function claim() external;

    function performLiquidation(
        uint256 amount,
        uint256 collateral
    ) external returns (uint256);

    function addReward(uint256 _amount) external;

    function getUser() external;
}
