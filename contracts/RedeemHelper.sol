// pragma solidity ^0.8.19;

// import "./StableBaseCDP.sol";
// import "./Structures.sol";
// import "./Utilities.sol";
// import "./SBDToken.sol";
// import "./dependencies/price-oracle/MockPriceOracle.sol";
// import "./interfaces/IPriceOracle.sol";
// import "./library/OrderedDoublyLinkedList.sol";

// contract RedeemHelper {
//     StableBaseCDP private stableBaseCDP;

//     constructor(address _stableBaseCDP) {
//         stableBaseCDP = StableBaseCDP(_stableBaseCDP);
//     }

//     function redeemFromShieldedSafes(uint256 _amount) external returns (uint256) {
//         uint256 totalRedeemed = 0;
//         uint256 currentShieldedSafe = stableBaseCDP.shieldedSafes().getHead();

//         while (currentShieldedSafe != 0 && totalRedeemed < _amount) {
//             bytes32 safeId = bytes32(currentShieldedSafe);
//             SBStructs.Safe storage safe = stableBaseCDP.safes(safeId);
//             if (safe.shieldedUntil <= block.timestamp) {
//                 uint256 redeemableAmount = stableBaseCDP.getCollateralValue(safe);
//                 if (redeemableAmount > 0) {
//                     uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
//                     stableBaseCDP.redeemSafe(safeId, toRedeem);
//                     totalRedeemed += toRedeem;
//                 }
//                 currentShieldedSafe = stableBaseCDP.shieldedSafes().getNode(currentShieldedSafe).next;
//             } else {
//                 break;
//             }
//         }
//         return totalRedeemed;
//     }

//     function redeemFromReserveRatios(uint256 _amount, uint256 totalRedeemed) external returns (uint256) {
//         uint256 currentReserveSafe = stableBaseCDP.orderedReserveRatios().getHead();

//         while (currentReserveSafe != 0 && totalRedeemed < _amount) {
//             bytes32 safeId = bytes32(currentReserveSafe);
//             SBStructs.Safe storage safe = stableBaseCDP.safes(safeId);
//             uint256 redeemableAmount = stableBaseCDP.getCollateralValue(safe);
//             if (redeemableAmount > 0) {
//                 uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
//                 stableBaseCDP.redeemSafe(safeId, toRedeem);
//                 totalRedeemed += toRedeem;
//             }
//             currentReserveSafe = stableBaseCDP.orderedReserveRatios().getNode(currentReserveSafe).next;
//         }
//         return totalRedeemed;
//     }

//     function redeemFromTargetShieldingRates(uint256 _amount, uint256 totalRedeemed) external returns (uint256) {
//         uint256 currentShieldingSafe = stableBaseCDP.orderedTargetShieldedRates().getHead();

//         while (currentShieldingSafe != 0 && totalRedeemed < _amount) {
//             bytes32 safeId = bytes32(currentShieldingSafe);
//             SBStructs.Safe storage safe = stableBaseCDP.safes(safeId);
//             uint256 redeemableAmount = stableBaseCDP.getCollateralValue(safe);
//             if (redeemableAmount > 0) {
//                 uint256 toRedeem = (_amount - totalRedeemed) <= redeemableAmount ? (_amount - totalRedeemed) : redeemableAmount;
//                 stableBaseCDP.redeemSafe(safeId, toRedeem);
//                 totalRedeemed += toRedeem;
//             }
//             currentShieldingSafe = stableBaseCDP.orderedTargetShieldedRates().getNode(currentShieldingSafe).next;
//         }
//         return totalRedeemed;
//     }
// }






// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.19;

// import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
// import "./Structures.sol";
// import "./Utilities.sol";
// import "./SBDToken.sol";
// import "./dependencies/price-oracle/MockPriceOracle.sol";
// import "./interfaces/IPriceOracle.sol";
// import "./library/OrderedDoublyLinkedList.sol";
// import "./RedeemHelper.sol";

// contract StableBaseCDP {
//     uint256 private originationFeeRateBasisPoints = 0; // start with 0% origination fee
//     uint256 private liquidationRatio = 110; // 110% liquidation ratio
//     uint256 private constant BASIS_POINTS_DIVISOR = 10000;

//     OrderedDoublyLinkedList public shieldedSafes;
//     OrderedDoublyLinkedList public orderedReserveRatios;
//     OrderedDoublyLinkedList public orderedTargetShieldedRates;

//     // Mapping to track Safe balances
//     mapping(bytes32 => SBStructs.Safe) public safes;

//     SBStructs.Mode public mode = SBStructs.Mode.BOOTSTRAP;

//     mapping(address => SBStructs.WhitelistedToken) public whitelistedTokens;

//     SBDToken public sbdToken;

//     // address public orderedReserveRatios;

//     // address public orderedTargetShieldedRates;

//     // address public shieldedSafes;

//     // using OrderedDoublyLinkedList for OrderedDoublyLinkedList.List;

//     // OrderedDoublyLinkedList.List shieldedSafes;
//     // OrderedDoublyLinkedList.List orderedReserveRatios;
//     // OrderedDoublyLinkedList.List orderedTargetShieldedRates;

//     RedeemHelper public redeemHelper;

//     Math.Rate public referenceShieldingRate;

//     constructor(address _sbdToken) {
//         whitelistedTokens[address(0)] = SBStructs.WhitelistedToken({
//             priceOracle: address(new MockPriceOracle()),
//             collateralRatio: 110
//         });
//         sbdToken = SBDToken(_sbdToken);
//         redeemHelper = new RedeemHelper(address(this));
//         // orderedReserveRatios = address(new OrderedDoublyLinkedList());
//         // orderedTargetShieldedRates = address(new OrderedDoublyLinkedList());
//         // shieldedSafes = address(new OrderedDoublyLinkedList());
//     }

//     /**
//      * @dev Opens a new Safe for the borrower and tracks the collateral deposited, etc.
//      * Send any amount of ERC20 tokens or ETH
//      *
//      * @param _token Address of the ERC20 token, use address(0) for ETH
//      * @param _amount Amount of tokens or ETH to deposit as collateral
//      *
//      */
//     // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 _positionInReserve) external payable {
//     // function openSafe(address _token, uint256 _amount, uint256 _reserveRatio, uint256 /*_positionInReserve*/) external payable {
//     function openSafe(address _token, uint256 _amount) external payable {
//         require(_amount > 0, "Amount must be greater than 0");
//         bytes32 id = SBUtils.getSafeId(msg.sender, _token);

//         // Create a new Safe
//         SBStructs.Safe memory safe = SBStructs.Safe({
//             token: _token,
//             depositedAmount: _amount,
//             borrowedAmount: 0,
//             rates: 0,
//             shieldedUntil: 0
//         });

//         // Deposit ETH or ERC20 token using SBUtils library
//         if (_token == address(0)) {
//             safe.depositedAmount = msg.value; // Assign ETH amount to depositedAmount
//         } else {
//             safe.depositedAmount = _amount; // Assign ERC20 amount to depositedAmount
//         }
//         SBUtils.depositEthOrToken(_token, address(this), _amount);

//         // Add the Safe to the mapping
//         safes[id] = safe;
//     }

//     /**
//      * @dev Closes a Safe and returns the collateral to the owner.
//      * Check if the borrowedAmount is 0, if there is any SB token borrowed, close should not work.
//      * Return back the collateral
//      * @param collateralToken ID of the Safe to close, derived from keccak256(msg.sender, _token)
//      */
//     function closeSafe(address collateralToken) external {
//         bytes32 id = SBUtils.getSafeId(msg.sender, collateralToken);
//         SBStructs.Safe storage safe = safes[id];
//         require(
//             safe.borrowedAmount == 0,
//             "Cannot close Safe with borrowed amount"
//         );

//         // Withdraw ETH or ERC20 token using SBUtils library (Transfer collateral back to the owner)
//         SBUtils.withdrawEthOrToken(
//             safe.token,
//             msg.sender,
//             safe.depositedAmount
//         );

//         // Remove the Safe from the mapping
//         delete safes[id];
//     }

//     /**
//      * Borrow stablecoins from the protocol
//      *
//      * _borrowParams:
//      * minimum: 36 bytes, maximum 68 bytes
//      * bytes 0-3:
//      *     bit: 0 - shieldingRate, 1 - reserveRatio
//      *     bits 1-15: rate (either shieldingRate or reserveRatio)
//      *     bit 16: 1 if target shielding rate is set, 0 otherwise
//      *     bits 17-31: target shielding rate
//      * bytes 4-35: Nearest Spot in either shieldedSafes or orderedReserveRatiosList list
//      * bytes 36-67: If exists, is always the nearest spot in the orderedTargetShieldedRatesList
//      *
//      */
//     function borrowWithParams(
//         address _token,
//         uint256 _amount,
//         bytes calldata _borrowParams
//     ) external {
//         bytes32 id = SBUtils.getSafeId(msg.sender, _token);
//         SBStructs.Safe storage safe = safes[id];
//         require(safe.depositedAmount > 0, "Safe does not exist");
//         //bytes2 _rateByte = bytes2(_borrowParams[0: 2]);
//         //uint256 _rate = uint256(uint16(_rateByte) & 0x7FFF);
//         //SBStructs.StabilityType _rateType = (uint16(_rateByte) & 0x8000) >= 1 ? SBStructs.StabilityType.RESERVE_RATIO : SBStructs.StabilityType.SHIELDING_RATE;
//         //uint256 _nearestSpot = abi.decode(_borrowParams[4:32], (uint256));

//         IPriceOracle priceOracle = IPriceOracle(
//             whitelistedTokens[_token].priceOracle
//         );

//         // Fetch the price of the collateral from the oracle
//         //uint256 price = priceOracle.getPrice();

//         // Calculate the maximum borrowable amount
//         uint256 maxBorrowAmount = (safe.depositedAmount *
//             priceOracle.getPrice() *
//             100) / liquidationRatio;

//         // Check if the requested amount is within the maximum borrowable limits
//         require(
//             safe.borrowedAmount + _amount <= maxBorrowAmount,
//             "Borrow amount exceeds the maximum allowed"
//         );

//         // Calculate reserve or shielding rate
//         (uint256 shieldingRate, uint256 shieldingEnabled) = Math.getRate(
//             0,
//             SBStructs.StabilityType.SHIELDING_RATE
//         );
//         (uint256 reserveRatio, uint256 reserveRatioEnabled) = Math.getRate(
//             0,
//             SBStructs.StabilityType.RESERVE_RATIO
//         );

//         uint256 _amountToBorrow = _amount;
//         if (reserveRatioEnabled == 1) {
//             // Calculate origination fee
//             uint256 _reservePoolDeposit = (_amount * reserveRatio) /
//                 BASIS_POINTS_DIVISOR;
//             _amountToBorrow = _amount - _reservePoolDeposit;
//         } else {
//             uint256 _shieldingFee = (_amount * shieldingRate) /
//                 BASIS_POINTS_DIVISOR;
//             _amountToBorrow = _amount - _shieldingFee;
//             // Update the Safe's shieldedUntil timestamp
//             uint256 _shieldingHours = Math.getShieldingHours(
//                 referenceShieldingRate,
//                 shieldingRate
//             );
//             safe.shieldedUntil =
//                 block.timestamp +
//                 Math.toSeconds(_shieldingHours);
//         }

//         // Update the Safe's borrowed amount and origination fee paid
//         safe.borrowedAmount += _amount;

//         // Mint SBD tokens to the borrower
//         sbdToken.mint(msg.sender, _amountToBorrow);
//         // TODO: Mint origination fee to the fee holder
//         //sbdToken.mint(feeHolder, originationFee);
//     }

//     // borrow function
//     function borrow(address _token, uint256 _amount) external {
//         bytes32 id = SBUtils.getSafeId(msg.sender, _token);
//         SBStructs.Safe storage safe = safes[id];
//         require(safe.depositedAmount > 0, "Safe does not exist");

//         IPriceOracle priceOracle = IPriceOracle(
//             whitelistedTokens[_token].priceOracle
//         );

//         // Fetch the price of the collateral from the oracle
//         uint256 price = priceOracle.getPrice();

//         // Calculate the maximum borrowable amount
//         uint256 maxBorrowAmount = (safe.depositedAmount * price * 100) /
//             liquidationRatio;

//         // Check if the requested amount is within the maximum borrowable limit
//         require(
//             safe.borrowedAmount + _amount <= maxBorrowAmount,
//             "Borrow amount exceeds the maximum allowed"
//         );

//         // Calculate origination fee
//         uint256 originationFee = (_amount * originationFeeRateBasisPoints) /
//             BASIS_POINTS_DIVISOR;

//         // Update the Safe's borrowed amount and origination fee paid
//         safe.borrowedAmount += _amount;
//         //safe.originationFeePaid += originationFee;

//         // Mint SBD tokens to the borrower
//         sbdToken.mint(msg.sender, _amount - originationFee);
//         // TODO: Mint origination fee to the fee holder
//         //sbdToken.mint(feeHolder, originationFee);
//     }

//     // Repay function
//     function repay(address _token, uint256 _amount) external {
//         bytes32 id = SBUtils.getSafeId(msg.sender, _token);
//         SBStructs.Safe storage safe = safes[id];
//         require(safe.borrowedAmount > 0, "No borrowed amount to repay");

//         // Check if the repayment amount is valid
//         require(
//             _amount <= safe.borrowedAmount,
//             "Repayment amount exceeds borrowed amount"
//         );

//         // Calculate the origination fee (assuming it's a percentage of the borrowed amount)
//         uint256 originationFee = (safe.borrowedAmount *
//             originationFeeRateBasisPoints) / BASIS_POINTS_DIVISOR;

//         // Burn SBD tokens from the user to repay the borrowed amount
//         sbdToken.burnFrom(msg.sender, _amount + originationFee);

//         // Update the Safe's borrowed amount and origination fee paid
//         safe.borrowedAmount -= _amount;
//         // safe.originationFeePaid += originationFee;

//         // Check if the borrowed amount is fully repaid
//         if (safe.borrowedAmount == 0) {
//             // Reset the borrowed amount and origination fee paid
//             safe.borrowedAmount = 0;
//             // safe.originationFeePaid = 0;
//         }
//     }

//     // Withdraw collateral function
//     function withdrawCollateral(address _token, uint256 _amount) external {
//         bytes32 id = SBUtils.getSafeId(msg.sender, _token);
//         SBStructs.Safe storage safe = safes[id];
//         require(safe.depositedAmount > 0, "No collateral to withdraw");

//         if (safe.borrowedAmount > 0) {
//             // Calculate the price of the collateral
//             IPriceOracle priceOracle = IPriceOracle(
//                 whitelistedTokens[_token].priceOracle
//             );
//             uint256 price = priceOracle.getPrice();

//             // Calculate the maximum withdrawal amount that maintains the liquidation ratio
//             uint256 maxWithdrawal = safe.depositedAmount -
//                 (safe.borrowedAmount * liquidationRatio) /
//                 (price * 100);
//             require(_amount <= maxWithdrawal, "Insufficient collateral");

//             // Check if the remaining collateral is sufficient to cover the borrowed amount after withdrawal
//             require(
//                 ((safe.depositedAmount - _amount) * price * 100) /
//                     safe.borrowedAmount >=
//                     liquidationRatio,
//                 "Insufficient collateral after withdrawal"
//             );
//         } else {
//             // If there's no borrowed amount, ensure the withdrawal does not exceed deposited collateral
//             require(_amount <= safe.depositedAmount, "Insufficient collateral");
//         }

//         // Withdraw ETH or ERC20 token using SBUtils library
//         SBUtils.withdrawEthOrToken(safe.token, msg.sender, _amount);

//         // Update the Safe's deposited amount
//         safe.depositedAmount -= _amount;
//     }

//     // Function to redeem SBD tokens for the underlying collateral - using the new helper contract
//     function redeem(uint256 _amount) external {
//         require(_amount > 0, "Amount must be greater than 0");

//         uint256 totalRedeemed = 0;

//         totalRedeemed = redeemHelper.redeemFromShieldedSafes(_amount);

//         if (totalRedeemed < _amount) {
//             totalRedeemed = redeemHelper.redeemFromReserveRatios(_amount, totalRedeemed);
//         }

//         if (totalRedeemed < _amount) {
//             totalRedeemed = redeemHelper.redeemFromTargetShieldingRates(_amount, totalRedeemed);
//         }

//         require(totalRedeemed == _amount, "Unable to redeem full amount");
//         sbdToken.burnFrom(msg.sender, _amount);
//     }

//     // Utility function to get collateral value
//     function getCollateralValue(SBStructs.Safe storage safe) internal view returns (uint256) {
//         IPriceOracle priceOracle = IPriceOracle(whitelistedTokens[safe.token].priceOracle);
//         uint256 price = priceOracle.getPrice();
//         return safe.depositedAmount * price;
//     }

//     // function redeemSafe(uint256 safeId, uint256 amountToRedeem) internal {
//     function redeemSafe(bytes32 safeId, uint256 amountToRedeem) internal {
//         SBStructs.Safe storage safe = safes[safeId];
//         uint256 amountInCollateral = amountToRedeem / getCollateralValue(safe);
//         safe.depositedAmount -= amountInCollateral;
//         SBUtils.withdrawEthOrToken(safe.token, msg.sender, amountInCollateral);
//         safe.borrowedAmount -= amountToRedeem;
//             if (safe.borrowedAmount == 0) {
//                 delete safes[safeId];
//             }
//     }

       
// }
