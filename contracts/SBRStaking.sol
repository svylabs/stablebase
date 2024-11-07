pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISBRStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SBRStaking is ISBRStaking, Ownable {
    mapping(address => Stake) public stakes;

    uint256 public totalStake;
    uint256 public totalRewardPerToken;
    uint256 public totalCollateralPerToken;

    uint256 public PRECISION = 1e18;

    IERC20 public stakingToken;
    IERC20 public rewardToken;
    address public stableBaseContract;

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _stakingToken,
        address _rewardToken,
        address _stableBaseContract
    ) external onlyOwner {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
        stableBaseContract = _stableBaseContract;

        renounceOwnership();
    }

    function stake(uint256 _amount) external {
        require(_amount > 0, "Cannot stake zero tokens");
        Stake storage user = stakes[msg.sender];
        _claim(user);

        require(
            stakingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer tokens failed"
        );

        user.stake += _amount;
        totalStake += _amount;

        emit Staked(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external {
        require(_amount > 0, "Cannot unstake zero tokens");
        Stake storage user = stakes[msg.sender];
        _claim(user);

        require(_amount <= user.stake, "Invalid unstake amount");

        user.stake -= _amount;
        totalStake -= _amount;
        require(
            stakingToken.transfer(msg.sender, _amount),
            "Transfer tokens failed"
        );

        emit Unstaked(msg.sender, _amount);
    }

    function addReward(uint256 _amount) external returns (bool) {
        require(
            msg.sender == stableBaseContract,
            "Only stableBase contract can add rewards"
        );
        uint _totalStake = totalStake;
        if (_totalStake == 0) {
            return false;
        } else {
            require(
                rewardToken.transferFrom(msg.sender, address(this), _amount),
                "Transfer tokens failed"
            );
            totalRewardPerToken += (_amount * PRECISION) / _totalStake;
            emit RewardAdded(_amount);
            return true;
        }
    }

    function addCollateralReward(
        uint256 _amount
    ) external payable returns (bool) {
        //collateralToken.transferFrom(msg.sender, address(this), _amount);
        require(
            msg.sender == stableBaseContract,
            "Only stableBase contract can add collateral rewards"
        );
        uint _totalStake = totalStake;
        if (_totalStake == 0) {
            return false;
        } else {
            require(msg.value == _amount, "Invalid collateral reward amount");
            totalCollateralPerToken += (_amount * PRECISION) / _totalStake;
            emit CollateralRewardAdded(_amount);
            return true;
        }
    }

    function _claim(Stake storage user) internal {
        uint256 reward = ((totalRewardPerToken - user.rewardSnapshot) *
            user.stake) / PRECISION;
        user.rewardSnapshot = totalRewardPerToken;
        uint256 collateralReward = ((totalCollateralPerToken -
            user.collateralSnapshot) * user.stake) / PRECISION;
        user.collateralSnapshot = totalCollateralPerToken;
        if (reward > 0) {
            rewardToken.transfer(msg.sender, reward);
        }
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
    ) external view override returns (uint256, uint256) {
        Stake memory _stake = stakes[user];
        return (
            ((totalRewardPerToken - _stake.rewardSnapshot) * _stake.stake) /
                PRECISION,
            ((totalCollateralPerToken - _stake.collateralSnapshot) *
                _stake.stake) / PRECISION
        );
    }
}
