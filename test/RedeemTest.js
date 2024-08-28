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

  it("Redeem multiple safes test - non expired safes - redeem based on target shielding rates and then by reserve ratio", async function() {
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
    let redeemAmount1 = ethers.parseEther("1200"); // 
    let redeemAmount2 = ethers.parseEther("500"); // 
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount1);
    await sbdToken.connect(borrower1).transfer(redeemer.address, redeemAmount2);
    const redeemAmount = redeemAmount1 + redeemAmount2;
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT before redeem:", snapshotsBeforeRedeem);
    redeemAmount1 = snapshotsBeforeRedeem.safe1.safe.borrowedAmount;
    redeemAmount2 = redeemAmount - redeemAmount1;
    
    // send the redeem amount to the redeemer
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
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
    const collateralAmount1 = redeemAmount1 / BigInt(system.price);
    const collateralAmount2 = redeemAmount2 / BigInt(system.price);
    console.log(collateralAmount);
    
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount - collateralAmount1);
    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount - redeemAmount1);
    // 5. Should have been removed from the target shielding rate list
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(0);
    // 6. Should have been removed from reserve ratio list
    expect(snapshotsAfterRedeem.safe1.reserveRatioList.value.value).to.equal(0);


    // 7. Safe2's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount - collateralAmount2);
    // 8. Safe2's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount - redeemAmount2);
    expect(snapshotsAfterRedeem.safe2.targetShieldingRateList.value.value).to.equal(100);
    // 9. Should have been removed from reserve ratio list
    const reserveRatioFromReservePoolStake = (snapshotsAfterRedeem.safe2.reservePool.stake * BigInt(10000) / snapshotsAfterRedeem.safe2.safe.borrowedAmount);
    expect(snapshotsAfterRedeem.safe2.reserveRatioList.value.value).to.equal(reserveRatioFromReservePoolStake);

    // Reference rate should have updated
    expect((snapshotsAfterRedeem.safe2.referenceShieldingRate.weightedSum  * BigInt(100)) / snapshotsAfterRedeem.safe2.referenceShieldingRate.totalWeight).to.equal(snapshotsAfterRedeem.safe2.targetShieldingRateList.value.value * BigInt(100));
    console.log(gasUsed);
    
  });

  it("Redeem multiple safes test - with expired safes - redeem based on expired safes, target shielding rates and then by reserve ratio", async function() {
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
    const safe3Params = {
        depositAmount: 0.1,
        shieldingRate: 0,
        borrowAmount: 50 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    const safe3 = await utils.setupUserSafe(borrower3, safe3Params, system);
    //console.log(safe1, safe2);
    const snapshotsBeforeRedeem = {};
    let redeemAmount1 = ethers.parseEther("1200"); // 
    let redeemAmount2 = ethers.parseEther("500"); // 
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount1);
    await sbdToken.connect(borrower1).transfer(redeemer.address, redeemAmount2);
    const redeemAmount = redeemAmount1 + redeemAmount2;
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.safe3 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe3.safeId, { address: borrower3.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT before redeem:", snapshotsBeforeRedeem);
    let redeemAmount3 = snapshotsBeforeRedeem.safe3.safe.borrowedAmount
    redeemAmount1 = snapshotsBeforeRedeem.safe1.safe.borrowedAmount;
    redeemAmount2 = redeemAmount - redeemAmount1 - redeemAmount3;
    
    // send the redeem amount to the redeemer
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    const result = await stableBaseCDP.connect(redeemer).redeem(redeemAmount, redeemParams);
    const redeemTx = await result.wait();
    const snapshotsAfterRedeem = {};
    snapshotsAfterRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsAfterRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsAfterRedeem.safe3 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe3.safeId, { address: borrower3.address });
    snapshotsAfterRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT for redeemer before / after redeem:", snapshotsBeforeRedeem.redeemer, snapshotsAfterRedeem.redeemer);
    console.log("SNAPSHOT for safe1 before / after redeem:", snapshotsBeforeRedeem.safe1, snapshotsAfterRedeem.safe1);
    console.log("SNAPSHOT for safe2 before / after redeem:", snapshotsBeforeRedeem.safe2, snapshotsAfterRedeem.safe2);
    console.log("SNAPSHOT for SAFE3 before / after redeem:", snapshotsBeforeRedeem.safe3, snapshotsAfterRedeem.safe3);

    // Checks:
    // 1. Redeem amount should have been deducted from the redeemer's balance for SBD tokens
    expect(snapshotsAfterRedeem.redeemer.user.sbd).to.equal(0);
    
    // 2. Collateral should have been transferred to the redeemer's address
    const gasUsed = redeemTx.gasUsed;
    const gasPrice = redeemTx.gasPrice;
    const ethSpent = gasUsed * (gasPrice);
    console.log(ethSpent);
    const collateralAmount = redeemAmount / BigInt(system.price);
    const collateralAmount1 = redeemAmount1 / BigInt(system.price);
    const collateralAmount2 = redeemAmount2 / BigInt(system.price);
    const collateralAmount3 = redeemAmount3 / BigInt(system.price);
    console.log(redeemAmount, redeemAmount1, redeemAmount2, redeemAmount3);
    console.log(collateralAmount, collateralAmount1, collateralAmount2, collateralAmount3);
    
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount - collateralAmount1);
    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount - redeemAmount1);
    // 5. Should have been removed from the target shielding rate list
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(0);
    // 6. Should have been removed from reserve ratio list
    expect(snapshotsAfterRedeem.safe1.reserveRatioList.value.value).to.equal(0);


    // 7. Safe2's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount - collateralAmount2);
    // 8. Safe2's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount - redeemAmount2);
    expect(snapshotsAfterRedeem.safe2.targetShieldingRateList.value.value).to.equal(100);
    // 9. Should have been removed from reserve ratio list
    const reserveRatioFromReservePoolStake = (snapshotsAfterRedeem.safe2.reservePool.stake * BigInt(10000) / snapshotsAfterRedeem.safe2.safe.borrowedAmount);
    expect(snapshotsAfterRedeem.safe2.reserveRatioList.value.value).to.equal(reserveRatioFromReservePoolStake);


    // 3. Safe3's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe3.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe3.safe.depositedAmount - collateralAmount3);

    // 4. Safe3's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe3.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe3.safe.borrowedAmount - redeemAmount3);

    // Reference rate should have updated
    expect((snapshotsAfterRedeem.safe2.referenceShieldingRate.weightedSum  * BigInt(100)) / snapshotsAfterRedeem.safe2.referenceShieldingRate.totalWeight).to.equal(snapshotsAfterRedeem.safe2.targetShieldingRateList.value.value * BigInt(100));
    console.log(gasUsed);
    
  });

  it("Redeem multiple safes test - with expired safes - redeem based on expired safes, and by reserve ratio, skip target shielding rate list", async function() {
    const safe1Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 4,
        borrowAmount: 50 // 50%
    };
    const safe2Params = {
        depositAmount: 2,
        reserveRatio: 5,
        targetShieldingRate: 4,
        borrowAmount: 75 // 50%
    };
    const safe3Params = {
        depositAmount: 0.1,
        shieldingRate: 0,
        borrowAmount: 50 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    const safe3 = await utils.setupUserSafe(borrower3, safe3Params, system);
    //console.log(safe1, safe2);
    const snapshotsBeforeRedeem = {};
    let redeemAmount1 = ethers.parseEther("1200"); // 
    let redeemAmount2 = ethers.parseEther("500"); // 
    await sbdToken.connect(borrower2).transfer(redeemer.address, redeemAmount1);
    await sbdToken.connect(borrower1).transfer(redeemer.address, redeemAmount2);
    const redeemAmount = redeemAmount1 + redeemAmount2;
    snapshotsBeforeRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsBeforeRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsBeforeRedeem.safe3 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe3.safeId, { address: borrower3.address });
    snapshotsBeforeRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT before redeem:", snapshotsBeforeRedeem);
    let redeemAmount3 = snapshotsBeforeRedeem.safe3.safe.borrowedAmount
    redeemAmount2 = snapshotsBeforeRedeem.safe2.safe.borrowedAmount;
    redeemAmount1 = redeemAmount - redeemAmount2 - redeemAmount3;
    
    // send the redeem amount to the redeemer
    //await sbdToken.connect(redeemer).approve(stableBaseCDP.target, redeemAmount);
    console.log("Redeem amount", redeemAmount.toString());
    const redeemParams = "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    const result = await stableBaseCDP.connect(redeemer).redeem(redeemAmount, redeemParams);
    const redeemTx = await result.wait();
    const snapshotsAfterRedeem = {};
    snapshotsAfterRedeem.safe1 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe1.safeId, { address: borrower1.address });
    snapshotsAfterRedeem.safe2 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe2.safeId, { address: borrower2.address });
    snapshotsAfterRedeem.safe3 = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safe3.safeId, { address: borrower3.address });
    snapshotsAfterRedeem.redeemer = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, 0, { address: redeemer.address });
    console.log("SNAPSHOT for redeemer before / after redeem:", snapshotsBeforeRedeem.redeemer, snapshotsAfterRedeem.redeemer);
    console.log("SNAPSHOT for safe1 before / after redeem:", snapshotsBeforeRedeem.safe1, snapshotsAfterRedeem.safe1);
    console.log("SNAPSHOT for safe2 before / after redeem:", snapshotsBeforeRedeem.safe2, snapshotsAfterRedeem.safe2);
    console.log("SNAPSHOT for SAFE3 before / after redeem:", snapshotsBeforeRedeem.safe3, snapshotsAfterRedeem.safe3);

    // Checks:
    // 1. Redeem amount should have been deducted from the redeemer's balance for SBD tokens
    expect(snapshotsAfterRedeem.redeemer.user.sbd).to.equal(0);
    
    // 2. Collateral should have been transferred to the redeemer's address
    const gasUsed = redeemTx.gasUsed;
    const gasPrice = redeemTx.gasPrice;
    const ethSpent = gasUsed * (gasPrice);
    console.log(ethSpent);
    const collateralAmount = redeemAmount / BigInt(system.price);
    const collateralAmount1 = redeemAmount1 / BigInt(system.price);
    const collateralAmount2 = redeemAmount2 / BigInt(system.price);
    const collateralAmount3 = redeemAmount3 / BigInt(system.price);
    console.log(redeemAmount, redeemAmount1, redeemAmount2, redeemAmount3);
    console.log(collateralAmount, collateralAmount1, collateralAmount2, collateralAmount3);
    
    expect(snapshotsAfterRedeem.redeemer.user.eth).to.equal(snapshotsBeforeRedeem.redeemer.user.eth + collateralAmount - ethSpent);

    // 3. Safe1's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.depositedAmount - collateralAmount1);
    // 4. Safe1's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe1.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe1.safe.borrowedAmount - redeemAmount1);
    // 5. Should have been removed from the target shielding rate list
    expect(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value).to.equal(400);
    // 6. Should have been removed from reserve ratio list
    const reserveRatioFromReservePoolStake = (snapshotsAfterRedeem.safe1.reservePool.stake * BigInt(10000) / snapshotsAfterRedeem.safe1.safe.borrowedAmount);
    expect(snapshotsAfterRedeem.safe1.reserveRatioList.value.value).to.equal(reserveRatioFromReservePoolStake);


    // 7. Safe2's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.depositedAmount - collateralAmount2);
    // 8. Safe2's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe2.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe2.safe.borrowedAmount - redeemAmount2);
    expect(snapshotsAfterRedeem.safe2.targetShieldingRateList.value.value).to.equal(0);
    // 9. Should have been removed from reserve ratio list
    
    expect(snapshotsAfterRedeem.safe2.reserveRatioList.value.value).to.equal(0);


    // 3. Safe3's collateral should have been reduced by an amount equivalent to redeem amount
    expect(snapshotsAfterRedeem.safe3.safe.depositedAmount).to.equal(snapshotsBeforeRedeem.safe3.safe.depositedAmount - collateralAmount3);

    // 4. Safe3's borrowed amount should have been reduced by the redeem amount
    expect(snapshotsAfterRedeem.safe3.safe.borrowedAmount).to.equal(snapshotsBeforeRedeem.safe3.safe.borrowedAmount - redeemAmount3);

    // Reference rate should have updated
    expect((snapshotsAfterRedeem.safe1.referenceShieldingRate.weightedSum  * BigInt(100)) / snapshotsAfterRedeem.safe1.referenceShieldingRate.totalWeight).to.equal(snapshotsAfterRedeem.safe1.targetShieldingRateList.value.value * BigInt(100));
    console.log(gasUsed);
    
  });

});