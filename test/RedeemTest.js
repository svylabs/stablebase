const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");



describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, user, priceOracle, mockOracle;
  const safeId = 1;
  const price = BigInt(1000); // Price of the token

  beforeEach(async function () {
    [owner, borrower1, borrower2, borrower3, redeemer] = await ethers.getSigners();

    // Deploy SBDToken
    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // Deploy StableBaseCDP with the price oracle address
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    // stableBaseCDP = await StableBaseCDPFactory.deploy(sbdToken.target);
    stableBaseCDP = await StableBaseCDPFactory.deploy(await sbdToken.getAddress());
    await stableBaseCDP.waitForDeployment();

    // Set the minter to StableBaseCDP contract
    // await sbdToken.setMinter(stableBaseCDP.target);
    await sbdToken.setMinter(await stableBaseCDP.getAddress());

    // Deploy a mock ERC20 token
    const MockToken = await ethers.getContractFactory("SBDToken");
    mockToken = await MockToken.deploy("Mock Token", "MKT");
    await mockToken.waitForDeployment();

    // Mint tokens to owner so that we can transfer them to user
    await mockToken.mint(owner.address, ethers.parseEther("1000"));

    // Transfer some tokens to user
    await mockToken.transfer(borrower1.address, ethers.parseEther("100"));
    await mockToken.transfer(borrower2.address, ethers.parseEther("0.9"));
  });

  it("Redeem test - non expired safes", async function() {
    const safe1Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 8,
        borrowAmount: 50 // 50%
    };
    const safe2Params = {
        depositAmount: 2,
        shieldingRate: 1,
        borrowAmount: 50 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    //console.log(safe1, safe2);
    const snapshotsBeforeRedeem = {};
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    //console.log("Snapshot before redeem:", snapshotsBeforeRedeem);
    const redeemAmount = ethers.parseEther("0.9"); // 
    // send the redeem amount to the redeemer
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount);
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    //console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x0000000000000000000000000000000000000000000000000000000000000000"
    const result = await stableBaseCDP.connect(redeemer).redeem(redeemAmount, redeemParams);
    const redeemTx = await result.wait();
    const snapshotsAfterRedeem = {};
    snapshotsAfterRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsAfterRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsAfterRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT for redeemer before / after redeem:", snapshotsBeforeRedeem.redeemer, snapshotsAfterRedeem.redeemer);
    console.log("SNAPSHOT for safe1 before / after redeem:", snapshotsBeforeRedeem.safe1, snapshotsAfterRedeem.safe1);

    // Checks:
    // 1. Redeem amount should have been deducted from the redeemer's balance for SBD tokens
    expect(snapshotsAfterRedeem.redeemer.user.sbd).to.equal(0);
    
    // 2. Collateral should have been transferred to the redeemer's address
    const gasUsed = redeemTx.gasUsed;
    const gasPrice = redeemTx.gasPrice;
    const ethSpent = gasUsed * (gasPrice);
    console.log(ethSpent);
    const collateralAmount = redeemAmount / BigInt(system.price);
    console.log(collateralAmount);
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount - collateralAmount);

    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount - redeemAmount);

    // 5. No impact to Safe2 as it's not expired
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount);
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount);
    // 6. No impact on target shielding rate
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(snapshotsBeforeRedeem.safe1.targetShieldingRateList.value.value);
  });

  it("Redeem test - with expired safes", async function() {
    const safe1Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 8,
        borrowAmount: 50 // 50%
    };
    const safe2Params = {
        depositAmount: 2,
        shieldingRate: 0,
        borrowAmount: 50 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    //console.log(safe1, safe2);
    const snapshotsBeforeRedeem = {};
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    //console.log("Snapshot before redeem:", snapshotsBeforeRedeem);
    const redeemAmount = ethers.parseEther("0.9"); // 
    // send the redeem amount to the redeemer
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount);
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    //console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x0000000000000000000000000000000000000000000000000000000000000000"
    const result = await stableBaseCDP.connect(redeemer).redeem(redeemAmount, redeemParams);
    const redeemTx = await result.wait();
    const snapshotsAfterRedeem = {};
    snapshotsAfterRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsAfterRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsAfterRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT for redeemer before / after redeem:", snapshotsBeforeRedeem.redeemer, snapshotsAfterRedeem.redeemer);
    console.log("SNAPSHOT for safe1 before / after redeem:", snapshotsBeforeRedeem.safe1, snapshotsAfterRedeem.safe1);

    // Checks:
    // 1. Redeem amount should have been deducted from the redeemer's balance for SBD tokens
    expect(snapshotsAfterRedeem.redeemer.user.sbd).to.equal(0);
    
    // 2. Collateral should have been transferred to the redeemer's address
    const gasUsed = redeemTx.gasUsed;
    const gasPrice = redeemTx.gasPrice;
    const ethSpent = gasUsed * (gasPrice);
    console.log(ethSpent);
    const collateralAmount = redeemAmount / BigInt(system.price);
    console.log(collateralAmount);
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount);

    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount);

    // 5. No impact to Safe2 as it's not expired
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount - collateralAmount);
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount - redeemAmount);
    // 6. No impact on target shielding rate
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(snapshotsBeforeRedeem.safe1.targetShieldingRateList.value.value);

  });

  it("Redeem test - non expired safes - redeem based on target shielding rates", async function() {
    const safe1Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 8,
        borrowAmount: 50 // 50%
    };
    const safe2Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 1,
        borrowAmount: 75 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    //console.log(safe1, safe2);
    const snapshotsBeforeRedeem = {};
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT before redeem:", snapshotsBeforeRedeem);
    const redeemAmount = ethers.parseEther("150"); // 
    // send the redeem amount to the redeemer
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount);
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    //console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x0000000000000000000000000000000000000000000000000000000000000000"
    const result = await stableBaseCDP.connect(redeemer).redeem(redeemAmount, redeemParams);
    const redeemTx = await result.wait();
    const snapshotsAfterRedeem = {};
    snapshotsAfterRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsAfterRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsAfterRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT for redeemer before / after redeem:", snapshotsBeforeRedeem.redeemer, snapshotsAfterRedeem.redeemer);
    console.log("SNAPSHOT for safe1 before / after redeem:", snapshotsBeforeRedeem.safe1, snapshotsAfterRedeem.safe1);
    console.log("SNAPSHOT for safe2 before / after redeem:", snapshotsBeforeRedeem.safe2, snapshotsAfterRedeem.safe2);

    // Checks:
    // 1. Redeem amount should have been deducted from the redeemer's balance for SBD tokens
    expect(snapshotsAfterRedeem.redeemer.user.sbd).to.equal(0);
    
    // 2. Collateral should have been transferred to the redeemer's address
    const gasUsed = redeemTx.gasUsed;
    const gasPrice = redeemTx.gasPrice;
    const ethSpent = gasUsed * (gasPrice);
    console.log(ethSpent);
    const collateralAmount = redeemAmount / BigInt(system.price);
    console.log(collateralAmount);
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount - collateralAmount);

    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount - redeemAmount);

    // 5. No impact to Safe2 as it's not expired
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount);
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount);
    // 6. No impact on target shielding rate
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(snapshotsBeforeRedeem.safe1.targetShieldingRateList.value.value);
    // 7. Reserve ratio of safe1 should have been updated
    const reserveRatioFromReservePoolStake = (snapshotsAfterRedeem.safe1.reservePool.stake * BigInt(10000) / snapshotsAfterRedeem.safe1.safe.borrowedAmount);
    expect(snapshotsAfterRedeem.safe1.reserveRatioList.value.value).to.equal(reserveRatioFromReservePoolStake);
  });

});