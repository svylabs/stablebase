const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StabilityPool", function () {
  let StabilityPool, stabilityPool;
  let MockERC20, sbdToken, collateralToken;
  let MockDebtContract, debtContract;
  let owner, alice, bob, charlie;
  const precision = BigInt("1" + "0".repeat(18));
  const minimumScalingFactor = BigInt("1" + "0".repeat(6)); // 1e6

  beforeEach(async function () {
    [owner, alice, bob, charlie, ...addrs] = await ethers.getSigners();

    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // Deploy mock tokens
    //MockERC20 = await ethers.getContractFactory("SBDToken");

    //collateralToken = await MockERC20.deploy("Collateral Token", "COL", 18);
    //await collateralToken.deployed();

    // Deploy mock debt contract
    MockDebtContract = await ethers.getContractFactory("MockDebtContract");
    debtContract = await MockDebtContract.deploy();
    await debtContract.waitForDeployment();

    // Deploy StabilityPool contract
    StabilityPool = await ethers.getContractFactory("StabilityPool");
    stabilityPool = await StabilityPool.deploy(
      sbdToken.target,
      debtContract.target
    );
    await stabilityPool.waitForDeployment();

    // Mint tokens to users
    const initialSupply = ethers.parseEther("10000");
    await sbdToken.mint(owner.address, initialSupply);
    await sbdToken.mint(alice.address, initialSupply);
    await sbdToken.mint(bob.address, initialSupply);
    await sbdToken.mint(charlie.address, initialSupply);

  });

  describe("Staking and Unstaking", function () {
    it("should allow users to stake tokens", async function () {
      const stakeAmount = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmount);
      await expect(stabilityPool.connect(alice).stake(stakeAmount))
        .to.emit(stabilityPool, "Staked")
        .withArgs(alice.address, stakeAmount);

      const userInfo = await stabilityPool.users(alice.address);
      expect(userInfo.stake).to.equal(stakeAmount);
    });

    it("should not allow staking zero tokens", async function () {
      await sbdToken.connect(alice).approve(stabilityPool.target, 0);
      await expect(stabilityPool.connect(alice).stake(0)).to.be.revertedWith("Cannot stake zero tokens");
    });

    it("should allow users to unstake tokens", async function () {
      const stakeAmount = ethers.parseEther("1000");
      const unstakeAmount = ethers.parseEther("500");

      await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmount);
      await stabilityPool.connect(alice).stake(stakeAmount);

      await expect(stabilityPool.connect(alice).unstake(unstakeAmount))
        .to.emit(stabilityPool, "Unstaked")
        .withArgs(alice.address, unstakeAmount);

      const userInfo = await stabilityPool.users(alice.address);
      expect(userInfo.stake).to.equal(stakeAmount - unstakeAmount);
    });

    it("should not allow unstaking more than staked amount", async function () {
      const stakeAmount = ethers.parseEther("1000");
      const unstakeAmount = ethers.parseEther("1500");

      await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmount);
      await stabilityPool.connect(alice).stake(stakeAmount);

      await expect(stabilityPool.connect(alice).unstake(unstakeAmount)).to.be.revertedWith("Invalid unstake amount");
    });

    it("should not allow unstaking zero tokens", async function () {
      await expect(stabilityPool.connect(alice).unstake(0)).to.be.revertedWith("Cannot unstake zero tokens");
    });
  });

  describe("Reward Distribution", function () {
    beforeEach(async function () {
      // Alice and Bob stake tokens
      const aliceStake = ethers.parseEther("1000");
      const bobStake = ethers.parseEther("2000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await sbdToken.connect(bob).approve(stabilityPool.target, bobStake);

      await stabilityPool.connect(alice).stake(aliceStake);
      await stabilityPool.connect(bob).stake(bobStake);
    });

    it("should distribute rewards proportionally", async function () {
      // Add rewards to the pool
      const rewardAmount = ethers.parseEther("300");
      await sbdToken.connect(owner).approve(stabilityPool.target, rewardAmount);

      await expect(stabilityPool.connect(owner).addReward(rewardAmount))
        .to.emit(stabilityPool, "RewardAdded")
        .withArgs(rewardAmount);

      // Alice claims rewards
      const alicePendingReward = await stabilityPool.userPendingReward(alice.address);
      //console.log(alicePendingReward);
      expect(alicePendingReward).to.equal(ethers.parseEther("100")); // (1000/3000)*300

      await expect(stabilityPool.connect(alice).claimRewards())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(alice.address, alicePendingReward);

      // Bob claims rewards
      const bobPendingReward = await stabilityPool.userPendingReward(bob.address);
      expect(bobPendingReward).to.equal(ethers.parseEther("200")); // (2000/3000)*300

      await expect(stabilityPool.connect(bob).claimRewards())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(bob.address, bobPendingReward);
    });

    it("should not allow adding zero rewards", async function () {
      await expect(stabilityPool.connect(owner).addReward(0)).to.be.revertedWith("Reward must be greater than zero");
    });
  });

  describe("Liquidation Process", function () {
    beforeEach(async function () {
      // Alice and Bob stake tokens
      const aliceStake = ethers.parseEther("1000");
      const bobStake = ethers.parseEther("2000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await sbdToken.connect(bob).approve(stabilityPool.target, bobStake);

      await stabilityPool.connect(alice).stake(aliceStake);
      await stabilityPool.connect(bob).stake(bobStake);
    });

    it("should perform liquidation, reduce stakes and distribute collateral proportionally", async function () {
      const liquidationAmount = ethers.parseEther("900"); // 30% of total stake

      const collateralAmount = ethers.parseEther("9"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

      await stabilityPool.connect(owner).performLiquidation(liquidationAmount);

      // Alice claims collateral
      const alicePendingCollateral = await stabilityPool.userPendingCollateral(alice.address);
      expect(alicePendingCollateral).to.equal(ethers.parseEther("3")); // (1000/3000)*900

      await expect(stabilityPool.connect(alice).claimCollateral())
        .to.emit(stabilityPool, "CollateralClaimed")
        .withArgs(alice.address, alicePendingCollateral);

      // Bob claims collateral
      const bobPendingCollateral = await stabilityPool.userPendingCollateral(bob.address);
      expect(bobPendingCollateral).to.equal(ethers.parseEther("6")); // (2000/3000)*900

      await expect(stabilityPool.connect(bob).claimCollateral())
        .to.emit(stabilityPool, "CollateralClaimed")
        .withArgs(bob.address, bobPendingCollateral);

        // Check updated stakes
      const aliceInfo = await stabilityPool.getUser(alice.address);
      const bobInfo = await stabilityPool.getUser(bob.address);

      // Since we use scaling factors, we need to calculate effective stakes
      const aliceEffectiveStake = aliceInfo.stake;
      const bobEffectiveStake = bobInfo.stake;

      // Expected stakes after 30% reduction
      const aliceExpectedStake = ethers.parseEther("700"); // 1000 - 30% = 700
      const bobExpectedStake = ethers.parseEther("1400"); // 2000 - 30% = 1400

      expect(bobEffectiveStake).to.be.closeTo(bobExpectedStake, ethers.parseEther("0.0001"));
      expect(aliceEffectiveStake).to.be.closeTo(aliceExpectedStake, ethers.parseEther("0.0001"));
    });

  });

  describe("Scaling Factor Reset Mechanism", function () {
    it("should reset scaling factor when it falls below minimum", async function () {
      // Alice and Bob stake tokens
      const aliceStake = ethers.parseEther("1000");
      const bobStake = ethers.parseEther("2000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await sbdToken.connect(bob).approve(stabilityPool.target, bobStake);

      await stabilityPool.connect(alice).stake(aliceStake);
      await stabilityPool.connect(bob).stake(bobStake);

      const collateralAmount = ethers.parseEther("9"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

      // Perform multiple liquidations to reduce scaling factor below minimum
      const totalEffectiveStake = await stabilityPool.getTotalEffectiveStake();
      const liquidationAmount = (totalEffectiveStake * BigInt(999999999999)) / BigInt(1000000000000); // Liquidate 99.99999999% of total stake

      // Scaling factor should reset
      let scalingFactor = await stabilityPool.stakeScalingFactor();
      expect(scalingFactor).to.equal(precision);

      let aliceInfo = await stabilityPool.users(alice.address);
      console.log(aliceInfo);


      await stabilityPool.connect(owner).performLiquidation(liquidationAmount);

      // Scaling factor should reset
      scalingFactor = await stabilityPool.stakeScalingFactor();
      expect(scalingFactor).to.equal(precision);

      let stakeResetCount = await stabilityPool.stakeResetCount();
      expect(stakeResetCount).to.equal(BigInt(1));

      let cumulativeScalingFactor = await stabilityPool._getCumulativeScalingFactor(BigInt(0), BigInt(1));
      console.log(cumulativeScalingFactor);

      // Users' stakes should adjust accordingly when they interact
      //await stabilityPool.connect(alice).unstake(ethers.parseEther("0"));

      aliceInfo = await stabilityPool.getUser(alice.address);
      console.log(aliceInfo);
      expect(aliceInfo.stake).to.be.closeTo(ethers.parseEther("0.000000001"), BigInt(100000)); // Effective stake should be zero after massive liquidation

      const bobInfo = await stabilityPool.getUser(bob.address);
      expect(bobInfo.stake).to.be.closeTo(ethers.parseEther("0.000000002"), BigInt(200000)); // Effective stake should be zero after massive liquidation
    });
  });

  describe("Edge Cases and Validations", function () {
    it("should not allow liquidating more than total effective stake", async function () {
      // Alice stakes tokens
      const aliceStake = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await stabilityPool.connect(alice).stake(aliceStake);

      const totalEffectiveStake = await stabilityPool.getTotalEffectiveStake();
      const invalidLiquidationAmount = totalEffectiveStake;

      await expect(stabilityPool.connect(owner).performLiquidation(invalidLiquidationAmount))
        .to.be.revertedWith("Invalid liquidation amount");
    });

    it("should handle scaling factor approaching zero", async function () {
      // Alice stakes tokens
      const aliceStake = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await stabilityPool.connect(alice).stake(aliceStake);

      // Perform liquidation that would reduce scaling factor significantly
      const totalEffectiveStake = await stabilityPool.getTotalEffectiveStake();
      const liquidationAmount = (totalEffectiveStake * BigInt(9999)) / BigInt(10000); // Liquidate 99.99% of total stake

      await stabilityPool.connect(owner).performLiquidation(liquidationAmount);

      // Scaling factor should reset
      const scalingFactor = await stabilityPool.stakeScalingFactor();
      expect(scalingFactor).to.equal(precision);

      // User's stake should be adjusted
      const aliceInfo = await stabilityPool.users(alice.target);
      expect(aliceInfo.stake).to.equal(0);
    });

    it("should prevent division by zero errors", async function () {
      // Alice stakes tokens
      const aliceStake = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await stabilityPool.connect(alice).stake(aliceStake);

      // Attempt to liquidate an amount that would reduce scaling factor to zero
      const totalEffectiveStake = await stabilityPool.getTotalEffectiveStake();
      const liquidationAmount = (totalEffectiveStake * BigInt(999999)) / BigInt(1000000); // Liquidate 99.9999% of total stake

      await expect(stabilityPool.connect(owner).performLiquidation(liquidationAmount))
        .to.be.revertedWith("Scaling factor too low after liquidation");
    });
  });
});
