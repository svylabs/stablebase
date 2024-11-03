const { ethers } = require("hardhat");

async function takeODLLSnapshot(odll, id) {
    //const odll = await ethers.getContractAt("OrderedDoublyLinkedList", address);
    console.log(odll);
    let head = await odll.getHead();
    let tail = await odll.getTail();
    const snapshot = {
        head,
        tail
    };
    if (id) {
      let value = await odll.getNode(id);
      snapshot.value = value;
    }
    snapshot.address = odll.target;
    return snapshot;
}

async function takeCDPSnapshot(contracts, safeId) {
    const snapshot = {};
    snapshot.eth_balance = await ethers.provider.getBalance(contracts.stableBaseCDP.target);
    snapshot.sbd_balance = await contracts.sbdToken.balanceOf(contracts.stabilityPool.target);
    snapshot.cumulativeDebtPerUnitCollateral = await contracts.stableBaseCDP.cumulativeDebtPerUnitCollateral();
    snapshot.cumulativeCollateralPerUnitCollateral = await contracts.stableBaseCDP.cumulativeCollateralPerUnitCollateral();
    snapshot.totalCollateral = await contracts.stableBaseCDP.totalCollateral();
    snapshot.totalDebt = await contracts.stableBaseCDP.totalDebt();
    snapshot.redemptionQueue = await takeODLLSnapshot(contracts.redemptionQueue, safeId);
    snapshot.liquidationQueue = await takeODLLSnapshot(contracts.liquidationQueue, safeId);
    return snapshot;
}

async function takeStabilityPoolSnapshot(contracts) {
    const snapshot = {};
    snapshot.eth_balance = await ethers.provider.getBalance(contracts.stabilityPool.target);
    snapshot.sbd_balance = await contracts.sbdToken.balanceOf(contracts.stabilityPool.target);
    snapshot.totalStakedRaw = await contracts.stabilityPool.totalStakedRaw();
    snapshot.stakeResetCount = await contracts.stabilityPool.stakeResetCount();
    snapshot.stakeScalingFactor = await contracts.stabilityPool.stakeScalingFactor();
    snapshot.totalRewardPerToken = await contracts.stabilityPool.totalRewardPerToken();
    snapshot.totalCollateralPerToken = await contracts.stabilityPool.totalCollateralPerToken();
    snapshot.totalSBRPerToken = await contracts.stabilityPool.totalSbrRewardPerToken();
    return snapshot;
}

async function takeSBDSnapshot(contracts) {
    const snapshot = {};
    snapshot.totalSupply = await contracts.sbdToken.totalSupply();
    return snapshot;
}

async function takeSBRSnapshot(contracts) {
    const snapshot = {};
    snapshot.totalSupply = await contracts.sbrToken.totalSupply();
    return snapshot;
}

async function takeSBRStakingSnapshot(contracts) {
    const snapshot = {};
    snapshot.totalStaked = await contracts.sbrStaking.totalStake();
    snapshot.totalRewardPerToken = await contracts.sbrStaking.totalRewardPerToken();
    snapshot.totalCollateralPerToken = await contracts.sbrStaking.totalCollateralPerToken();
    return snapshot;
}

async function takeContractSnapshots(contracts, safeId) {
    const snapshots = {};
    //console.log(contracts.stableBaseCDP);
    snapshots.stableBaseCDP = await takeCDPSnapshot(contracts, safeId);
    snapshots.stabilityPoolSnapshot = await takeStabilityPoolSnapshot(contracts);
    snapshots.sbdSnapshot = await takeSBDSnapshot(contracts);
    snapshots.sbrSnapshot = await takeSBRSnapshot(contracts);
    snapshots.sbrStakingSnapshot = await takeSBRStakingSnapshot(contracts);
    return snapshots;
}

async function borrow(user, safeId, collateral, borrowAmount, shieldingRate, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId);
    const existingSafe = await contracts.stableBaseCDP.safes(safeId);
    console.log(existingSafe, safeId, existingSafe.borrowedAmount, existingSafe.collateralAmount);
    if (existingSafe.borrowedAmount == BigInt(0) && existingSafe.collateralAmount == BigInt(0)) {
        console.log("Opening safe");
        await contracts.stableBaseCDP.connect(user).openSafe(safeId, collateral, { value: collateral });
    } else {
        console.log("Wrong path...");
    }
    const fee = borrowAmount * shieldingRate;
    await contracts.stableBaseCDP.connect(user).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
    const newSafe = await contracts.stableBaseCDP.safes(safeId);
    const newSnapshot = await takeContractSnapshots(contracts, safeId);
    return {
        safeId,
        borrowAmount,
        fee,
        existingSafe,
        newSafe,
        existingSnapshot,
        newSnapshot
    }
}

module.exports = { borrow };