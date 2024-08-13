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

module.exports = { takeODLLSnapshot, takeContractSnapshots };