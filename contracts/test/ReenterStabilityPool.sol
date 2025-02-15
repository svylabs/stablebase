pragma solidity ^0.8.20;

import "../interfaces/IStabilityPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReenterStabilityPool {
    IStabilityPool public stabilityPool;
    IERC20 public stakeToken;

    constructor(address _stabilityPool, address _stakeToken) {
        stabilityPool = IStabilityPool(_stabilityPool);
        stakeToken = IERC20(_stakeToken);
    }

    uint256 public reenterFunction = 0; // 1 = stake, 2 = unstake

    receive() external payable {
        // re-enter the contract
        if (reenterFunction == 0) {
            // Do nothing
        } else if (reenterFunction == 1) {
            this.stake1(0);
        } else if (reenterFunction == 2) {
            this.unstake(0);
        }
    }

    function stake1(uint256 _reenterFunction) external {
        this.stake2(_reenterFunction, 10 ** 18);
    }

    function stake2(uint256 _reenterFunction, uint256 amount) external {
        reenterFunction = _reenterFunction;
        stakeToken.approve(address(stabilityPool), type(uint256).max);
        stabilityPool.stake(amount);
    }

    function unstake(uint256 _reenterFunction) external {
        reenterFunction = _reenterFunction;
        stabilityPool.unstake(10 ** 18);
    }

    function claim(uint256 _reenterFunction) external {
        reenterFunction = _reenterFunction;
        stabilityPool.claim();
    }
}
