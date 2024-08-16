// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./Structures.sol";
import "./Utilities.sol";
import "./SBDToken.sol";
import "./dependencies/price-oracle/MockPriceOracle.sol";
import "./interfaces/IPriceOracle.sol";
import "./library/OrderedDoublyLinkedList.sol";
import "./interfaces/IDoublyLinkedList.sol";
import "./interfaces/IReservePool.sol";
import "./ReservePool.sol";

contract StableBaseCDP {
    uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
    uint256 private liquidationRatio = 110; // 110% liquidation ratio
    uint256 private constant BASIS_POINTS_DIVISOR = 10000;

    IDoublyLinkedList public shieldedSafes;
    IDoublyLinkedList public orderedReserveRatios;
    IDoublyLinkedList public orderedTargetShieldedRates;

    uint256 public targetShieldingRateMultiplier;

    event Redeemed(bytes32 _safeId, uint256 amount);

    // Mapping to track Safe balances
    mapping(bytes32 => SBStructs.Safe) public safes;
    mapping(bytes32 => address) public safeOwners;

    SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

    mapping(address => SBStructs.WhitelistedToken) public whitelistedTokens;

    SBDToken public sbdToken;

    address public owner;

    mapping(address => uint256) public shieldingRates;

    address public reservePool;

    Math.Rate public referenceShieldingRate;

    constructor(address _sbdToken) {
        whitelistedTokens[address(0)] = SBStructs.WhitelistedToken({
            priceOracle: address(new MockPriceOracle()),
            collateralRatio: 110
        });
        sbdToken = SBDToken(_sbdToken);
        shieldedSafes = IDoublyLinkedList(address(new OrderedDoublyLinkedList()));
        orderedReserveRatios = IDoublyLinkedList(address(new OrderedDoublyLinkedList()));
        orderedTargetShieldedRates = IDoublyLinkedList(address(new OrderedDoublyLinkedList()));
        reservePool = address(new ReservePool());
    }

    /**
     * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
     * Send any amount of ERC20 tokens or ETH
     *
     * @param _token Address of the ERC20 token, use address(0) for ETH
     * @param _amount Amount of tokens or ETH to deposit as collateral
     *
     */
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 _positionInReserve) external payable {
    // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 /*_positionInReserve*/) external payable {
    function openSafe(address _token, uint256 _amount) external payable {
        require(_amount > 0, "Amount must be greater than 0");
        // bytes32 id = SBUtils.getSafeId(msg.sender, _token);
         bytes32 id = SBUtils.getSafeId(msg.sender, _token);
        require(safeOwners[id] == address(0), "Safe already exists");
        safeOwners[id] = msg.sender;

        // Create a new Safe
        SBStructs.Safe memory safe = SBStructs.Safe({
            owner: msg.sender,
            token: _token,
            depositedAmount: _amount,
            borrowedAmount: 0,
            rates: 0,
            shieldedUntil: 0
        });

        // Deposit ETH or ERC20 token using SBUtils library
        if (_token == address(0)) {
            safe.depositedAmount = msg.value; // Assign ETH amount to depositedAmount
        } else {
            safe.depositedAmount = _amount; // Assign ERC20 amount to depositedAmount
        }
        SBUtils.depositEthOrToken(_token, address(this), _amount);

        // Add the Safe to the mapping
        safes[id] = safe;
    }

    /**
     * @dev Closes a Safe and returns the collateral to the owner.
     * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
     * Return back the collateral
     * @param _safeId ID of the Safe to close
     */
    function closeSafe(bytes32 _safeId) external {
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can close the safe");
        SBStructs.Safe storage safe = safes[_safeId];
        require(safe.borrowedAmount == 0, "Cannot close Safe with borrowed amount");

        // Withdraw ETH or ERC20 token using SBUtils library (Transfer collateral back to the owner)
        SBUtils.withdrawEthOrToken(safe.token, msg.sender, safe.depositedAmount);

        // Remove the Safe from the mapping
        delete safes[_safeId];
        delete safeOwners[_safeId];
    }

    function handleBorrowReserveRatioSafes(bytes32 id, SBStructs.Safe memory safe, 
                uint256 compressedRate, 
                uint256 amount, 
                bytes calldata borrowParams) internal {
        uint256 _id = uint256(id);
         // Calculate origination fee
        uint256 _reserveRatio = SBUtils.getRateAtPosition(compressedRate, 0);
        uint256 _reservePoolDeposit = (amount * _reserveRatio) / BASIS_POINTS_DIVISOR;
        uint _amountToBorrow = amount - _reservePoolDeposit;
        safe.borrowedAmount += amount;
        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
        IDoublyLinkedList _orderedReserveRatios = IDoublyLinkedList(orderedReserveRatios);
        uint256 _nearestSpot = abi.decode(borrowParams[4:32], (uint256));
        // TODO: Mint to reserve pool
        sbdToken.mint(reservePool, _reservePoolDeposit);
        IReservePool _reservePool = IReservePool(reservePool);
        _reservePool.addStake(_id, _reservePoolDeposit);
        uint _newReserveRatio = (safe.borrowedAmount * BASIS_POINTS_DIVISOR / _reservePool.getStake(_id));
        _orderedReserveRatios.upsert(uint256(id), _newReserveRatio, _nearestSpot);

        uint256 _targetShieldingRate = SBUtils.getRateAtPosition(compressedRate, 1);
        IDoublyLinkedList _orderedTargetShieldedRates = IDoublyLinkedList(orderedTargetShieldedRates);
        uint256 _nearestSpotInTargetShieldingRate = abi.decode(borrowParams[36:68], (uint256));
        _orderedTargetShieldedRates.upsert(uint256(id), _targetShieldingRate, _nearestSpot);
    }

    function handleBorrowShieldedSafes(bytes32 id, SBStructs.Safe memory safe, 
                uint256 compressedRate, 
                uint256 amount,
                bytes calldata borrowParams) internal {
        uint256 _shieldingRate = SBUtils.getRateAtPosition(compressedRate, 0);
        uint256 _shieldingFee = (amount * _shieldingRate) / BASIS_POINTS_DIVISOR;
        uint _amountToBorrow = amount - _shieldingFee;
        // Update the Safe's shieldedUntil timestamp
        uint256 _shieldingHours = Math.getShieldingHours(referenceShieldingRate, _shieldingRate);
        safe.shieldedUntil = block.timestamp + Math.toSeconds(_shieldingHours);
        safe.borrowedAmount += amount;

        uint256 _nearestSpot = abi.decode(borrowParams[4:32], (uint256));
        IDoublyLinkedList _shieldedSafes = IDoublyLinkedList(shieldedSafes);

        // TODO: shieldedUntil needs to dynamically change based on the borrowings
        _shieldedSafes.upsert(uint256(id), safe.shieldedUntil, _nearestSpot);

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
    }

    /**
     * Borrow stablecoins from the protocol
     *
     * _borrowParams:
     * minimum: 36 bytes, maximum 68 bytes
     * bytes 0-3:
     *     bit: 0,1 borrowMode: 00 - shieldingRate, 01 - reserveRatio
     *     bits 2-15: rate (either shieldingRate or reserveRatio)
     *     bit 16,17: 1 if target shielding rate is set, 0 otherwise
     *     bits 18-31: target shielding rate
     * bytes 4-35: Nearest Spot in either shieldedSafes or orderedReserveRatiosList list
     * bytes 36-67: If exists, is always the nearest spot in the orderedTargetShieldedRatesList
     *
     */
    function borrowWithParams(
        // address _token,
        bytes32 _safeId,
        uint256 _amount,
        bytes calldata _borrowParams
    ) external {
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can repay");
        SBStructs.Safe memory safe = safes[_safeId];
        require(safe.depositedAmount > 0, "Safe does not exist");
        // bytes2 _rateByte = bytes2(_borrowParams[0: 2]);
        // uint32 _compressedRate = (uint32(uint16(_rateByte) & 0xFFFC));
        // SBStructs.BorrowMode _borrowMode = SBUtils.getBorrowMode(uint16(_rateByte));
        //uint256 _nearestSpot = abi.decode(_borrowParams[4:32], (uint256));

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
        );

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) / liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limits
        require(
            safe.borrowedAmount + _amount <= maxBorrowAmount,
            "Borrow amount exceeds the maximum allowed"
        );

        // Calculate reserve or shielding rate
        (uint256 shieldingRate, uint256 shieldingEnabled) = Math.getRate(0, SBStructs.StabilityType.SHIELDING_RATE);
        (uint256 reserveRatio, uint256 reserveRatioEnabled) = Math.getRate(0, SBStructs.StabilityType.RESERVE_RATIO);

        uint256 _amountToBorrow = _amount;
        if (reserveRatioEnabled == 1) {
            // Calculate origination fee
            uint256 _reservePoolDeposit = (_amount * reserveRatio) / BASIS_POINTS_DIVISOR;
            _amountToBorrow = _amount - _reservePoolDeposit;
        } else {
            uint256 _shieldingFee = (_amount * shieldingRate) / BASIS_POINTS_DIVISOR;
            _amountToBorrow = _amount - _shieldingFee;
            // Update the Safe's shieldedUntil timestamp
            uint256 _shieldingHours = Math.getShieldingHours(referenceShieldingRate, shieldingRate);
            safe.shieldedUntil = block.timestamp + Math.toSeconds(_shieldingHours);
        }

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount += _amount;

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amountToBorrow);
        // TODO: Mint origination fee to the fee holder
        //sbdToken.mint(feeHolder, originationFee);
    }

    // borrow function
    function borrow(bytes32 _safeId, uint256 _amount) external {
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can repay");
        SBStructs.Safe storage safe = safes[_safeId];
        require(safe.depositedAmount > 0, "Safe does not exist");

        IPriceOracle priceOracle = IPriceOracle(
            whitelistedTokens[safe.token].priceOracle
        );

        // Fetch the price of the collateral from the oracle
        uint256 price = priceOracle.getPrice();

        // Calculate the maximum borrowable amount
        uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) /
            liquidationRatio;

        // Check if the requested amount is within the maximum borrowable limit
        require(
            safe.borrowedAmount + _amount <= maxBorrowAmount,
            "Borrow amount exceeds the maximum allowed"
        );

        // Calculate origination fee
        uint256 originationFee = (_amount * originationFeeRateBasisPoints) /
            BASIS_POINTS_DIVISOR;

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount += _amount;
        //safe.originationFeePaid += originationFee;

        // Mint SBD tokens to the borrower
        sbdToken.mint(msg.sender, _amount - originationFee);
        // TODO: Mint origination fee to the fee holder
        //sbdToken.mint(feeHolder, originationFee);
    }

    // Repay function
    function repay(bytes32 _safeId, uint256 _amount) external {
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can repay");
        SBStructs.Safe storage safe = safes[_safeId];
        require(safe.borrowedAmount > 0, "No borrowed amount to repay");

        // Check if the repayment amount is valid
        require(
            _amount <= safe.borrowedAmount,
            "Repayment amount exceeds borrowed amount"
        );

        // Calculate the origination fee (assuming it's a percentage of the borrowed amount)
        uint256 originationFee = (safe.borrowedAmount *
            originationFeeRateBasisPoints) / BASIS_POINTS_DIVISOR;

        // Burn SBD tokens from the user to repay the borrowed amount
        sbdToken.burnFrom(msg.sender, _amount + originationFee);

        // Update the Safe's borrowed amount and origination fee paid
        safe.borrowedAmount -= _amount;
        // safe.originationFeePaid += originationFee;

        // Check if the borrowed amount is fully repaid
        if (safe.borrowedAmount == 0) {
            // Reset the borrowed amount and origination fee paid
            safe.borrowedAmount = 0;
            // safe.originationFeePaid = 0;
        }
    }

    // Withdraw collateral function
    function withdrawCollateral(bytes32 _safeId, uint256 _amount) external {
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can withdraw collateral");
        SBStructs.Safe storage safe = safes[_safeId];
        require(safe.depositedAmount > 0, "No collateral to withdraw");

        if (safe.borrowedAmount > 0) {
            // Calculate the price of the collateral
            IPriceOracle priceOracle = IPriceOracle(
                whitelistedTokens[safe.token].priceOracle
            );
            uint256 price = priceOracle.getPrice();

            // Calculate the maximum withdrawal amount that maintains the liquidation ratio
            uint256 maxWithdrawal = safe.depositedAmount -
                (safe.borrowedAmount * liquidationRatio) /
                (price * 100);
            require(_amount <= maxWithdrawal, "Insufficient collateral");

            // Check if the remaining collateral is sufficient to cover the borrowed amount after withdrawal
            require(
                ((safe.depositedAmount - _amount) * price * 100) /
                    safe.borrowedAmount >=
                    liquidationRatio,
                "Insufficient collateral after withdrawal"
            );
        } else {
            // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
            require(_amount <= safe.depositedAmount, "Insufficient collateral");
        }

        // Withdraw ETH or ERC20 token using SBUtils library
        SBUtils.withdrawEthOrToken(safe.token, msg.sender, _amount);

        // Update the Safe's deposited amount
        safe.depositedAmount -= _amount;
    }

    function renewProtection(address _safe, uint256 _shieldingRate) public {
        // Only the owner can update the shielding rate
        require(msg.sender == owner, "Only the owner can update the shielding rate");
        // Update the shielding rate for the safe
        shieldingRates[_safe] = _shieldingRate;
    }

    event SafeShielded(bytes32 _safeId, address owner, uint256 shieldingUntil);

    function extendProtectionUntil(bytes32 _safeId, uint256 _shieldingUntil) public {
        // bytes32 safeId = SBUtils.getSafeId(msg.sender, _token);
        // SBStructs.Safe storage safe = safes[safeId];
        require(safeOwners[_safeId] == msg.sender, "Only the safe owner can extend protection");
        SBStructs.Safe storage safe = safes[_safeId];
        require(safe.owner == msg.sender, "Safe does not exist");
        safe.shieldedUntil = _shieldingUntil;
        // shieldedSafes.insert(uint(_safeId), 0, 0);
        IDoublyLinkedList(shieldedSafes).upsert(uint(_safeId), 0, 0);
        emit SafeShielded(_safeId, msg.sender, _shieldingUntil);
    }

    // Function to redeem SBD tokens for the underlying collateral
    function redeem(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");

    uint256 totalRedeemed = 0;

    // Check for Expired Safes
    uint256 currentShieldedSafe = IDoublyLinkedList(shieldedSafes).getHead();
    while (currentShieldedSafe != 0 && totalRedeemed < _amount) {
        bytes32 _safeId = bytes32(currentShieldedSafe); // Convert uint256 to bytes32
        SBStructs.Safe storage safe = safes[_safeId];
        if (safe.shieldedUntil <= block.timestamp) {
            // Check the Reserve Ratio
            uint256 reserveRatio = getReserveRatio(safe);
            if (reserveRatio >= liquidationRatio) {
                // Set a Target Shielding Rate
                uint256 targetShieldingRate = getTargetShieldingRate(safe);
                if (targetShieldingRate > 0) {
                    uint256 redeemableAmount = getCollateralValue(safe);
                    if (redeemableAmount > 0) {
                        uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
                        redeemSafe(_safeId, toRedeem, targetShieldingRate);
                        totalRedeemed += toRedeem;
                    }
                }
            }
            currentShieldedSafe = IDoublyLinkedList(shieldedSafes).get(currentShieldedSafe).next;
        } else {
            break;
        }
    }

    // If we still have amount to redeem, check reserve ratio
    if (totalRedeemed < _amount) {
        uint256 currentReserveSafe = IDoublyLinkedList(orderedReserveRatios).getHead();
        while (currentReserveSafe != 0 && totalRedeemed < _amount) {
            bytes32 _safeId = bytes32(currentReserveSafe); 
            SBStructs.Safe storage safe = safes[_safeId];
            uint256 reserveRatio = getReserveRatio(safe);
            if (reserveRatio >= liquidationRatio) {
                uint256 redeemableAmount = getCollateralValue(safe);
                if (redeemableAmount > 0) {
                    uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
                    redeemSafe(_safeId, toRedeem, 0);
                    totalRedeemed += toRedeem;
                }
            }
            currentReserveSafe = IDoublyLinkedList(orderedReserveRatios).get(currentReserveSafe).next;
        }
    }

    // If we still have amount to redeem, check target shielding rate
    if (totalRedeemed < _amount) {
        uint256 currentShieldingSafe = IDoublyLinkedList(orderedTargetShieldedRates).getHead();
        while (currentShieldingSafe != 0 && totalRedeemed < _amount) {
            bytes32 _safeId = bytes32(currentShieldingSafe);
            SBStructs.Safe storage safe = safes[_safeId];
            uint256 targetShieldingRate = getTargetShieldingRate(safe);
            if (targetShieldingRate > 0) {
                uint256 redeemableAmount = getCollateralValue(safe);
                if (redeemableAmount > 0) {
                    uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
                    redeemSafe(_safeId, toRedeem, targetShieldingRate);
                    totalRedeemed += toRedeem;
                }
            }
            currentShieldingSafe = IDoublyLinkedList(orderedTargetShieldedRates).get(currentShieldingSafe).next;
        }
    }

    require(totalRedeemed == _amount, "Unable to redeem full amount");
    sbdToken.burnFrom(msg.sender, _amount);

    // Return a success status
    return;
    }

    function getReserveRatio(SBStructs.Safe storage safe) internal view returns (uint256) {
        // Calculate the reserve ratio based on the safe's collateral and borrowed amount
        uint256 collateralValue = getCollateralValue(safe);
        uint256 borrowedAmount = safe.borrowedAmount;
        return (collateralValue * liquidationRatio) / borrowedAmount;
    }

    function getTargetShieldingRate(SBStructs.Safe storage safe) internal view returns (uint256) {
        // Calculate the target shielding rate based on the safe's collateral and borrowed amount
        uint256 collateralValue = getCollateralValue(safe);
        uint256 borrowedAmount = safe.borrowedAmount;
        return (collateralValue * targetShieldingRateMultiplier) / borrowedAmount;
    }

    function getCollateralValue(SBStructs.Safe storage safe) internal view returns (uint256) {
        // Calculate the collateral value based on the safe's collateral asset and amount
        uint256 collateralAmount = safe.depositedAmount;
        uint256 collateralPrice = getCollateralPrice(safe.token);
        return collateralAmount * collateralPrice;
   }

    function getCollateralPrice(address collateralAsset) internal view returns (uint256) {
        IPriceOracle priceOracle = IPriceOracle(whitelistedTokens[collateralAsset].priceOracle);
        uint256 price = priceOracle.getPrice();
        return price;
    }

    function redeemSafe(bytes32 _safeId, uint256 amountToRedeem, uint256 targetShieldingRate) internal {
        SBStructs.Safe storage safe = safes[_safeId];
        uint256 amountInCollateral = amountToRedeem / getCollateralValue(safe);
        safe.depositedAmount -= amountInCollateral;
        safe.borrowedAmount -= amountToRedeem;
        if (targetShieldingRate > 0) {
            safe.rates = targetShieldingRate;
        }
        emit Redeemed(_safeId, amountToRedeem);
    }
       
}
