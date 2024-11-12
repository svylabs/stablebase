const { expect, assert} = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");

describe("Test the flow", function () {
    let stableBaseCDP, sbdToken, sbrToken, sbrStaking, mockPriceOracle, owner, user, stabilityPool, redemptionQueue, liquidationQueue, priceOracle, mockOracle, contracts;
    const safeId = 1;
    const price = BigInt(10000); // Price of the token

    const users = {
        alice: {
            collateralAmount: ethers.parseEther("2.0"),
            borrowAmount: ethers.parseEther("5000"),
        },
        bob: {
            collateralAmount: ethers.parseEther("2.0"),
            borrowAmount: ethers.parseEther("4500"),
        },
        charlie: {
            collateralAmount: ethers.parseEther("2.0"),
            borrowAmount: ethers.parseEther("5700"),
        }
    }
  
    beforeEach(async function () {
      [owner, alice, bob, charlie, david, eli, fabio, ...addrs] = await ethers.getSigners();
      users.alice.user = alice;
      users.bob.user = bob;
      users.charlie.user = charlie;
  
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

      const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
      const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
      const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);

      const aliceCollateral = ethers.parseEther("800");
      const bobCollateral = ethers.parseEther("800");
      const charlieCollateral = ethers.parseEther("800");

      const aliceBorrowAmount = ethers.parseEther("5000000");
      const bobBorrowAmount = ethers.parseEther("4500000");
      const charlieBorrowAmount = ethers.parseEther("5700000");

      users.alice.safeId = aliceSafeId;
      users.alice.borrowAmount = aliceBorrowAmount;
      users.alice.collateralAmount = aliceCollateral;
      users.bob.safeId = bobSafeId;
      users.bob.borrowAmount = bobBorrowAmount;
      users.bob.collateralAmount = bobCollateral;
      users.charlie.safeId = charlieSafeId;
      users.charlie.borrowAmount = charlieBorrowAmount;
      users.charlie.collateralAmount = charlieCollateral;

      priceOracle.setPrice(BigInt(10000)); // Should be able to borrow upto 3000 per collateral

      await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
      await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
      await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);
    });

    describe("Test Redemption", function() {
        it("should be able to redeem one safe", async function() {
            const price = BigInt(10000);
             priceOracle.setPrice(price);
             sbdToken.connect(alice).transfer(david.address, ethers.parseEther("100000"));
             sbdToken.connect(bob).transfer(david.address, ethers.parseEther("100000"));
             sbdToken.connect(charlie).transfer(david.address, ethers.parseEther("100000"));
             const amount = ethers.parseEther("300000");
             const collateralAmount = amount / price;
             const fee = (await contracts.stableBaseCDP.REDEMPTION_BASE_FEE() * collateralAmount / BigInt(10000));
             await contracts.sbdToken.connect(david).approve(contracts.stableBaseCDP.target, amount);
             const snapshot = await utils.redeem(david, amount, contracts, [users.alice.safeId, users.bob.safeId, users.charlie.safeId]);
             expect(snapshot.newSnapshot.safes[users.bob.safeId].borrowedAmount).to.equal(snapshot.existingSnapshot.safes[users.bob.safeId].borrowedAmount - amount);
             expect(snapshot.newSnapshot.safes[users.bob.safeId].collateralAmount).to.equal(snapshot.existingSnapshot.safes[users.bob.safeId].collateralAmount - collateralAmount);
             expect(snapshot.newSnapshot.user.ethBalance).to.equal(snapshot.existingSnapshot.user.ethBalance + collateralAmount - snapshot.gasPaid);
             expect(snapshot.newSnapshot.sbdToken.totalSupply).to.equal(snapshot.existingSnapshot.sbdToken.totalSupply - amount);

        });

        it("should be able to redeem multiple safes", async function() {
            priceOracle.setPrice(BigInt(10000));
            sbdToken.connect(alice).transfer(david.address, ethers.parseEther("2000000"));
            sbdToken.connect(bob).transfer(david.address, ethers.parseEther("1000000"));
            sbdToken.connect(charlie).transfer(david.address, ethers.parseEther("3000000"));
            const amount = ethers.parseEther("6000000");
            const collateralAmount = amount / price;
            const snapshot = await utils.redeem(david, amount, contracts, [users.alice.safeId, users.bob.safeId, users.charlie.safeId]);
            
            expect(snapshot.newSnapshot.safes[users.bob.safeId].borrowedAmount).to.equal(0);
            let totalRedeemed = snapshot.existingSnapshot.safes[users.bob.safeId].borrowedAmount;
            const collateralFromBob = totalRedeemed / price;
            console.log("Existing Collateral: ", snapshot.existingSnapshot.safes[users.bob.safeId].collateralAmount)
            console.log("Collateral from bob: ", collateralFromBob);
            expect(snapshot.newSnapshot.safes[users.bob.safeId].collateralAmount).to.equal(snapshot.existingSnapshot.safes[users.bob.safeId].collateralAmount - collateralFromBob);
            expect(snapshot.newSnapshot.user.ethBalance).to.equal(snapshot.existingSnapshot.user.ethBalance + collateralAmount - snapshot.gasPaid);
            expect(snapshot.newSnapshot.sbdToken.totalSupply).to.equal(snapshot.existingSnapshot.sbdToken.totalSupply - amount);
            const toRedeem = amount - totalRedeemed;
            const collateralFromAlice = toRedeem / price;
            // redemption from alice safe
            expect(snapshot.newSnapshot.safes[users.alice.safeId].borrowedAmount).to.equal(snapshot.existingSnapshot.safes[users.alice.safeId].borrowedAmount - toRedeem);
            expect(snapshot.newSnapshot.safes[users.alice.safeId].collateralAmount).to.equal(snapshot.existingSnapshot.safes[users.alice.safeId].collateralAmount - collateralFromAlice);
            const oldRatio = snapshot.existingSnapshot.safes[users.alice.safeId].borrowedAmount / snapshot.existingSnapshot.safes[users.alice.safeId].collateralAmount;
            const newRatioAlice = snapshot.newSnapshot.safes[users.alice.safeId].borrowedAmount / snapshot.newSnapshot.safes[users.alice.safeId].collateralAmount;
            console.log(oldRatio, newRatioAlice);
            snapshot.newSnapshot.stableBaseCDP.liquidationQueue.all.forEach(node => {
                if (node.safeId == users.alice.safeId) {
                    //console.log(newRatioAlice);
                    expect(node.data.value).to.equal(newRatioAlice);
                }
            })


        });

    });
});