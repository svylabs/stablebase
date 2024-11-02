pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./library/Math.sol";
import "./interfaces/IPriceOracle.sol";
import "./Structures.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./SBDToken.sol";
import "./Utilities.sol";
import "./interfaces/IStableBase.sol";
import "./library/Rate.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ISBRStaking.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract StableBase is IStableBase, ERC721, Ownable {
    uint256 internal liquidationRatio = 110; // 110% liquidation ratio
    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;
    uint256
        internal constant FIRST_TIME_BORROW_BASIS_POINTS_DISCOUNT_THRESHOLD =
        20;
    using RateLib for Math.Rate;
    uint256 internal constant PRECISION = 10 ** 18;

    IDoublyLinkedList public safesOrderedForLiquidation;

    IDoublyLinkedList public safesOrderedForRedemption;

    // Mapping to track Safe balances
    // mapping(bytes32 => SBStructs.Safe) public safes;
    mapping(uint256 => SBStructs.Safe) public safes;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    SBDToken public sbdToken;

    IPriceOracle public priceOracle;

    IStabilityPool public stabilityPool;

    ISBRStaking public sbrTokenStaking;

    uint256 public constant SBR_FEE_REWARD = 10; // 10% of the fee goes to SBR Stakers

    uint256 public constant REDEMPTION_LIQUIDATION_FEE = 75; // 0.5%;

    uint256 public cumulativeDebtPerUnitCollateral;

    uint256 public cumulativeCollateralPerUnitCollateral;

    uint256 public totalCollateral;

    struct LiquidationSnapshot {
        uint256 collateralPerCollateralSnapshot;
        uint256 debtPerCollateralSnapshot;
    }

    mapping(uint256 => LiquidationSnapshot) public liquidationSnapshots;

    constructor() Ownable(msg.sender) ERC721("StableBase Safe", "SBSafe") {}

    function setAddresses(
        address _sbdToken,
        address _priceOracle,
        address _stabilityPool,
        address _sbrTokenStaking,
        address _safesOrderedForLiquidation,
        address _safesOrderedForRedemption
    ) external onlyOwner {
        sbdToken = SBDToken(_sbdToken);
        priceOracle = IPriceOracle(_priceOracle);
        stabilityPool = IStabilityPool(_stabilityPool);
        sbrTokenStaking = ISBRStaking(_sbrTokenStaking);
        // Initialize the contract
        safesOrderedForLiquidation = IDoublyLinkedList(
            _safesOrderedForLiquidation
        );
        safesOrderedForRedemption = IDoublyLinkedList(
            _safesOrderedForRedemption
        );
        renounceOwnership();
    }

    function handleBorrow(
        uint256 safeId,
        SBStructs.Safe memory safe,
        uint256 amount,
        uint256 shieldingRate,
        uint256 nearestSpotInLiquidationQueue,
        uint256 nearestSpotInRedemptionQueue
    ) internal returns (SBStructs.Safe memory) {
        // SBStructs.Safe storage currentSafe = safes[_safeId];
        require(ownerOf(safeId) == msg.sender, "Only the NFT owner can borrow");
        uint256 _shieldingFee = (amount * shieldingRate) / BASIS_POINTS_DIVISOR;
        // Is first time borrowing
        if (safe.borrowedAmount == 0) {
            uint256 _minRateNode = safesOrderedForRedemption.getHead();
            uint256 _minRatePaid = safesOrderedForRedemption
                .get(_minRateNode)
                .value;
            // Adjust the fee percentage based on the minimum value, so the new borrowers don't start from the beginning.
            // This is to keep it fair for new borrowers, and is only an accounting trick.
            // Fee for new borrowers is in relation to the minimum rate paid by the existing borrowers
            safe.paidFeePercentage = _minRatePaid + shieldingRate;
        } else {
            // There is an existing borrowing, so pay this rate for the existing borrowing as well
            _shieldingFee +=
                (safe.borrowedAmount * shieldingRate) /
                BASIS_POINTS_DIVISOR;
            if (shieldingRate > 0) {
                safe.paidFeePercentage += shieldingRate;
            }
        }
        if (amount < _shieldingFee) {
            revert("Borrowed amount is not sufficient to pay the fee");
        }
        uint _amountToBorrow = amount - _shieldingFee;
        safe.borrowedAmount += amount;

        // Calculate the ratio (borrowAmount per unit collateral)
        uint256 ratio = (safe.borrowedAmount * PRECISION) /
            safe.collateralAmount;

        if (shieldingRate > 0) {
            safesOrderedForRedemption.upsert(
                safeId,
                safe.paidFeePercentage,
                nearestSpotInRedemptionQueue
            );
        }

        safesOrderedForLiquidation.upsert(
            safeId,
            ratio,
            nearestSpotInLiquidationQueue
        );

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);

        distributeFees(_shieldingFee, true);

        return safe;
    }

    function _redeemNode(
        uint256 _safeId,
        SBStructs.Redemption memory redemption,
        IDoublyLinkedList _safesOrderedForRedemption,
        IDoublyLinkedList _safesOrderedForLiquidation,
        uint256 spotForUpdate
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        // bytes32 _safeId = bytes32(_safeId);
        SBStructs.Safe storage safe = safes[_safeId];
        _updateSafe(_safeId, safe);
        uint256 amountToRedeem = redemption.requestedAmount -
            redemption.redeemedAmount;
        if (amountToRedeem > safe.borrowedAmount) {
            amountToRedeem = safe.borrowedAmount;
        }
        if (amountToRedeem == safe.borrowedAmount) {
            // If the safe was fully redeemed, remove it from both the lists
            _safesOrderedForRedemption.remove(_safeId);
            _safesOrderedForLiquidation.remove(_safeId);
        } else {
            // update with new collateral ratio
            uint256 _newRatio = ((safe.borrowedAmount - amountToRedeem) *
                PRECISION) / safe.collateralAmount;
            safesOrderedForLiquidation.upsert(
                _safeId,
                _newRatio,
                spotForUpdate
            );
        }
        // update target shielding rate
        return redeemSafe(_safeId, amountToRedeem, safe, redemption);
    }

    function _redeemSafes(
        SBStructs.Redemption memory redemption,
        bytes calldata redemptionParams,
        IDoublyLinkedList _safesOrderedForRedemption,
        IDoublyLinkedList _safesOrderedForLiquidation
    ) internal returns (SBStructs.Redemption memory) {
        uint256 processedSpots = redemption.processedSpots;
        // Target within 1% = 100 points, 100% = 10000 points
        while (redemption.redeemedAmount < redemption.requestedAmount) {
            uint256 spotForUpdate = uint256(
                bytes32(
                    redemptionParams[processedSpots * 32:processedSpots *
                        32 +
                        32]
                )
            );
            //uint256 spotForUpdate = 0;
            uint256 head = _safesOrderedForRedemption.getHead();
            (, redemption) = _redeemNode(
                head,
                redemption,
                _safesOrderedForRedemption,
                _safesOrderedForLiquidation,
                spotForUpdate
            );
            processedSpots++;
        }
        redemption.processedSpots = processedSpots;
        return redemption;
    }

    function _redeemToUser(SBStructs.Redemption memory redemption) internal {
        // TODO: Distribute fees to SBR Stakers
        uint256 fee = (redemption.collateralAmount *
            REDEMPTION_LIQUIDATION_FEE) / BASIS_POINTS_DIVISOR;
        payable(address(sbrTokenStaking)).transfer(fee);
        sbrTokenStaking.addCollateralReward(fee);
        payable(msg.sender).transfer(redemption.collateralAmount);
    }

    function redeemSafe(
        uint256 _safeId,
        uint256 amountToRedeem,
        SBStructs.Safe memory safe,
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        //uint256 amountInCollateral = amountToRedeem /
        uint256 amountInCollateral = amountToRedeem / priceOracle.getPrice();
        safe.collateralAmount -= amountInCollateral;
        safe.borrowedAmount -= amountToRedeem;
        redemption.collateralAmount += amountInCollateral;
        redemption.redeemedAmount += amountToRedeem;
        if (safe.borrowedAmount == 0) {
            // TODO: SEE WHAT TO DO WITH THE SAFE
            safesOrderedForRedemption.remove(_safeId);
        }
        safes[_safeId] = safe;
        return (safe, redemption);
    }

    function distributeFees(uint fee, bool mint) internal {
        if (mint) {
            sbdToken.mint(address(this), fee);
        }
        uint256 sbrStakersFee = (fee * SBR_FEE_REWARD) / 100;
        uint256 stabilityPoolFee = fee - sbrStakersFee;
        sbdToken.approve(address(stabilityPool), stabilityPoolFee);
        stabilityPool.addReward(stabilityPoolFee);
        sbdToken.approve(address(sbrTokenStaking), sbrStakersFee);
        sbrTokenStaking.addReward(sbrStakersFee);
    }

    function distributeDebtAndCollateral(
        uint256 debtAmount,
        uint256 collateralAmount
    ) internal {
        totalCollateral -= collateralAmount;
        cumulativeCollateralPerUnitCollateral +=
            (collateralAmount * PRECISION) /
            totalCollateral;
        cumulativeDebtPerUnitCollateral +=
            (debtAmount * PRECISION) /
            totalCollateral;
    }

    // Internal function to update a safe's borrowed amount and deposited amount
    function _updateSafe(
        uint _safeId,
        SBStructs.Safe storage _safe
    ) internal returns (SBStructs.Safe memory) {
        // Update borrowed amount
        LiquidationSnapshot storage liquidationSnapshot = liquidationSnapshots[
            _safeId
        ];
        uint debtIncrease = (_safe.collateralAmount *
            (cumulativeDebtPerUnitCollateral -
                liquidationSnapshot.debtPerCollateralSnapshot)) / PRECISION;
        _safe.borrowedAmount += debtIncrease;
        liquidationSnapshot
            .debtPerCollateralSnapshot = cumulativeDebtPerUnitCollateral;

        // Update deposited amount
        uint collateralIncrease = (_safe.collateralAmount *
            (cumulativeCollateralPerUnitCollateral -
                liquidationSnapshot.collateralPerCollateralSnapshot)) /
            PRECISION;
        _safe.collateralAmount += collateralIncrease;
        liquidationSnapshot
            .collateralPerCollateralSnapshot = cumulativeCollateralPerUnitCollateral;

        totalCollateral += collateralIncrease;

        return _safe;
    }
}
