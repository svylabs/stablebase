const { ethers } = require("hardhat");

async function takeODLLSnapshot(odll, id) {
    //const odll = await ethers.getContractAt("OrderedDoublyLinkedList", address);
    let head = await odll.getHead();
    let tail = await odll.getTail();
    const snapshot = {
        head,
        tail
    };
    if (id) {
      let node = await odll.getNode(id);
      snapshot.node = node;
    }
    snapshot.address = odll.target;
    snapshot.all = [];
    let safeId = head;
    do {
        const data = await odll.getNode(safeId);
        snapshot.all.push({data, safeId});
        safeId = data.next;
    } while (safeId != BigInt(0));
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

async function takeUserSnapshots(contracts, safeId, user) {
    const snapshots = {};
    snapshots.sbdBalance = await contracts.sbdToken.balanceOf(user.address);
    snapshots.sbrBalance = await contracts.sbrToken.balanceOf(user.address);
    snapshots.sbrStake = await contracts.sbrStaking.stakes(user.address);
    snapshots.ethBalance = await ethers.provider.getBalance(user.address);
    const rewards = await contracts.stabilityPool.userPendingRewardAndCollateral(user.address);
    snapshots.stabilityPool = {
        stake: await contracts.stabilityPool.getUser(user.address),
        reward: rewards[0],
        collateral: rewards[1],
        sbrReward: rewards[2]
    }
    return snapshots;
}

async function takeContractSnapshots(contracts, safeId, user) {
    const snapshots = {};
    //console.log(contracts.stableBaseCDP);
    snapshots.stableBaseCDP = await takeCDPSnapshot(contracts, safeId);
    snapshots.stabilityPoolSnapshot = await takeStabilityPoolSnapshot(contracts);
    snapshots.sbdSnapshot = await takeSBDSnapshot(contracts);
    snapshots.sbrSnapshot = await takeSBRSnapshot(contracts);
    snapshots.sbrStakingSnapshot = await takeSBRStakingSnapshot(contracts);
    snapshots.safe = await contracts.stableBaseCDP.safes(safeId);
    snapshots.user = await takeUserSnapshots(contracts, safeId, user);
    return snapshots;
}

async function borrow(user, safeId, collateral, borrowAmount, shieldingRate, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId, user);
    const existingSafe = await contracts.stableBaseCDP.safes(safeId);
    //console.log(existingSafe, safeId, existingSafe.borrowedAmount, existingSafe.collateralAmount);
    if (existingSafe.borrowedAmount == BigInt(0) && existingSafe.collateralAmount == BigInt(0)) {
        //console.log("Opening safe");
        await contracts.stableBaseCDP.connect(user).openSafe(safeId, collateral, { value: collateral });
    }
    const fee = borrowAmount * shieldingRate;
    const tx = await contracts.stableBaseCDP.connect(user).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * tx.gasPrice;
    const newSafe = await contracts.stableBaseCDP.safes(safeId);
    const newSnapshot = await takeContractSnapshots(contracts, safeId, user);
    return {
        safeId,
        gasPaid,
        borrowAmount,
        fee,
        existingSafe,
        newSafe,
        existingSnapshot,
        newSnapshot
    }
}

async function feeTopup(user, safeId, feeRate, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId, user);
    const totalFee = (existingSnapshot.safe.borrowedAmount * feeRate ) / BigInt(10000);
    await contracts.sbdToken.connect(user).approve(contracts.stableBaseCDP.target, totalFee);
    const tx = await contracts.stableBaseCDP.connect(user).feeTopup(safeId, feeRate, BigInt(0));
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * tx.gasPrice;
    const newSnapshot = await takeContractSnapshots(contracts, safeId, user);
    return {
        safeId,
        gasPaid,
        feeRate,
        existingSnapshot,
        newSnapshot
    }
}

async function repay(user, safeId, repayAmount, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId, user);
    await contracts.sbdToken.connect(user).approve(contracts.stableBaseCDP.target, repayAmount);
    const tx = await contracts.stableBaseCDP.connect(user).repay(safeId, repayAmount, BigInt(0));
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * tx.gasPrice;
    const newSnapshot = await takeContractSnapshots(contracts, safeId, user);
    return {
        safeId,
        gasPaid,
        repayAmount,
        existingSnapshot,
        newSnapshot
    }
}

async function addCollateral(user, safeId, additionalCollateral, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId, user);
    const tx = await contracts.stableBaseCDP.connect(user).addCollateral(safeId, additionalCollateral, BigInt(0), { value: additionalCollateral });
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * tx.gasPrice;
    const newSnapshot = await takeContractSnapshots(contracts, safeId, user);
    return {
        safeId,
        gasPaid,
        additionalCollateral,
        existingSnapshot,
        newSnapshot
    }
}

async function withdrawCollateral(user, safeId, withdrawCollateral, contracts) {
    const existingSnapshot = await takeContractSnapshots(contracts, safeId, user);
    const tx = await contracts.stableBaseCDP.connect(user).withdrawCollateral(safeId, withdrawCollateral, BigInt(0));
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * tx.gasPrice;
    const newSnapshot = await takeContractSnapshots(contracts, safeId, user);
    return {
        safeId,
        gasPaid,
        withdrawCollateral,
        existingSnapshot,
        newSnapshot
    }
}

module.exports = { borrow, feeTopup, repay, addCollateral, takeContractSnapshots, withdrawCollateral};