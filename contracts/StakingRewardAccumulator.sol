pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingRewardsAccumulator {

    // ERC20 token being staked
    IERC20 public token;

    // Mapping to track staked balances
    mapping(address => uint256) public stakedBalance;

    // Mapping to track rewards balances
    mapping(address => uint256) public rewardsBalance;

    // Total staked balance
    uint256 public totalStaked;

    // Total accumulated rewards
    uint256 public totalRewards;

    // Constructor
    constructor(address _tokenAddress) {
        token = IERC20(_tokenAddress);
    }

    // Function to stake tokens
    function stake(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");
        
        // Update staked balance
        stakedBalance[msg.sender] = stakedBalance[msg.sender] + _amount;
        totalStaked = totalStaked + _amount;

        // Calculate and update rewards
        uint256 userReward = (totalRewards * _amount) / totalStaked;
        rewardsBalance[msg.sender] = rewardsBalance[msg.sender] + userReward;

        // Transfer tokens from sender to contract
        require(token.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
    }

    // Function to withdraw staked tokens
    function withdraw(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= stakedBalance[msg.sender], "Insufficient staked balance");

        // Calculate and update rewards
        uint256 userReward = (totalRewards * _amount) / (totalStaked);
        rewardsBalance[msg.sender] = rewardsBalance[msg.sender] - userReward;

        // Update staked balance
        stakedBalance[msg.sender] = stakedBalance[msg.sender] - _amount;
        totalStaked = totalStaked - _amount;

        // Transfer tokens from contract to sender
        require(token.transfer(msg.sender, _amount), "Token transfer failed");
    }

    // Function to distribute rewards
    function distributeRewards(uint256 _rewardAmount) external {
        require(_rewardAmount > 0, "Reward amount must be greater than 0");

        // Update total accumulated rewards
        totalRewards = totalRewards + _rewardAmount;
    }

    // Function to allow stakers to claim their rewards
    function claimRewards() external {
        uint256 reward = calculateRewards(msg.sender);
        require(reward > 0, "No rewards to claim");

        // Update rewards balance
        rewardsBalance[msg.sender] = 0;

        // Transfer rewards to sender
        require(token.transfer(msg.sender, reward), "Reward transfer failed");
    }

    // Function to view accumulated rewards for a given staker
    function viewAccumulatedRewards(address _staker) external view returns (uint256) {
        return calculateRewards(_staker);
    }

    // Function to calculate rewards for a given staker
    function calculateRewards(address _staker) internal view returns (uint256) {
        uint256 stakerBalance = stakedBalance[_staker];
        uint256 reward = (totalRewards * stakerBalance) / (totalStaked);
        return reward;
    }

}
