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
  let stableBaseCDP, sbdToken, sbrToken, sbrStaking, mockPriceOracle, owner, user, stabilityPool, redemptionQueue, liquidationQueue, priceOracle, mockOracle;
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
          const borrowAmount = ethers.parseEther("3000");
          const shieldingRate = BigInt(0);
          await stableBaseCDP.connect(alice).borrow(safeId, borrowAmount, shieldingRate, BigInt(0), BigInt(0));
          const safe = await stableBaseCDP.safes(safeId);
          expect(safe.borrowedAmount).to.equal(borrowAmount);
          expect(await sbdToken.balanceOf(alice.address)).to.equal(borrowAmount);
      });

    });
});