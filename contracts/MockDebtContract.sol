pragma solidity ^0.8.20;

import "./interfaces/IStabilityPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockDebtContract {
    receive() external payable {
        //emit Received(msg.sender, msg.value);
    }

    IStabilityPool public pool;

    IERC20 public stakingToken;

    constructor(address _stakingToken) {
        stakingToken = IERC20(_stakingToken);
    }

    function setPool(address _pool) external {
        pool = IStabilityPool(_pool);
    }

    function addReward(uint256 _amount) external {
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        stakingToken.approve(address(pool), _amount);
        pool.addReward(_amount);
    }

    function liquidate(
        uint256 amount,
        uint256 collateral
    ) external returns (uint256) {
        uint balance = (address(this).balance);
        require(balance >= 0, "Insufficient balance");
        // Mock liquidation - send all available collateral to the liquidator
        payable(msg.sender).transfer(balance);
        pool.performLiquidation(amount, collateral);
        return balance;
    }
}
