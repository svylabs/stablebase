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
      const invalidLiquidationAmount = totalEffectiveStake + BigInt(100);

      const collateralAmount = ethers.parseEther("9"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

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
      const liquidationAmount = (totalEffectiveStake * BigInt(999999999)) / BigInt(1000000000); // Liquidate 99.99999999% of total stake
      console.log(aliceStake / liquidationAmount);

      const collateralAmount = ethers.parseEther("1"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

      console.log(aliceStake / liquidationAmount);

      await stabilityPool.connect(owner).performLiquidation(liquidationAmount);

      // Scaling factor should reset
      const scalingFactor = await stabilityPool.stakeScalingFactor();
      expect(scalingFactor).to.equal(BigInt(1000000000));
      const stakeResetCount = await stabilityPool.stakeResetCount();
      expect(stakeResetCount).to.equal(BigInt(0));

      // User's stake should be adjusted
      const aliceInfo = await stabilityPool.getUser(alice.address);
      expect(aliceInfo.stake).to.be.closeTo(ethers.parseEther("0.000001"), BigInt(100000));
    });

    });





    // Helper function to calculate expected cumulative scaling factor
  function calculateCumulativeScalingFactor(currentCumulative, newScaling, previousScaling) {
    return (currentCumulative * newScaling) / (previousScaling);
  }

  // Helper function to calculate expected user stake after scaling
  function calculateUserStake(userStake, cumulativeScalingFactor) {
    return (userStake * cumulativeScalingFactor) / (ethers.parseEther("1"));
  }

  async function sendCollateral() {
    const collateralAmount = ethers.parseEther("9"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();
  }

  it("should handle multiple staking, unstaking, liquidations, and rewards correctly with precise intermediary checks", async function () {
    // Define the stake, unstake, liquidation, and reward amounts
    const stakeAmounts = [
      ethers.parseEther("1000"), // Alice
      ethers.parseEther("2000"), // Bob
      ethers.parseEther("1500"), // Charlie
      ethers.parseEther("500"),  // Alice additional
      ethers.parseEther("800"),  // Bob additional
    ];
    const unstakeAmounts = [
      ethers.parseEther("300"), // Alice
      ethers.parseEther("700"), // Bob
      ethers.parseEther("400"), // Charlie
      ethers.parseEther("200"), // Alice
      ethers.parseEther("600"), // Bob
    ];
    const liquidationAmounts = [
      ethers.parseEther("900"),   // 1st liquidation
      ethers.parseEther("600"),   // 2nd liquidation
      ethers.parseEther("1200"),  // 3rd liquidation
      ethers.parseEther("500"),   // 4th liquidation
      ethers.parseEther("1000"),  // 5th liquidation
    ];
    const rewardAmounts = [
      ethers.parseEther("100"), // 1st reward
      ethers.parseEther("200"), // 2nd reward
      ethers.parseEther("150"), // 3rd reward
    ];

    // Helper function to get cumulative scaling factor up to a reset count
    async function getCumulativeScalingFactor(resetCount) {
      return await stabilityPool.cumulativeProductScalingFactors(resetCount);
    }

    // Helper function to get total staked raw
    async function getTotalStakedRaw() {
      return await stabilityPool.totalStakedRaw();
    }

    // Initial staking by Alice
    await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmounts[0]);
    await stabilityPool.connect(alice).stake(stakeAmounts[0]);

    // Initial staking by Bob
    await sbdToken.connect(bob).approve(stabilityPool.target, stakeAmounts[1]);
    await stabilityPool.connect(bob).stake(stakeAmounts[1]);

    // Initial staking by Charlie
    await sbdToken.connect(charlie).approve(stabilityPool.target, stakeAmounts[2]);
    await stabilityPool.connect(charlie).stake(stakeAmounts[2]);

    // Check initial totalStakedRaw
    let totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(stakeAmounts[0] + stakeAmounts[1] + stakeAmounts[2]);

    // Check initial cumulativeProductScalingFactors[0]
    let cumulativeScaling0 = await getCumulativeScalingFactor(0);
    expect(cumulativeScaling0).to.equal(precision); // 1e18

    // Add initial rewards
    await sbdToken.connect(owner).approve(stabilityPool.target, rewardAmounts[0]);
    await stabilityPool.connect(owner).addReward(rewardAmounts[0]);

    // Check totalRewardPerToken
    let totalRewardPerToken = await stabilityPool.totalRewardPerToken();
    let expectedRewardPerToken = (rewardAmounts[0] * precision)/ (totalStakedRaw);
    expect(totalRewardPerToken).to.equal(expectedRewardPerToken);

    await sendCollateral();

    // First Liquidation
    await stabilityPool.performLiquidation(liquidationAmounts[0]);

    // After liquidation, check if a reset occurred
    let stakeResetCount = await stabilityPool.stakeResetCount();
    let stakeScalingFactor = await stabilityPool.stakeScalingFactor();
    
    // Calculate expected new scaling factor
    let scalingFactorReduction1 = (liquidationAmounts[0] * precision) / (totalStakedRaw);
    let expectedNewScalingFactor1 = precision - (precision * scalingFactorReduction1) / precision;

    if (expectedNewScalingFactor1 <= ethers.parseEther("0.000001")) { // Assuming minimumScalingFactor =1e6, which is 1e6 /1e18=1e-12
      let cumulativeScaling1 = await getCumulativeScalingFactor(1);
      // Reset occurred
      expect(stakeResetCount).to.equal(1);
      expect(stakeScalingFactor).to.equal(precision); // Reset to precision

      // Check cumulativeProductScalingFactors[1] = cumulativeProductScalingFactors[0] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling1 = calculateCumulativeScalingFactor(cumulativeScaling0, (liquidationAmounts[0] * precision) / (totalStakedRaw), precision);
      expect(cumulativeScaling1).to.equal(expectedCumulativeScaling1);
    } else {
      let cumulativeScaling1 = await getCumulativeScalingFactor(0);
      // No reset
      expect(stakeResetCount).to.equal(0);
      expect(stakeScalingFactor).to.equal(expectedNewScalingFactor1);

      // Check cumulativeProductScalingFactors[0] = cumulativeProductScalingFactors[0] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling0 = calculateCumulativeScalingFactor(cumulativeScaling0, expectedNewScalingFactor1, precision);
      console.log(expectedCumulativeScaling0);
      expect(cumulativeScaling1).to.equal(expectedCumulativeScaling0);
    }

    // Check totalStakedRaw after liquidation
    let expectedTotalStakedRawAfterFirstLiquidation = stakeAmounts[0] + (stakeAmounts[1]) + (stakeAmounts[2]);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawAfterFirstLiquidation);

    // Check users' effective stakes after first liquidation
    let aliceInfo = await stabilityPool.getUser(alice.address);
    let bobInfo = await stabilityPool.getUser(bob.address);
    let charlieInfo = await stabilityPool.getUser(charlie.address);

    // Expected user stakes after liquidation
    if (stakeResetCount === BigInt(1)) {
      // After reset, stakes should be scaled by newScalingFactor1 / precision
      let expectedScalingFactor1 = cumulativeScaling1.mul(precision).div(precision); // Should be liquidation scaling
      let expectedAliceStake = calculateUserStake(stakeAmounts[0], scalingFactorReduction1);
      let expectedBobStake = calculateUserStake(stakeAmounts[1], scalingFactorReduction1);
      let expectedCharlieStake = calculateUserStake(stakeAmounts[2], scalingFactorReduction1);

      // Since it's a reset, scaling factor is set to precision, stakes remain scaled by scalingFactorReduction1
      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.0001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.0001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.0001"));
    } else {
      // No reset, stakes are scaled down by scalingFactorReduction1
      let expectedScalingFactor1 = expectedNewScalingFactor1;
      let expectedAliceStake = calculateUserStake(stakeAmounts[0], expectedScalingFactor1);
      let expectedBobStake = calculateUserStake(stakeAmounts[1], expectedScalingFactor1);
      let expectedCharlieStake = calculateUserStake(stakeAmounts[2], expectedScalingFactor1);

      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.001"));
    }

    // Check pending collateral after first liquidation
    let aliceCollateral = await stabilityPool.userPendingCollateral(alice.address);
    let bobCollateral = await stabilityPool.userPendingCollateral(bob.address);
    let charlieCollateral = await stabilityPool.userPendingCollateral(charlie.address);

    expect(aliceCollateral).to.be.gt(0);
    expect(bobCollateral).to.be.gt(0);
    expect(charlieCollateral).to.be.gt(0);

    // More Staking by Alice
    await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmounts[3]);
    await stabilityPool.connect(alice).stake(stakeAmounts[3]);

    // More Staking by Bob
    await sbdToken.connect(bob).approve(stabilityPool.target, stakeAmounts[4]);
    await stabilityPool.connect(bob).stake(stakeAmounts[4]);

    // Check totalStakedRaw after additional staking
    let expectedTotalStakedRawAfterStaking = expectedTotalStakedRawAfterFirstLiquidation + (stakeAmounts[3]) + (stakeAmounts[4]);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawAfterStaking);

    // Add more rewards
    await sbdToken.connect(owner).approve(stabilityPool.target, rewardAmounts[1]);
    await stabilityPool.connect(owner).addReward(rewardAmounts[1]);

    // Check totalRewardPerToken after adding more rewards
    totalRewardPerToken = await stabilityPool.totalRewardPerToken();
    let expectedRewardPerTokenAfterSecondReward = expectedRewardPerToken + (rewardAmounts[1] * precision) / (totalStakedRaw);
    expect(totalRewardPerToken).to.equal(expectedRewardPerTokenAfterSecondReward);

    await sendCollateral();

    // Second Liquidation
    await stabilityPool.performLiquidation(liquidationAmounts[1]);

    // After second liquidation, check if a reset occurred
    stakeResetCount = await stabilityPool.stakeResetCount();
    stakeScalingFactor = await stabilityPool.stakeScalingFactor();
    let cumulativeScaling2 = await getCumulativeScalingFactor(1);
    
    // Calculate expected new scaling factor
    let scalingFactorReduction2 = (liquidationAmounts[1] * precision) / (totalStakedRaw );
    let expectedNewScalingFactor2 = precision - (precision * scalingFactorReduction2)/ (precision);

    if (expectedNewScalingFactor2 <= (ethers.parseEther("0.000001"))) { // Assuming minimumScalingFactor =1e6, which is 1e6 /1e18=1e-12
      // Reset occurred
      expect(stakeResetCount).to.equal(1);
      expect(stakeScalingFactor).to.equal(precision); // Reset to precision

      // Check cumulativeProductScalingFactors[2] = cumulativeProductScalingFactors[1] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling2 = calculateCumulativeScalingFactor(cumulativeScaling1, (liquidationAmounts[1] * precision) / (totalStakedRaw), precision);
      expect(cumulativeScaling2).to.equal(expectedCumulativeScaling2);
    } else {
      // No reset
      expect(stakeResetCount).to.equal(0);
      expect(stakeScalingFactor).to.equal(expectedNewScalingFactor2);

      // Check cumulativeProductScalingFactors[1] = cumulativeProductScalingFactors[1] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling1 = calculateCumulativeScalingFactor(cumulativeScaling1, expectedNewScalingFactor2, precision);
      expect(cumulativeScaling2).to.equal(expectedCumulativeScaling1);
    }

    // Check totalStakedRaw after second liquidation
    let expectedTotalStakedRawAfterSecondLiquidation = (expectedTotalStakedRawAfterStaking - liquidationAmounts[1]);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawAfterSecondLiquidation);

    // Check users' effective stakes after second liquidation
    aliceInfo = await stabilityPool.getUser(alice.address);
    bobInfo = await stabilityPool.getUser(bob.address);
    charlieInfo = await stabilityPool.getUser(charlie.address);

    if (stakeResetCount.toNumber() ===2) {
      // After second reset, stakes should be scaled by cumulative scaling factor from reset 1 to 2
      let expectedAliceStake = calculateUserStake(stakeAmounts[0] + stakeAmounts[3], (liquidationAmounts[1] * precision) / (totalStakedRaw));
      let expectedBobStake = calculateUserStake(stakeAmounts[1] + stakeAmounts[4], (liquidationAmounts[1] * precision) / (totalStakedRaw));
      let expectedCharlieStake = calculateUserStake(stakeAmounts[2], (liquidationAmounts[1] * precision) / (totalStakedRaw));

      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.0001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.0001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.0001"));
    } else {
      // No reset, stakes are scaled down by scalingFactorReduction2
      let expectedScalingFactor2 = expectedNewScalingFactor2;
      let expectedAliceStake = stakeAmounts[0] + (stakeAmounts[3] * expectedScalingFactor2) / precision;
      let expectedBobStake = stakeAmounts[1] + (stakeAmounts[4] * expectedScalingFactor2) / precision;
      let expectedCharlieStake = stakeAmounts[2] * (expectedScalingFactor2 / precision);

      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.001"));
    }

    // Check pending collateral after second liquidation
    aliceCollateral = await stabilityPool.userPendingCollateral(alice.address);
    bobCollateral = await stabilityPool.userPendingCollateral(bob.address);
    charlieCollateral = await stabilityPool.userPendingCollateral(charlie.address);

    expect(aliceCollateral).to.be.gt(0);
    expect(bobCollateral).to.be.gt(0);
    expect(charlieCollateral).to.be.gt(0);

    // Unstaking by Alice
    await sbdToken.connect(alice).approve(stabilityPool.target, unstakeAmounts[0]);
    await stabilityPool.connect(alice).unstake(unstakeAmounts[0]);

    // Unstaking by Bob
    await sbdToken.connect(bob).approve(stabilityPool.target, unstakeAmounts[1]);
    await stabilityPool.connect(bob).unstake(unstakeAmounts[1]);

    // Unstaking by Charlie
    await sbdToken.connect(charlie).approve(stabilityPool.target, unstakeAmounts[2]);
    await stabilityPool.connect(charlie).unstake(unstakeAmounts[2]);

    // Check totalStakedRaw after unstaking
    let expectedTotalStakedRawAfterUnstaking = expectedTotalStakedRawAfterSecondLiquidation.sub(unstakeAmounts[0]).sub(unstakeAmounts[1]).sub(unstakeAmounts[2]);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawAfterUnstaking);

    // Third Liquidation
    await stabilityPool.performLiquidation(liquidationAmounts[2]);

    // After third liquidation, check if a reset occurred
    stakeResetCount = await stabilityPool.stakeResetCount();
    stakeScalingFactor = await stabilityPool.stakeScalingFactor();
    let cumulativeScaling3 = await getCumulativeScalingFactor(2);
    
    // Calculate expected new scaling factor
    let scalingFactorReduction3 = liquidationAmounts[2].mul(precision).div(totalStakedRaw);
    let expectedNewScalingFactor3 = precision.sub(precision.mul(scalingFactorReduction3).div(precision));

    if (expectedNewScalingFactor3.lte(ethers.parseEther("0.000001"))) { // Assuming minimumScalingFactor =1e6, which is 1e6 /1e18=1e-12
      // Reset occurred
      expect(stakeResetCount).to.equal(3);
      expect(stakeScalingFactor).to.equal(precision); // Reset to precision

      // Check cumulativeProductScalingFactors[3] = cumulativeProductScalingFactors[2] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling3 = calculateCumulativeScalingFactor(cumulativeScaling2, liquidationAmounts[2].mul(precision).div(totalStakedRaw), precision);
      expect(cumulativeScaling3).to.equal(expectedCumulativeScaling3);
    } else {
      // No reset
      expect(stakeResetCount).to.equal(2);
      expect(stakeScalingFactor).to.equal(expectedNewScalingFactor3);

      // Check cumulativeProductScalingFactors[2] = cumulativeProductScalingFactors[2] * newScalingFactor / previousScalingFactor
      let expectedCumulativeScaling2 = calculateCumulativeScalingFactor(cumulativeScaling2, expectedNewScalingFactor3, precision);
      expect(cumulativeScaling3).to.equal(expectedCumulativeScaling2);
    }

    // Check totalStakedRaw after third liquidation
    let expectedTotalStakedRawAfterThirdLiquidation = expectedTotalStakedRawAfterUnstaking.sub(liquidationAmounts[2]);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawAfterThirdLiquidation);

    // Check users' effective stakes after third liquidation
    aliceInfo = await stabilityPool.getUser(alice.address);
    bobInfo = await stabilityPool.getUser(bob.address);
    charlieInfo = await stabilityPool.getUser(charlie.address);

    if (stakeResetCount.toNumber() ===3) {
      // After third reset, stakes should be scaled by cumulative scaling factor from reset 2 to 3
      let expectedAliceStake = calculateUserStake(stakeAmounts[0].add(stakeAmounts[3]), liquidationAmounts[2].mul(precision).div(totalStakedRaw));
      let expectedBobStake = calculateUserStake(stakeAmounts[1].add(stakeAmounts[4]), liquidationAmounts[2].mul(precision).div(totalStakedRaw));
      let expectedCharlieStake = calculateUserStake(stakeAmounts[2].sub(unstakeAmounts[2]), liquidationAmounts[2].mul(precision).div(totalStakedRaw));

      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.0001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.0001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.0001"));
    } else {
      // No reset, stakes are scaled down by scalingFactorReduction3
      let expectedScalingFactor3 = expectedNewScalingFactor3;
      let expectedAliceStake = (stakeAmounts[0].add(stakeAmounts[3])).mul(expectedScalingFactor3).div(precision);
      let expectedBobStake = (stakeAmounts[1].add(stakeAmounts[4])).mul(expectedScalingFactor3).div(precision);
      let expectedCharlieStake = (stakeAmounts[2].sub(unstakeAmounts[2])).mul(expectedScalingFactor3).div(precision);

      expect(aliceInfo.stake).to.be.closeTo(expectedAliceStake, ethers.parseEther("0.001"));
      expect(bobInfo.stake).to.be.closeTo(expectedBobStake, ethers.parseEther("0.001"));
      expect(charlieInfo.stake).to.be.closeTo(expectedCharlieStake, ethers.parseEther("0.001"));
    }

    // Check pending collateral after third liquidation
    aliceCollateral = await stabilityPool.userPendingCollateral(alice.address);
    bobCollateral = await stabilityPool.userPendingCollateral(bob.address);
    charlieCollateral = await stabilityPool.userPendingCollateral(charlie.address);

    expect(aliceCollateral).to.be.gt(0);
    expect(bobCollateral).to.be.gt(0);
    expect(charlieCollateral).to.be.gt(0);

    // More staking by Alice
    await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmounts[3]);
    await stabilityPool.connect(alice).stake(stakeAmounts[3]);

    // Unstaking by Bob
    await sbdToken.connect(bob).approve(stabilityPool.target, unstakeAmounts[3]);
    await stabilityPool.connect(bob).unstake(unstakeAmounts[3]);

    // Unstaking by Charlie
    await sbdToken.connect(charlie).approve(stabilityPool.target, unstakeAmounts[4]);
    await stabilityPool.connect(charlie).unstake(unstakeAmounts[4]);

    // Fourth Liquidation
    await stabilityPool.performLiquidation(liquidationAmounts[3]);

    // Add final rewards
    await sbdToken.connect(owner).approve(stabilityPool.target, rewardAmounts[2]);
    await stabilityPool.connect(owner).addReward(rewardAmounts[2]);

    // Final staking by Alice
    await sbdToken.connect(alice).approve(stabilityPool.target, stakeAmounts[4]);
    await stabilityPool.connect(alice).stake(stakeAmounts[4]);

    // Final unstaking by Bob
    await sbdToken.connect(bob).approve(stabilityPool.target, unstakeAmounts[0]);
    await stabilityPool.connect(bob).unstake(unstakeAmounts[0]);

    // Final unstaking by Charlie
    await sbdToken.connect(charlie).approve(stabilityPool.target, unstakeAmounts[1]);
    await stabilityPool.connect(charlie).unstake(unstakeAmounts[1]);

    // Fifth Liquidation
    await stabilityPool.performLiquidation(liquidationAmounts[4]);

    // Final Check on totalStakedRaw
    const totalStakeSum = stakeAmounts.reduce((acc, amt) => acc.add(amt), ethers.parseEther("0"));
    const totalUnstakeSum = unstakeAmounts.reduce((acc, amt) => acc.add(amt), ethers.parseEther("0"));
    const totalLiquidationSum = liquidationAmounts.reduce((acc, amt) => acc.add(amt), ethers.parseEther("0"));

    const expectedTotalStakedRawFinal = totalStakeSum.sub(totalUnstakeSum).sub(totalLiquidationSum);
    totalStakedRaw = await getTotalStakedRaw();
    expect(totalStakedRaw).to.equal(expectedTotalStakedRawFinal);

    // Check scaling factor
    const finalScalingFactor = await stabilityPool.stakeScalingFactor();
    expect(finalScalingFactor).to.be.lt(precision); // It should be scaled down

    // Check users' effective stakes
    aliceInfo = await stabilityPool.getUser(alice.address);
    bobInfo = await stabilityPool.getUser(bob.address);
    charlieInfo = await stabilityPool.getUser(charlie.address);

    // For precise expected stakes, we need to compute based on previous scaling factors and cumulativeProductScalingFactors
    // Given complexity, consider verifying that stakes are scaled appropriately

    // Example:
    // Alice's final stake should be (1000 + 500 + 800) - 300 - 200 + any scaling reductions
    // Similar calculations for Bob and Charlie

    // Check that Alice's stake is as expected
    let expectedAliceStake = stakeAmounts[0].add(stakeAmounts[3]).add(stakeAmounts[4]).sub(unstakeAmounts[0]);
    let scaledAliceStake = calculateUserStake(expectedAliceStake, finalScalingFactor);
    expect(aliceInfo.stake).to.be.closeTo(scaledAliceStake, ethers.parseEther("0.001"));

    // Check that Bob's stake is as expected
    let expectedBobStake = stakeAmounts[1].add(stakeAmounts[4]).sub(unstakeAmounts[1]).sub(unstakeAmounts[3]);
    let scaledBobStake = calculateUserStake(expectedBobStake, finalScalingFactor);
    expect(bobInfo.stake).to.be.closeTo(scaledBobStake, ethers.parseEther("0.001"));

    // Check that Charlie's stake is as expected
    let expectedCharlieStake = stakeAmounts[2].sub(unstakeAmounts[2]).sub(unstakeAmounts[4]);
    let scaledCharlieStake = calculateUserStake(expectedCharlieStake, finalScalingFactor);
    expect(charlieInfo.stake).to.be.closeTo(scaledCharlieStake, ethers.parseEther("0.001"));

    // Check pending collateral
    aliceCollateral = await stabilityPool.userPendingCollateral(alice.address);
    bobCollateral = await stabilityPool.userPendingCollateral(bob.address);
    charlieCollateral = await stabilityPool.userPendingCollateral(charlie.address);

    expect(aliceCollateral).to.be.gt(0);
    expect(bobCollateral).to.be.gt(0);
    expect(charlieCollateral).to.be.gt(0);

    // Claim Rewards and Collateral and verify
    await stabilityPool.connect(alice).claimRewards();
    await stabilityPool.connect(bob).claimRewards();
    await stabilityPool.connect(charlie).claimRewards();

    await stabilityPool.connect(alice).claimCollateral();
    await stabilityPool.connect(bob).claimCollateral();
    await stabilityPool.connect(charlie).claimCollateral();

    // Verify final balances increased by claimed rewards and collateral
    const aliceFinalBalance = await sbdToken.balanceOf(alice.address);
    const bobFinalBalance = await sbdToken.balanceOf(bob.address);
    const charlieFinalBalance = await sbdToken.balanceOf(charlie.address); // Corrected to sbdToken

    // Ensure that Alice, Bob, and Charlie have received their rewards
    expect(aliceFinalBalance).to.be.gt(ethers.parseEther("10000"));
    expect(bobFinalBalance).to.be.gt(ethers.parseEther("10000"));
    expect(charlieFinalBalance).to.be.gt(ethers.parseEther("10000"));

    // Check that pending rewards and collateral are zero after claiming
    expect(await stabilityPool.userPendingReward(alice.address)).to.equal(0);
    expect(await stabilityPool.userPendingReward(bob.address)).to.equal(0);
    expect(await stabilityPool.userPendingReward(charlie.address)).to.equal(0);

    expect(await stabilityPool.userPendingCollateral(alice.address)).to.equal(0);
    expect(await stabilityPool.userPendingCollateral(bob.address)).to.equal(0);
    expect(await stabilityPool.userPendingCollateral(charlie.address)).to.equal(0);
  });

});
