pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISBRStaking.sol";

contract SBRStaking is ISBRStaking {
    mapping(address => Stake) public stakes;

    uint256 public totalStake;
    uint256 public totalRewardPerToken;
    uint256 public totalCollateralPerToken;

    uint256 public PRECISION = 1e18;

    IERC20 public rewardToken;
    IERC20 public stakingToken;
    IERC20 public collateralToken;
    address public stableBaseContract;

    constructor(
        address _rewardToken,
        address _stakingToken,
        address _collateralToken,
        address _stableBaseContract
    ) {
        rewardToken = IERC20(_rewardToken);
        stakingToken = IERC20(_stakingToken);
        collateralToken = IERC20(_collateralToken);
        stableBaseContract = _stableBaseContract;
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
        require(
            msg.sender == stableBaseContract,
            "Only stableBase contract can add rewards"
        );
        rewardToken.transferFrom(msg.sender, address(this), _amount);
        totalRewardPerToken += (_amount * PRECISION) / totalStake;
        emit RewardAdded(_amount);
    }

    function addCollateralReward(uint256 _amount) external {
        //collateralToken.transferFrom(msg.sender, address(this), _amount);
        require(
            msg.sender == stableBaseContract,
            "Only stableBase contract can add collateral rewards"
        );
        totalCollateralPerToken += (_amount * PRECISION) / totalStake;
        emit CollateralRewardAdded(_amount);
    }

    function _claim(Stake storage user) internal {
        uint256 reward = ((totalRewardPerToken - user.rewardSnapshot) *
            user.stake) / PRECISION;
        user.rewardSnapshot = totalRewardPerToken;
        if (reward > 0) {
            rewardToken.transfer(msg.sender, reward);
        }
        uint256 collateralReward = ((totalCollateralPerToken -
            user.collateralSnapshot) * user.stake) / PRECISION;
        user.collateralSnapshot = totalCollateralPerToken;
        if (collateralReward > 0) {
            payable(msg.sender).transfer(collateralReward);
        }

        emit Claimed(msg.sender, reward, collateralReward);
    }

    function claim() external {
        Stake storage user = stakes[msg.sender];
        _claim(user);
    }

    function getStake(
        address user
    ) external view override returns (Stake memory) {
        return stakes[user];
    }

    function userPendingReward(
        address user
    ) external view override returns (uint256) {
        Stake memory _stake = stakes[user];
        return
            ((totalRewardPerToken - _stake.rewardSnapshot) * _stake.stake) /
            PRECISION;
    }
}
