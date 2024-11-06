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
    uint256 internal liquidationRatio = 11000; // 110% liquidation ratio
    uint256 internal constant BASIS_POINTS_DIVISOR = 10000;
    uint256
        internal constant FIRST_TIME_BORROW_BASIS_POINTS_DISCOUNT_THRESHOLD =
        20;
    uint256 public constant MINIMUM_DEBT = 2000 * 10 ** 18;
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

    uint256 public constant SBR_FEE_REWARD = 1000; // 10% of the fee goes to SBR Stakers

    uint256 public constant REDEMPTION_LIQUIDATION_FEE = 75; // 0.75%;

    uint256 public cumulativeDebtPerUnitCollateral;

    uint256 public cumulativeCollateralPerUnitCollateral;

    uint256 public totalCollateral;

    uint256 public totalDebt;

    SBStructs.Mode public PROTOCOL_MODE = SBStructs.Mode.BOOTSTRAP;
    uint256 public constant BOOTSTRAP_MODE_DEBT_THRESHOLD = 5000000 * 10 ** 18; // 5 million SBD

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
        sbdToken.approve(address(sbrTokenStaking), type(uint256).max);
        sbdToken.approve(address(stabilityPool), type(uint256).max);
        renounceOwnership();
    }

    function handleBorrow(
        uint256 safeId,
        SBStructs.Safe storage safe,
        uint256 amount,
        uint256 shieldingRate,
        uint256 nearestSpotInLiquidationQueue,
        uint256 nearestSpotInRedemptionQueue
    ) internal {
        // SBStructs.Safe storage currentSafe = safes[_safeId];
        require(
            ownerOf(safeId) == msg.sender,
            "Only the Safe owner can borrow"
        );
        uint256 _shieldingFee = (amount * shieldingRate) / BASIS_POINTS_DIVISOR;
        uint256 _minFeeWeightNode = safesOrderedForRedemption.getHead();
        // Is first time borrowing
        if (safe.borrowedAmount == 0) {
            if (_minFeeWeightNode == 0) {
                // There are no existing borrowings, so the fee is the minimum rate
                safe.weight = shieldingRate;
            } else {
                uint256 _minFeeWeight = safesOrderedForRedemption
                    .get(_minFeeWeightNode)
                    .value;
                // Adjust the fee percentage based on the minimum value, so the new borrowers don't start from the beginning.
                // This is to keep it fair for new borrowers, and is only an accounting trick.
                // Fee for new borrowers is in relation to the minimum rate paid by the existing borrowers
                safe.weight = _minFeeWeight + shieldingRate;
            }
        } else {
            uint256 _minFeeWeight = safesOrderedForRedemption
                .get(_minFeeWeightNode)
                .value;
            // ShieldingRate is always in relation to the minimum rate paid by the existing borrowers
            uint256 diff = safe.weight - _minFeeWeight;
            uint256 weightedDiff = (diff * safe.borrowedAmount) /
                BASIS_POINTS_DIVISOR;

            uint256 newFeeWeight = ((_shieldingFee + weightedDiff) *
                BASIS_POINTS_DIVISOR) / (safe.borrowedAmount + amount);

            // No need to charge the already borrowed amount as it has already been charged, just update the relative rate.
            if (shieldingRate > 0) {
                safe.weight = _minFeeWeight + newFeeWeight;
            }
        }
        if (amount < _shieldingFee) {
            revert("Borrowed amount is not sufficient to pay the fee");
        }
        uint _amountToBorrow = amount - _shieldingFee;
        safe.borrowedAmount += amount;

        // Calculate the ratio (borrowAmount per unit collateral)
        uint256 ratio = (safe.borrowedAmount) / safe.collateralAmount;

        safesOrderedForRedemption.upsert(
            safeId,
            safe.weight,
            nearestSpotInRedemptionQueue
        );

        safesOrderedForLiquidation.upsert(
            safeId,
            ratio,
            nearestSpotInLiquidationQueue
        );

        uint256 feePaid;
        uint256 canRefund;
        if (_shieldingFee > 0) {
            (feePaid, canRefund) = distributeFees(_shieldingFee, true);
        }
        if (canRefund > 0) {
            _amountToBorrow += canRefund;
            emit BorrowFeeRefund(safeId, canRefund);
        }
        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
        _updateTotalDebt(totalDebt, amount, true);
    }

    function _redeemNode(
        uint256 _safeId,
        SBStructs.Redemption memory redemption,
        IDoublyLinkedList _safesOrderedForRedemption,
        IDoublyLinkedList _safesOrderedForLiquidation,
        uint256 nearestSpotInLiquidationQueue
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
            uint256 collateralToRedeem = amountToRedeem / redemption.price;
            // update with new collateral ratio
            uint256 _newRatio = ((safe.borrowedAmount - amountToRedeem)) /
                (safe.collateralAmount - collateralToRedeem);
            safesOrderedForLiquidation.upsert(
                _safeId,
                _newRatio,
                nearestSpotInLiquidationQueue
            );
        }
        // update target shielding rate
        return redeemSafe(_safeId, amountToRedeem, safe, redemption);
    }

    function _redeemSafes(
        SBStructs.Redemption memory redemption,
        uint256 nearestSpotInLiquidationQueue,
        IDoublyLinkedList _safesOrderedForRedemption,
        IDoublyLinkedList _safesOrderedForLiquidation
    ) internal returns (SBStructs.Redemption memory) {
        uint256 processedSpots = redemption.processedSpots;
        // Target within 1% = 100 points, 100% = 10000 points
        while (redemption.redeemedAmount < redemption.requestedAmount) {
            //uint256 spotForUpdate = 0;
            uint256 head = _safesOrderedForRedemption.getHead();
            (, redemption) = _redeemNode(
                head,
                redemption,
                _safesOrderedForRedemption,
                _safesOrderedForLiquidation,
                nearestSpotInLiquidationQueue
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
        bool feeAdded = sbrTokenStaking.addCollateralReward{value: fee}(fee);
        if (!feeAdded) {
            fee = 0;
        }
        payable(msg.sender).transfer(redemption.collateralAmount - fee);
    }

    function redeemSafe(
        uint256 _safeId,
        uint256 amountToRedeem,
        SBStructs.Safe memory safe,
        SBStructs.Redemption memory redemption
    ) internal returns (SBStructs.Safe memory, SBStructs.Redemption memory) {
        //uint256 amountInCollateral = amountToRedeem /
        uint256 amountInCollateral = amountToRedeem / redemption.price;
        safe.collateralAmount -= amountInCollateral;
        safe.borrowedAmount -= amountToRedeem;
        redemption.collateralAmount += amountInCollateral;
        redemption.redeemedAmount += amountToRedeem;
        safes[_safeId] = safe;
        emit Redeemed(_safeId, amountToRedeem, amountInCollateral);
        return (safe, redemption);
    }

    function distributeFees(
        uint fee,
        bool mint
    ) internal returns (uint256 feePaid, uint256 canRefund) {
        if (mint) {
            sbdToken.mint(address(this), fee);
        }
        uint256 sbrStakersFee = (fee * SBR_FEE_REWARD) / 10000;
        uint256 stabilityPoolFee = fee;
        canRefund = fee;
        bool feeAdded1 = sbrTokenStaking.addReward(sbrStakersFee);
        if (feeAdded1) {
            stabilityPoolFee = fee - sbrStakersFee;
            feePaid = fee;
            canRefund -= sbrStakersFee;
        }
        bool feeAdded2 = stabilityPool.addReward(stabilityPoolFee);
        if (feeAdded2) {
            feePaid += stabilityPoolFee;
            canRefund -= stabilityPoolFee;
        }
        require(canRefund <= fee, "Invalid refund amount");
        if (canRefund > 0 && mint) {
            sbdToken.burn(address(this), canRefund);
        }
    }

    function distributeDebtAndCollateral(
        uint256 debtAmount,
        uint256 collateralAmount,
        uint256 totalCollateralAfterLiquidation
    ) internal {
        cumulativeCollateralPerUnitCollateral +=
            (collateralAmount * PRECISION) /
            totalCollateralAfterLiquidation;
        cumulativeDebtPerUnitCollateral +=
            (debtAmount * PRECISION) /
            totalCollateralAfterLiquidation;
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
        if (
            liquidationSnapshot.collateralPerCollateralSnapshot !=
            cumulativeCollateralPerUnitCollateral
        ) {
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
            _updateTotalDebt(totalDebt, debtIncrease, true);
        }

        return _safe;
    }

    function _updateTotalDebt(
        uint256 currentDebt,
        uint256 delta,
        bool add
    ) internal returns (uint256) {
        uint256 debt = currentDebt;
        if (add) {
            debt = currentDebt + delta;
        } else {
            debt = currentDebt - delta;
        }
        // Bootstrap Mode to Normal mode only once, Normal mode to bootstrap mode is not possible
        if (
            debt > BOOTSTRAP_MODE_DEBT_THRESHOLD &&
            PROTOCOL_MODE == SBStructs.Mode.BOOTSTRAP
        ) {
            PROTOCOL_MODE = SBStructs.Mode.NORMAL;
        }
        totalDebt = debt;
        return debt;
    }

    modifier onlyInNormalMode() {
        require(
            PROTOCOL_MODE == SBStructs.Mode.NORMAL,
            "Protocol in bootstrap mode"
        );
        _;
    }

    function _removeSafe(uint256 _safeId) internal {
        delete safes[_safeId];
        _burn(_safeId);
    }
}
