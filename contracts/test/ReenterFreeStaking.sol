pragma solidity ^0.8.20;

import "../interfaces/IFREEStaking.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReenterFreeStaking {
    IFREEStaking public freeStaking;
    IERC20 public stakeToken;

    constructor(address _freeStaking, address _freeStakingToken) {
        freeStaking = IFREEStaking(_freeStaking);
        stakeToken = IERC20(_freeStakingToken);
    }

    uint256 public reenterFunction = 0; // 1 = stake, 2 = unstake
    uint256 public reentryCounter = 0;

    receive() external payable {
        // re-enter the contract
        if (reenterFunction == 0) {
            // Do nothing
        } else if (reenterFunction == 1) {
            reentryCounter++;
            this.stake1(0);
        } else if (reenterFunction == 2) {
            reentryCounter++;
            this.unstake(0);
        }
    }

    function stake1(uint256 _reenterFunction) external {
        this.stake2(_reenterFunction, 10 ** 18);
    }

    function stake2(uint256 _reenterFunction, uint256 amount) external {
        reenterFunction = _reenterFunction;
        stakeToken.approve(address(freeStaking), type(uint256).max);
        freeStaking.stake(amount);
    }

    function unstake(uint256 _reenterFunction) external {
        reenterFunction = _reenterFunction;
        freeStaking.unstake(10 ** 18);
    }

    function claim(uint256 _reenterFunction) external {
        reenterFunction = _reenterFunction;
        freeStaking.claim();
    }
}
