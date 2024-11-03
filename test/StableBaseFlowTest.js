const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");

/**
 * Test openSafe
 * Test borrow
 * Test repay
 * Test addCollateral
 * Test withdrawCollateral
 * Test Liquidate
 * Test closeSafe
 * Test redeem
 * Test feeTopup
 */

/**
 * StableBaseContract (sbdContract, sbrStaking, priceOracle, stabilityPool)
 * 
 * sbdContract:
 *    setMinter()
 * 
 * sbrStaking
 *    stableBaseCDPContract
 * 
 * stabilityPool
 *    stableBaseCDPContract, sbrTokenContract, sbdTokenContract
 */


describe("Test the flow", function () {
  let stableBaseCDP, sbdToken, sbrToken, sbrStaking, mockPriceOracle, owner, user, stabilityPool, redemptionQueue, liquidationQueue, priceOracle, mockOracle, contracts;
  const safeId = 1;
  const price = BigInt(1000); // Price of the token

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, eli, fabio, ...addrs] = await ethers.getSigners();

    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy();
    await sbdToken.waitForDeployment();
  
    const SBRToken = await ethers.getContractFactory("SBRToken");
    sbrToken = await SBRToken.deploy();
    await sbrToken.waitForDeployment();

    StabilityPool = await ethers.getContractFactory("StabilityPool");
    stabilityPool = await StabilityPool.deploy();
    await stabilityPool.waitForDeployment();
    
    const PriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy();
    await stableBaseCDP.waitForDeployment();

    const SBRStaking = await ethers.getContractFactory("SBRStaking");
    sbrStaking = await SBRStaking.deploy();
    await sbrStaking.waitForDeployment();

    const OrderedDoublyLinkedList = await ethers.getContractFactory("OrderedDoublyLinkedList");
    redemptionQueue = await OrderedDoublyLinkedList.deploy();
    await redemptionQueue.waitForDeployment();
    

    liquidationQueue = await OrderedDoublyLinkedList.deploy();
    await liquidationQueue.waitForDeployment();



    await sbdToken.setAddresses(stableBaseCDP.target);
    await sbrToken.setAddresses(stabilityPool.target);
    await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, sbrToken.target);
    await sbrStaking.setAddresses(sbrToken.target, sbdToken.target, stableBaseCDP.target);
    await redemptionQueue.setAddresses(stableBaseCDP.target);
    await liquidationQueue.setAddresses(stableBaseCDP.target);
    await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, sbrStaking.target, liquidationQueue.target, redemptionQueue.target);

    contracts = {
      stableBaseCDP,
      sbdToken,
      sbrToken,
      sbrStaking,
      priceOracle,
      stabilityPool,
      redemptionQueue,
      liquidationQueue
    }

  });

  describe("Open Safe", function () {
      it("Open safe should work", async function() {
          const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
          const safe = await stableBaseCDP.safes(safeId);
          expect(safe.collateralAmount).to.equal(amount);
          expect(safe.borrowedAmount).to.equal(0);
          
      });

      it("Open safe should fail if not enough collateral", async function() {
          const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await expect(stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: ethers.parseEther("0.5")})).to.be.revertedWith("Insufficient collateral");
      });
    });


    describe("Borrow Test", function () {
      it ("Borrowing below 110% should work", async function() {
          const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
          await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 2250
          const borrowAmount = ethers.parseEther("2000");
          const shieldingRate = BigInt(0);
          await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
          const safe = await stableBaseCDP.safes(safeId);
          expect(safe.borrowedAmount).to.equal(borrowAmount);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount);

          // Make another borrowing of 1000 should succeed.
          const borrowAmount2 = ethers.parseEther("1000");
          await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount2, shieldingRate, BigInt(0), BigInt(0));
          const safe2 = await stableBaseCDP.safes(safeId);
          expect(safe2.borrowedAmount).to.equal(borrowAmount + borrowAmount2);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount + borrowAmount2);


          // Another borrowing should fail
          const borrowAmount3 = ethers.parseEther("1");
          await expect(stableBaseCDP.connect(alice).borrow(safeId, borrowAmount3, shieldingRate, BigInt(0), BigInt(0)))
            .to.be.revertedWith("Borrow amount exceeds the limit");
          const safe3 = await stableBaseCDP.safes(safeId);
          expect(safe3.borrowedAmount).to.equal(borrowAmount + borrowAmount2);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount + borrowAmount2);
      });

      it ("Borrowing above 110% should not work", async function() {
        const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const amount = ethers.parseEther("1.0");
        await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
        await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 
        const borrowAmount = ethers.parseUnits(((BigInt(3300) * BigInt(10000)) / BigInt(11000) + BigInt(1)).toString(), 18);
        const shieldingRate = BigInt(0);
        await expect(stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0)))
          .to.be.revertedWith("Borrow amount exceeds the limit");
        const safe = await stableBaseCDP.safes(safeId);
        expect(safe.collateralAmount).to.equal(amount);
        expect(safe.borrowedAmount).to.equal(BigInt(0));
        expect(await sbdToken.balanceOf(alice.address)).to.equal(BigInt(0));
      });

      it ("Borrowing with fee should work, but fee should be refunded back to user", async function() {
          const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
          await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 2250
          const borrowAmount = ethers.parseEther("2000");
          const feePercent = BigInt(100); // 1%
          const fee = (borrowAmount * feePercent) / BigInt(10000);
          await expect(stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, feePercent, BigInt(0), BigInt(0)))
            .to.emit(stableBaseCDP, "BorrowFeeRefund")
            .withArgs(safeId, fee);
          const safe = await stableBaseCDP.safes(safeId);
          const actualBorrowAmount = borrowAmount - fee; // but fee is refunded to the borrower because there are no stakers
          expect(safe.borrowedAmount).to.equal(borrowAmount);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount);
      });

      it ("Borrowing as different user should not work", async function() {
        const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const amount = ethers.parseEther("1.0");
        await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
        await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 2250
        const borrowAmount = ethers.parseEther("2000");
        const feePercent = BigInt(100); // 1%
        const fee = (borrowAmount * feePercent) / BigInt(10000);
        await expect(stableBaseCDP.connect(bob).borrow(safeId, borrowAmount, feePercent, BigInt(0), BigInt(0)))
          .to.be.revertedWith("Not the owner");
        const safe = await stableBaseCDP.safes(safeId);
        expect(safe.collateralAmount).to.equal(amount);
        expect(safe.borrowedAmount).to.equal(BigInt(0));
        expect(await sbdToken.balanceOf(alice.address)).to.equal(0);
        expect(await sbdToken.balanceOf(bob.address)).to.equal(0);  
    });

    it ("Borrowing with stability pool having some staked coins should pay fee", async function() {
      const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
          await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 2250
          const borrowAmount = ethers.parseEther("2000");
          let shieldingRate = BigInt(0);
          await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
          const safe = await stableBaseCDP.safes(safeId);
          expect(safe.borrowedAmount).to.equal(borrowAmount);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount);

          await sbdToken.connect(alice).approve(stabilityPool.target, borrowAmount);
          await stabilityPool.connect(alice).stake(borrowAmount);

          // Make another borrowing of 1000 should succeed.
          const borrowAmount2 = ethers.parseEther("1000");
          shieldingRate = BigInt(100);
          const fee = (borrowAmount2 * shieldingRate) / BigInt(10000);
          const actualBorrowAmount = borrowAmount2 - fee;
          await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount2, shieldingRate, BigInt(0), BigInt(0));
          const safe2 = await stableBaseCDP.safes(safeId);
          console.log(safe2);
          expect(safe2.borrowedAmount).to.equal(borrowAmount + borrowAmount2);
          const feeWeight = (fee * BigInt(10000) / (borrowAmount2 + borrowAmount));
          expect(safe2.weight).to.equal(feeWeight);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(actualBorrowAmount);
          expect(await sbdToken.balanceOf(stabilityPool.target)).to.equal(borrowAmount + fee);

          await expect(stabilityPool.connect(alice).claim()).to.emit(stabilityPool, "RewardClaimed").withArgs(alice.address, fee, BigInt(0));
          expect(await sbdToken.balanceOf(stabilityPool.target)).to.equal(borrowAmount);
      });

      it("Multiple people borrowing should order the redemption and liquidation queue appropriately", async function() {
          const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
          const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

          const aliceCollateral = ethers.parseEther("1.0");
          const bobCollateral = ethers.parseEther("1.0");
          const charlieCollateral = ethers.parseEther("1.0");

          const aliceBorrowAmount = ethers.parseEther("2000");
          const bobBorrowAmount = ethers.parseEther("2500");
          const charlieBorrowAmount = ethers.parseEther("2700");

          priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

          //console.log(contracts);

          const aliceSnapshot = await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
          const bobSnapshot = await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(100), contracts);
          const charlieSnapshot = await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

          
      })

    });


    describe("Fee Topup Tests", function() {

      it("topup fee should work and update fee weight", async function() {
        const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const amount = ethers.parseEther("1.0");
        await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
        await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 2250
        const borrowAmount = ethers.parseEther("2000");
        let shieldingRate = BigInt(0);
        await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
        const safe = await stableBaseCDP.safes(safeId);
        expect(safe.borrowedAmount).to.equal(borrowAmount);
        expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount);

        await sbdToken.connect(alice).approve(stabilityPool.target, borrowAmount);
        await sbdToken.connect(alice).approve(stableBaseCDP.target, ethers.parseEther("1000000"));
        await stabilityPool.connect(alice).stake(borrowAmount);

        // Make another borrowing of 1000 should succeed.
        const borrowAmount2 = ethers.parseEther("1000");
        shieldingRate = BigInt(100);
        const fee = (borrowAmount2 * shieldingRate) / BigInt(10000);
        const actualBorrowAmount = borrowAmount2 - fee;
        await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount2, shieldingRate, BigInt(0), BigInt(0));
        const safe2 = await stableBaseCDP.safes(safeId);
        console.log(safe2);
        expect(safe2.borrowedAmount).to.equal(borrowAmount + borrowAmount2);
        const feeWeight = (fee * BigInt(10000) / (borrowAmount2 + borrowAmount));
        expect(safe2.weight).to.equal(feeWeight);
        expect(await sbdToken.balanceOf(alice.address)).to.equal(actualBorrowAmount);

        // Topup fee
        const topupFeeRate = BigInt(100); // 1%
        const topupFee = (safe2.borrowedAmount * topupFeeRate) / BigInt(10000);
        await expect(stableBaseCDP.connect(alice).feeTopup(safeId, topupFeeRate, BigInt(0)))
          .to.emit(stableBaseCDP, "FeeTopup")
          .withArgs(safeId, topupFeeRate, topupFee, feeWeight + topupFeeRate);
        const safe3 = await stableBaseCDP.safes(safeId);
        expect(safe3.weight).to.equal(feeWeight + topupFeeRate);
        expect(await sbdToken.balanceOf(alice.address)).to.equal(actualBorrowAmount - topupFee);
        expect(await sbdToken.balanceOf(stabilityPool.target)).to.equal(borrowAmount + fee + topupFee);
      });

    });


});