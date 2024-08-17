const { ethers } = require("hardhat");

async function takeODLLSnapshot(address, id) {
    const odll = await ethers.getContractAt("OrderedDoublyLinkedList", address);
    let head = await odll.getHead();
    let tail = await odll.getTail();
    const snapshot = {
        head,
        tail
    };
    if (id) {
      let value = await odll.get(id);
      snapshot.value = value;
    }
    return snapshot;
}

async function takeContractSnapshots(stableBaseCDP, sbdToken, collateralToken, safeId, userdetails) {
    const snapshot = {};
    // 1. Take a snapshot of the reserve pool (stake for safeId, totalTokensInPool)
    const reservePoolAddress = await stableBaseCDP.reservePool();
    const reservePool = await ethers.getContractAt("ReservePool", reservePoolAddress);
    const reservePoolSnapshot = await reservePool.getStake(safeId);
    snapshot.reservePool = {
        balance: await sbdToken.balanceOf(reservePoolAddress),
        stake: reservePoolSnapshot
    };

    // 2. Take a snapshot of the target shielding rate list (head, tail, SafeId)
    const targetShieldingRateListAddress = await stableBaseCDP.orderedTargetShieldedRates();
    snapshot.targetShieldingRateList = await takeODLLSnapshot(targetShieldingRateListAddress, safeId);
    // 3. Take a snapshot of the reserve ratio list (head, tail, SafeId)
    const reserveRatioListAddress = await stableBaseCDP.orderedReserveRatios();
    snapshot.reserveRatioList = await takeODLLSnapshot(reserveRatioListAddress, safeId);

    // 4. Take a snapshot of the total supply of SBD tokens
    snapshot.sbdToken = {
       totalSupply: await sbdToken.totalSupply()
    }
    // 5. Safe
    snapshot.safe = await stableBaseCDP.safes(safeId);

    // 6. Total eth or collateral of the address
    snapshot.user = {
        eth: await ethers.provider.getBalance(userdetails.address),
        sbd: await sbdToken.balanceOf(userdetails.address),
    };
    // 7. SBD token balance of the address
    if (userdetails.collateral) {
        snapshot.user.collateral = await collateralToken.balanceOf(userdetails.address);
    }

    // 8. Reference shielding rate
    snapshot.referenceShieldingRate = await stableBaseCDP.referenceShieldingRate();

    // 9. Expired Safe list
    const shieldedSafesAddress = await stableBaseCDP.shieldedSafes();
    snapshot.shieldedSafes = await takeODLLSnapshot(shieldedSafesAddress, safeId);

    return snapshot;
}

async function borrow(contracts, user, safeId, borrowAmount, borrowParams) {
    const contractSnapshotBeforeBorrow = await takeContractSnapshots(contracts.stableBaseCDP, contracts.sbdToken, contracts.mockToken, safeId, { address: user.address, collateral: true });
    let _borrowParams;
    if (borrowParams.reserveRatio) {
        const _nearestSpotForReserveRatio = borrowParams.nearestSpotForReserveRatio | ethers.ZeroHash;
        const _nearestSpotForTargetShieldingRate = borrowParams.nearestSpotForTargetShieldingRate | ethers.ZeroHash;
        const reserveRatioEnabled = 1;
        const reserveRatio = borrowParams.reserveRatio * 100// 5%
        const targetShieldingRate = borrowParams.targetShieldingRate * 100; // 8%
        const targetShieldingRateEnabled = 1;
        // 1- reserve ratio, 5- reserve ratio value, 1- target shielding rate, 8- target shielding rate value 
        // targetShieldingRate(14 bits) | targetShieldingRateEnabled(2 bits) | reserveRatio(14 bits) | reserveRatioEnabled(2 bits)
        const _compressedRate = reserveRatioEnabled | (reserveRatio << 2) | (targetShieldingRateEnabled << 16) | (targetShieldingRate << 18); 
        console.log(_compressedRate.toString(16), _compressedRate.toString(2), _nearestSpotForRate);
        _borrowParams = ethers.solidityPacked(["uint32", "uint256", "uint256"], [BigInt(_compressedRate), BigInt(_nearestSpotForReserveRatio), BigInt(_nearestSpotForTargetShieldingRate)]);
    } else if (borrowParams.shieldingRate) {
        const _nearestSpotInShieldedSafe = borrowParams.nearestSpotInShieldedSafe | ethers.ZeroHash;
        const reserveRatioEnabled = 0;
        const shieldingRate = borrowParams.shieldingRate * 100; // 5%
        // 1- shielding rate, 5- shielding rate value
        // shieldingRate(14 bits) | shieldingRateEnabled(2 bits)
        const _compressedRate = reserveRatioEnabled | (shieldingRate << 2);
        _borrowParams = ethers.solidityPacked(["uint32", "uint256"], [BigInt(_compressedRate), BigInt(_nearestSpotForRate)]);
    }
    await stableBaseCDP.connect(user).borrowWithParams(ethers.ZeroAddress, borrowAmount, borrowParams);
    const contractSnapshotAfterBorrow = await takeContractSnapshots(contracts.stableBaseCDP, contracts.sbdToken, contracts.mockToken, safeId, { address: user.address, collateral: true });
    return { contractSnapshotBeforeBorrow, contractSnapshotAfterBorrow };
}

module.exports = { takeODLLSnapshot, takeContractSnapshots, borrow };