pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISBRStaking.sol";

contract SBRStaking is ISBRStaking {
    mapping(address => Stake) public stakes;

    uint256 public totalStake;
    uint256 public totalRewardPerToken;

    uint256 public PRECISION = 1e18;

    IERC20 public rewardToken;
    IERC20 public stakingToken;

    constructor(address _rewardToken, address _stakingToken) {
        rewardToken = IERC20(_rewardToken);
        stakingToken = IERC20(_stakingToken);
    }

    function stake(uint256 _amount) external {
        require(_amount > 0, "Cannot stake zero tokens");
        Stake storage user = stakes[msg.sender];
        _claim(user);

        stakingToken.transferFrom(msg.sender, address(this), _amount);

        user.stake += _amount;
        totalStake += _amount;

        emit Staked(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external {
        require(_amount > 0, "Cannot unstake zero tokens");
        Stake storage user = stakes[msg.sender];
        _claim(user);

        require(_amount <= user.stake, "Invalid unstake amount");
        stakingToken.transfer(msg.sender, _amount);

        user.stake -= _amount;
        totalStake -= _amount;

        emit Unstaked(msg.sender, _amount);
    }

    function addReward(uint256 _amount) external {
        rewardToken.transferFrom(msg.sender, address(this), _amount);
        totalRewardPerToken += (_amount * PRECISION) / totalStake;
    }

    function _claim(Stake storage user) internal {
        uint256 reward = ((totalRewardPerToken - user.rewardSnapshot) *
            user.stake) / PRECISION;
        user.rewardSnapshot = totalRewardPerToken;
        if (reward > 0) {
            rewardToken.transfer(msg.sender, reward);
        }

        emit Claimed(msg.sender, reward);
    }

    function claim() external {
        Stake storage user = stakes[msg.sender];
        _claim(user);
    }

    function getStake(
        address user
    ) external view override returns (Stake memory stake) {
        return stakes[user];
    }

    function userPendingReward(
        address user
    ) external view override returns (uint256) {
        Stake memory stake = stakes[user];
        return
            ((totalRewardPerToken - stake.rewardSnapshot) * stake.stake) /
            PRECISION;
    }
}
