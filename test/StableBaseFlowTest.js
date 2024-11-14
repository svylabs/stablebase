const { expect, assert} = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");
const { time } = require('@nomicfoundation/hardhat-network-helpers');
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
    stabilityPool = await StabilityPool.deploy(true);
    await stabilityPool.waitForDeployment();
    
    const PriceOracle = await ethers.getContractFactory("MockPriceOracle");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.waitForDeployment();

    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy();
    await stableBaseCDP.waitForDeployment();

    const SBRStaking = await ethers.getContractFactory("SBRStaking");
    sbrStaking = await SBRStaking.deploy(true);
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
          expect(await stableBaseCDP.totalCollateral()).to.equal(amount);
      });

      it("Open safe should fail if not enough collateral", async function() {
          const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const amount = ethers.parseEther("1.0");
          await expect(stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: ethers.parseEther("0.5")})).to.be.revertedWith("Insufficient collateral");
          expect(await stableBaseCDP.totalCollateral()).to.equal(0);
      });

      it("Open safe should fail if there is an existing safe", async function() {
        const safeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const amount = ethers.parseEther("1.0");
        await stableBaseCDP.connect(alice).openSafe(safeId, amount, {value: amount});
        expect(await stableBaseCDP.totalCollateral()).to.equal(amount);

        const safeId2 = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const amount2 = ethers.parseEther("1.0");
        await expect(stableBaseCDP.connect(alice).openSafe(safeId2, amount2, {value: amount2})).to.be.revertedWith("Safe already exists");
        expect(await stableBaseCDP.totalCollateral()).to.equal(amount);
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
            .to.emit(stableBaseCDP, "FeeRefund")
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
          const bobBorrowAmount = ethers.parseEther("2700");
          const charlieBorrowAmount = ethers.parseEther("2700");

          priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

          //console.log(contracts);

          const aliceSnapshot = await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
          const bobSnapshot = await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
          const charlieSnapshot = await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

          expect(aliceSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.head).to.equal(aliceSafeId);
          expect(aliceSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.tail).to.equal(aliceSafeId);

          expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(aliceSafeId);
          expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(aliceSafeId);

          expect(bobSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.head).to.equal(bobSafeId);
          expect(bobSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.tail).to.equal(aliceSafeId);
          expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(aliceSafeId);
          expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(bobSafeId);

          expect(charlieSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.head).to.equal(bobSafeId);
          expect(charlieSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.tail).to.equal(charlieSafeId);

          expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(aliceSafeId);
          expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(bobSafeId);

          charlieSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.all.forEach((node) => {
             //console.log(node);
             if (node.safeId == aliceSafeId) {
                expect(node.data.value).to.equal(aliceSnapshot.newSafe.weight);
             }
             if (node.safeId == bobSafeId) {
                expect(node.data.value).to.equal(bobSnapshot.newSafe.weight);
             }
              if (node.safeId == charlieSafeId) {
                  console.log(node);
                  expect(node.data.value).to.equal(charlieSnapshot.newSafe.weight);
              }
          });

          const bobSnapshot2 = await utils.feeTopup(bob, bobSafeId, BigInt(100), contracts);
          expect(bobSnapshot2.newSnapshot.stableBaseCDP.redemptionQueue.head).to.equal(aliceSafeId);
          expect(bobSnapshot2.newSnapshot.stableBaseCDP.redemptionQueue.tail).to.equal(charlieSafeId);

          bobSnapshot2.newSnapshot.stableBaseCDP.redemptionQueue.all.forEach((node) => {
              if (node.safeId == aliceSafeId) {
                  expect(node.data.value).to.equal(aliceSnapshot.newSnapshot.safe.weight);
              }
              if (node.safeId == bobSafeId) {
                  expect(node.data.value).to.equal(bobSnapshot2.newSnapshot.safe.weight);
              }
              if (node.safeId == charlieSafeId) {
                  expect(node.data.value).to.equal(charlieSnapshot.newSnapshot.safe.weight);
              }
          });


          bobSnapshot2.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach((node) => {
              if (node.safeId == aliceSafeId) {
                  const safe = aliceSnapshot.newSnapshot.safe;
                  const l2v = (safe.borrowedAmount * BigInt(1e18)) / safe.collateralAmount;
                  expect(node.data.value).to.equal(l2v);
              }
              if (node.safeId == bobSafeId) {
                const safe = bobSnapshot2.newSnapshot.safe;
                const l2v = (safe.borrowedAmount * BigInt(1e18)) / safe.collateralAmount;
                expect(node.data.value).to.equal(l2v);
              }
              if (node.safeId == charlieSafeId) {
                const safe = charlieSnapshot.newSnapshot.safe;
                const l2v = (safe.borrowedAmount * BigInt(1e18)) / safe.collateralAmount;
                expect(node.data.value).to.equal(l2v);
              }
            });
          
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

    describe("Repay Tests", function() {
      it("Full Repay should work", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("1.0");
        const bobCollateral = ethers.parseEther("1.0");
        const charlieCollateral = ethers.parseEther("1.0");

        const aliceBorrowAmount = ethers.parseEther("2000");
        const bobBorrowAmount = ethers.parseEther("2700");
        const charlieBorrowAmount = ethers.parseEther("2700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const aliceRepayAmount = aliceBorrowAmount;
        const aliceSnapshot = await utils.repay(alice, aliceSafeId, aliceRepayAmount, contracts);
        aliceSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.all.forEach((node) => {
          if (node.safeId == aliceSafeId) {
             assert.fail("Alice safe should be removed from the redemption queue");
          }
        });
        aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach((node) => {
          if (node.safeId == aliceSafeId) {
             assert.fail("Alice safe should be removed from the liquidation queue");
          }
        });
        expect(aliceSnapshot.newSnapshot.safe.borrowedAmount).to.equal(0);
        expect(aliceSnapshot.newSnapshot.safe.collateralAmount).to.equal(aliceCollateral);
        expect(aliceSnapshot.existingSnapshot.user.sbdBalance).to.equal(aliceBorrowAmount);
        expect(aliceSnapshot.newSnapshot.user.sbdBalance).to.equal(0);
      });


      it("Partial Repay should work", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("2.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const aliceRepayAmount = ethers.parseUnits("1000", 18);
        const aliceSnapshot = await utils.repay(alice, aliceSafeId, aliceRepayAmount, contracts);
        aliceSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.all.forEach((node) => {
          if (node.safeId == aliceSafeId) {
              expect(node.data.value).to.equal(aliceSnapshot.newSnapshot.safe.weight);
          }
        });

        expect(aliceSnapshot.existingSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(bobSafeId);
        expect(aliceSnapshot.existingSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(charlieSafeId);

        expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(aliceSafeId);
        expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(charlieSafeId);

        aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach((node) => {
          if (node.safeId == aliceSafeId) {
             const ratio = (aliceSnapshot.newSnapshot.safe.borrowedAmount * BigInt(1e18) )/ aliceSnapshot.newSnapshot.safe.collateralAmount;
             expect(node.data.value).to.equal(ratio);
          }
        });
        expect(aliceSnapshot.newSnapshot.safe.borrowedAmount).to.equal(aliceBorrowAmount - aliceRepayAmount);
        expect(aliceSnapshot.newSnapshot.safe.collateralAmount).to.equal(aliceCollateral);
        expect(aliceSnapshot.existingSnapshot.user.sbdBalance).to.equal(aliceBorrowAmount);
        expect(aliceSnapshot.newSnapshot.user.sbdBalance).to.equal(aliceBorrowAmount - aliceRepayAmount);
      });

      it("Partial Repay should not work when repay amount takes borrowedAmount below minimum debt", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("2.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const aliceRepayAmount = ethers.parseUnits("3001", 18);
        try {
          const aliceSnapshot = await utils.repay(alice, aliceSafeId, aliceRepayAmount, contracts);
          assert.fail("Repay should fail");
        } catch (ex) {
          expect(ex.message).to.equal("VM Exception while processing transaction: reverted with reason string 'Invalid repayment amount'");
        }
      });


    });

    describe("Add Collateral Tests", async function() {
      it("Add collateral should work", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("2.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const additionalCollateral = ethers.parseEther("2");
        const charlieSnapshot = await utils.addCollateral(charlie, charlieSafeId, additionalCollateral, contracts);
        expect(charlieSnapshot.existingSnapshot.safe.collateralAmount).to.equal(charlieCollateral);
        expect(charlieSnapshot.newSnapshot.safe.collateralAmount).to.equal(charlieCollateral + additionalCollateral);

        expect(charlieSnapshot.existingSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(charlieSafeId);
        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(charlieSafeId);
        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(aliceSafeId);
        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.node.value).to.equal((charlieSnapshot.newSnapshot.safe.borrowedAmount * BigInt(1e18))/ charlieSnapshot.newSnapshot.safe.collateralAmount);
        
      });
    });

    describe("Withdraw Collateral Tests", function() {
       it("Withdraw collateral should work", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("3.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const withdrawAmount = ethers.parseEther("1");
        const charlieSnapshot = await utils.withdrawCollateral(charlie, charlieSafeId, withdrawAmount, contracts);
        expect(charlieSnapshot.existingSnapshot.safe.collateralAmount).to.equal(charlieCollateral);
        expect(charlieSnapshot.newSnapshot.safe.collateralAmount).to.equal(charlieCollateral - withdrawAmount);
        expect(charlieSnapshot.newSnapshot.safe.borrowedAmount).to.equal(charlieBorrowAmount);

        expect(charlieSnapshot.existingSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(aliceSafeId);
        expect(charlieSnapshot.existingSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(charlieSafeId);

        expect(charlieSnapshot.newSnapshot.user.ethBalance).to.equal(charlieSnapshot.existingSnapshot.user.ethBalance + withdrawAmount - charlieSnapshot.gasPaid);
        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.node.value).to.equal((charlieSnapshot.newSnapshot.safe.borrowedAmount * BigInt(1e18))/ charlieSnapshot.newSnapshot.safe.collateralAmount);

        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).to.equal(charlieSafeId);
        expect(charlieSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).to.equal(bobSafeId);

       });


       it("Withdraw collateral should not work when requested amount lowers collateral ratio < 110%", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("1.0");
        const bobCollateral = ethers.parseEther("1.0");
        const charlieCollateral = ethers.parseEther("1.0");

        const aliceBorrowAmount = ethers.parseEther("3000");
        const bobBorrowAmount = ethers.parseEther("2700");
        const charlieBorrowAmount = ethers.parseEther("2200");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const withdrawAmount = ethers.parseEther("0.01");
        const existingSnapshot = await utils.takeContractSnapshots(contracts, aliceSafeId, alice);
        try {
          aliceSnapshot = await utils.withdrawCollateral(alice, aliceSafeId, withdrawAmount, contracts);
          assert.fail("Withdraw should fail");
        } catch (ex) {
          expect(ex.message).to.equal("VM Exception while processing transaction: reverted with reason string 'Insufficient collateral'");
        }
        const newSnapshot =  await utils.takeContractSnapshots(contracts, aliceSafeId, alice);

        // Order should be preserved.
        //console.log(existingSnapshot.stableBaseCDP.liquidationQueue.all);
        //console.log(newSnapshot.stableBaseCDP.liquidationQueue.all);
        expect(existingSnapshot.stableBaseCDP.liquidationQueue.all).to.have.deep.members(newSnapshot.stableBaseCDP.liquidationQueue.all);
        expect(newSnapshot.safe.collateralAmount).to.equal(existingSnapshot.safe.collateralAmount);

       });

       it("Withdraw collateral should work after full repay", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("3.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const aliceRepayAmount = aliceBorrowAmount;
        const aliceSnapshot = await utils.repay(alice, aliceSafeId, aliceRepayAmount, contracts);
        expect(aliceSnapshot.newSnapshot.safe.borrowedAmount).to.equal(0);
        aliceSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach((node) => { 
          if (node.safeId == aliceSafeId) {
             assert.fail("Alice safe should be removed from the liquidation queue");
          }
       });

        const withdrawAmount = ethers.parseEther("2");
        const aliceSnapshot2 = await utils.withdrawCollateral(alice, aliceSafeId, withdrawAmount, contracts);
        expect(aliceSnapshot2.newSnapshot.user.ethBalance).to.equal(aliceSnapshot2.existingSnapshot.user.ethBalance + withdrawAmount - aliceSnapshot2.gasPaid);
        expect(aliceSnapshot2.newSnapshot.safe.collateralAmount).to.equal(0);
        aliceSnapshot2.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach((node) => { 
           if (node.safeId == aliceSafeId) {
              assert.fail("Alice safe should be removed from the liquidation queue");
           }
        });
        aliceSnapshot2.newSnapshot.stableBaseCDP.redemptionQueue.all.forEach((node) => {
          if (node.safeId == aliceSafeId) {
             assert.fail("Alice safe should be removed from the redemption queue");
          }
        });

       });

       it("Withdraw collateral should not work for unauthorized users", async function() {
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
        const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

        const aliceCollateral = ethers.parseEther("2.0");
        const bobCollateral = ethers.parseEther("2.0");
        const charlieCollateral = ethers.parseEther("3.0");

        const aliceBorrowAmount = ethers.parseEther("5000");
        const bobBorrowAmount = ethers.parseEther("4500");
        const charlieBorrowAmount = ethers.parseEther("5700");

        priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
        await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

        const aliceRepayAmount = aliceBorrowAmount;
        const aliceSnapshot = await utils.repay(alice, aliceSafeId, aliceRepayAmount, contracts);
        expect(aliceSnapshot.newSnapshot.safe.borrowedAmount).to.equal(0);

        const withdrawAmount = ethers.parseEther("2");
        try {
          const aliceSnapshot2 = await utils.withdrawCollateral(bob, aliceSafeId, withdrawAmount, contracts);
          assert.fail("Withdraw should fail");
        } catch (ex) {
          expect(ex.message).to.equal("VM Exception while processing transaction: reverted with reason string 'Not the owner'");
        }
       });

    });


    describe("Redeem Tests", function() {
       it("Should not redeem in bootstrap mode", async function() {
          const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
          const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);
  
          const aliceCollateral = ethers.parseEther("2.0");
          const bobCollateral = ethers.parseEther("2.0");
          const charlieCollateral = ethers.parseEther("3.0");
  
          const aliceBorrowAmount = ethers.parseEther("5000");
          const bobBorrowAmount = ethers.parseEther("4500");
          const charlieBorrowAmount = ethers.parseEther("5700");
  
          priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral
  
          await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
          await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
          await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

          await sbdToken.connect(alice).approve(stableBaseCDP.target, aliceBorrowAmount);
          await expect(stableBaseCDP.connect(alice).redeem(aliceBorrowAmount, BigInt(0))).to.be.revertedWith("Protocol in bootstrap mode");
  
       })
    })


    describe("Fee distribution", function() {
      it("Fee should be distributed to SBRStaking contract during borrow", async function() {
         const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
         const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
         const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);
 
         const aliceCollateral = ethers.parseEther("2.0");
         const bobCollateral = ethers.parseEther("2.0");
         const charlieCollateral = ethers.parseEther("3.0");
 
         const aliceBorrowAmount = ethers.parseEther("5000");
         const bobBorrowAmount = ethers.parseEther("4500");
         const charlieBorrowAmount = ethers.parseEther("5700");
 
         priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral
 
         await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
         await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);

         await sbdToken.connect(alice).approve(stabilityPool.target, aliceBorrowAmount);
          await stabilityPool.connect(alice).stake(aliceBorrowAmount);
          await sbdToken.connect(bob).approve(stabilityPool.target, bobBorrowAmount);
          await stabilityPool.connect(bob).stake(bobBorrowAmount);

          time.increase(86400 * 30);
          await stabilityPool.connect(alice).claim();
          await stabilityPool.connect(bob).claim();

          const aliceSBRBalance = await sbrToken.balanceOf(alice.address);
          const bobSBRBalance = await sbrToken.balanceOf(bob.address);

          await sbrToken.connect(alice).approve(sbrStaking.target, aliceSBRBalance);
          await sbrToken.connect(bob).approve(sbrStaking.target, bobSBRBalance);
          await sbrStaking.connect(alice).stake(aliceSBRBalance);
          await sbrStaking.connect(bob).stake(bobSBRBalance);

         await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);
         const fee = (charlieBorrowAmount * BigInt(200)) / BigInt(10000);
         expect(await sbdToken.balanceOf(charlie.address)).to.equal(charlieBorrowAmount - fee);
         expect(await sbdToken.balanceOf(stabilityPool.target)  - await stabilityPool.totalStakedRaw() + await sbdToken.balanceOf(sbrStaking.target)).to.equal(fee);
         expect(await sbdToken.balanceOf(sbrStaking.target)).to.equal((fee * BigInt(1000)) / BigInt(10000));
 
      })
   })

   describe("Close Safe Tests", function() {
       it("Close safe after borrow and repay should work too", async function() {
          
          await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral
          const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
          const aliceCollateral = ethers.parseEther("2.0");
          const aliceBorrowAmount = ethers.parseEther("5000");

          await stableBaseCDP.connect(alice).openSafe(aliceSafeId, aliceCollateral, {value: aliceCollateral});
          utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
          const ethBalance = await ethers.provider.getBalance(alice.address);
          utils.repay(alice, aliceSafeId, aliceBorrowAmount, contracts);
          const txPromise = stableBaseCDP.connect(alice).closeSafe(aliceSafeId);
          await expect(txPromise)
          .to.emit(stableBaseCDP, "SafeClosed")
          .withArgs(aliceSafeId, aliceCollateral, BigInt(0), BigInt(0));
          const safe = await stableBaseCDP.safes(aliceSafeId);
          expect(safe.collateralAmount).to.equal(0);
          expect(safe.borrowedAmount).to.equal(0);
          expect(safe.weight).to.equal(0);
          expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(ethBalance + aliceCollateral, ethers.parseEther("0.01"));
       });


       it("Close safe after borrow but before repay should fail", async function() {
          
        await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const aliceCollateral = ethers.parseEther("2.0");
        const aliceBorrowAmount = ethers.parseEther("5000");

        await stableBaseCDP.connect(alice).openSafe(aliceSafeId, aliceCollateral, {value: aliceCollateral});
        await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
        let safe = await stableBaseCDP.safes(aliceSafeId);
        console.log(safe);
        const ethBalance = await ethers.provider.getBalance(alice.address);
        try {
          await stableBaseCDP.connect(alice).closeSafe(aliceSafeId);
          assert.fail("Close safe should fail");
        } catch (ex) {
          expect(ex.message).to.equal("VM Exception while processing transaction: reverted with reason string 'Cannot close Safe with borrowed amount'");
        }
        safe = await stableBaseCDP.safes(aliceSafeId);
        console.log(safe);
        expect(safe.collateralAmount).to.equal(aliceCollateral);
        expect(safe.borrowedAmount).to.equal(aliceBorrowAmount);
     });

       it("Close safe should work", async function() {
          
        await priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral
        const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
        const aliceCollateral = ethers.parseEther("2.0");
        const aliceBorrowAmount = ethers.parseEther("5000");

        await stableBaseCDP.connect(alice).openSafe(aliceSafeId, aliceCollateral, {value: aliceCollateral});
        const ethBalance = await ethers.provider.getBalance(alice.address);
        const txPromise = stableBaseCDP.connect(alice).closeSafe(aliceSafeId);
        await expect(txPromise)
        .to.emit(stableBaseCDP, "SafeClosed")
        .withArgs(aliceSafeId, aliceCollateral, BigInt(0), BigInt(0));
        const safe = await stableBaseCDP.safes(aliceSafeId);
        expect(safe.collateralAmount).to.equal(0);
        expect(safe.borrowedAmount).to.equal(0);
        expect(safe.weight).to.equal(0);
        expect(await ethers.provider.getBalance(alice.address)).to.be.closeTo(ethBalance + aliceCollateral, ethers.parseEther("0.01"));
     });
   });

});
