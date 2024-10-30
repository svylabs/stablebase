const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const start = Date.now();

describe("StabilityPool", function () {
  let StabilityPool, stabilityPool;
  let MockERC20, sbdToken, sbrToken, collateralToken;
  let MockDebtContract, debtContract;
  let owner, alice, bob, charlie, david;
  const precision = BigInt("1" + "0".repeat(18));
  const minimumScalingFactor = BigInt("1" + "0".repeat(6)); // 1e6

  beforeEach(async function () {
    [owner, alice, bob, charlie, david, ...addrs] = await ethers.getSigners();

    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy();
    await sbdToken.waitForDeployment();

    const SBRToken = await ethers.getContractFactory("SBRToken");
    sbrToken = await SBDToken.deploy();
    await sbrToken.waitForDeployment();

    // Deploy mock tokens
    //MockERC20 = await ethers.getContractFactory("SBDToken");

    //collateralToken = await MockERC20.deploy("Collateral Token", "COL", 18);
    //await collateralToken.deployed();

    // Deploy mock debt contract
    MockDebtContract = await ethers.getContractFactory("MockDebtContract");
    debtContract = await MockDebtContract.deploy(sbdToken.target);
    await debtContract.waitForDeployment();

    // Deploy StabilityPool contract
    StabilityPool = await ethers.getContractFactory("StabilityPool");
    stabilityPool = await StabilityPool.deploy(
      sbdToken.target,
      owner.address,
      sbrToken.target
    );
    await stabilityPool.waitForDeployment();

    sbrToken.connect(owner).setMinter(stabilityPool.target);

    await debtContract.connect(owner).setPool(stabilityPool.target);

    // Mint tokens to users
    const initialSupply = ethers.parseEther("10000");
    await sbdToken.mint(owner.address, initialSupply);
    await sbdToken.mint(alice.address, initialSupply);
    await sbdToken.mint(bob.address, initialSupply);
    await sbdToken.mint(charlie.address, initialSupply);
    await sbdToken.mint(david.address, initialSupply);

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

      await expect(stabilityPool.connect(alice).claim())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(alice.address, alicePendingReward, BigInt(0));

      // Bob claims rewards
      const bobPendingReward = await stabilityPool.userPendingReward(bob.address);
      expect(bobPendingReward).to.equal(ethers.parseEther("200")); // (2000/3000)*300

      await expect(stabilityPool.connect(bob).claim())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(bob.address, bobPendingReward, BigInt(0));
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
        to: stabilityPool.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

      await stabilityPool.connect(owner).performLiquidation(liquidationAmount, collateralAmount);

      // Alice claims collateral
      const alicePendingCollateral = await stabilityPool.userPendingCollateral(alice.address);
      expect(alicePendingCollateral).to.equal(ethers.parseEther("3")); // (1000/3000)*900

      await expect(stabilityPool.connect(alice).claim())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(alice.address, BigInt(0), alicePendingCollateral);

      // Bob claims collateral
      const bobPendingCollateral = await stabilityPool.userPendingCollateral(bob.address);
      expect(bobPendingCollateral).to.equal(ethers.parseEther("6")); // (2000/3000)*900

      await expect(stabilityPool.connect(bob).claim())
        .to.emit(stabilityPool, "RewardClaimed")
        .withArgs(bob.address, BigInt(0), bobPendingCollateral);

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
    /*
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
    */
  });

  describe("Edge Cases and Validations", function () {
    it("should not allow liquidating more than total effective stake", async function () {
      // Alice stakes tokens
      const aliceStake = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await stabilityPool.connect(alice).stake(aliceStake);

      const totalEffectiveStake = await stabilityPool.totalStakedRaw();
      const invalidLiquidationAmount = totalEffectiveStake + BigInt(100);

      const collateralAmount = ethers.parseEther("9"); // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: debtContract.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();

      await expect(stabilityPool.connect(owner).performLiquidation(invalidLiquidationAmount, BigInt(2)))
        .to.be.revertedWith("Invalid liquidation amount");
    });

    it("should handle scaling factor approaching zero", async function () {
      // Alice stakes tokens
      const aliceStake = ethers.parseEther("1000");

      await sbdToken.connect(alice).approve(stabilityPool.target, aliceStake);
      await stabilityPool.connect(alice).stake(aliceStake);

      // Perform liquidation that would reduce scaling factor significantly
      const totalEffectiveStake = await stabilityPool.totalStakedRaw();
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

      await stabilityPool.connect(owner).performLiquidation(liquidationAmount, collateralAmount);

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


    describe("Complex test case", async function() {
      it("Should execute the test sequence and check intermediary results", async function () {
        console.log(await time.latest());
        const startTime = await time.latest();
        // Keep track of total staked for calculations
        let totalStaked = ethers.parseEther("0");
    
        // Helper function to calculate expected pending rewards
        let totalRewards = ethers.parseEther("0");
        let userRewards = {};
        let userStakes = {};
        let userCollateralGain = {};
    
        // Initialize user rewards and stakes
        for (const user of [alice, bob, charlie, david]) {
          userRewards[user.address] = BigInt(0);
          userStakes[user.address] = BigInt(0);
          userCollateralGain[user.address] = BigInt(0);
        }

        await sbdToken
          .connect(alice)
          .approve(stabilityPool.target, ethers.MaxUint256);
        await sbdToken
          .connect(bob)
          .approve(stabilityPool.target, ethers.MaxUint256);
        await sbdToken
          .connect(charlie)
          .approve(stabilityPool.target, ethers.MaxUint256);
        await sbdToken
          .connect(david)
          .approve(stabilityPool.target, ethers.MaxUint256);
          await sbdToken
          .connect(owner)
          .approve(stabilityPool.target, ethers.MaxUint256);

          // Initialize stake amounts
        const userAStake = ethers.parseUnits("1000", 18);
        const userBStake = ethers.parseUnits("1000", 18);
        const userCStake = ethers.parseUnits("1000", 18);
        const midTime = await time.latest();
    
        // === Step 1: Alice stakes ===
        await expect(stabilityPool.connect(alice).stake(userAStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(alice.address, userAStake);
    
        userStakes[alice.address] = userAStake;
        totalStaked = totalStaked + userAStake;
    
        // === Check Alice's stake and total staked ===
        let aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(userAStake);
        let totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 2: Bob stakes ===
        await expect(stabilityPool.connect(bob).stake(userBStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(bob.address, userBStake);
    
        userStakes[bob.address] = userBStake;
        totalStaked = totalStaked + userBStake;
    
        // === Check Bob's stake and total staked ===
        let bobInfo = await stabilityPool.getUser(bob.address);
        expect(bobInfo.stake).to.equal(userBStake);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 3: Charlie stakes ===
        await expect(stabilityPool.connect(charlie).stake(userCStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(charlie.address, userCStake);
    
        userStakes[charlie.address] = userCStake;
        totalStaked = totalStaked + userCStake;
    
        // === Check Charlie's stake and total staked ===
        let charlieInfo = await stabilityPool.getUser(charlie.address);
        expect(charlieInfo.stake).to.equal(userCStake);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 4: Add reward of 450 tokens ===
        const rewardAmount1 = ethers.parseUnits("450", 18);
        await sbdToken.transfer(stabilityPool.target, rewardAmount1);
    
        await expect(stabilityPool.connect(owner).addReward(rewardAmount1))
          .to.emit(stabilityPool, "RewardAdded")
          .withArgs(rewardAmount1);
    
        // Update total rewards
        totalRewards = totalRewards + rewardAmount1;
    
        // Expected pending rewards per user
        // Since all users have equal stakes, each should get 150 tokens
        const expectedRewardPerUser1 = rewardAmount1 / BigInt(3);
    
        userRewards[alice.address] = userRewards[alice.address] + expectedRewardPerUser1;
        userRewards[bob.address] = userRewards[bob.address] + expectedRewardPerUser1;
        userRewards[charlie.address] = userRewards[charlie.address] + expectedRewardPerUser1;
    
        // === Check pending rewards ===
        let alicePendingReward = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingReward).to.equal(userRewards[alice.address]);
    
        let bobPendingReward = await stabilityPool.userPendingReward(bob.address);
        expect(bobPendingReward).to.equal(userRewards[bob.address]);
    
        let charliePendingReward = await stabilityPool.userPendingReward(charlie.address);
        expect(charliePendingReward).to.equal(userRewards[charlie.address]);
    
        // === Step 5: Alice unstakes ===
        await expect(stabilityPool.connect(alice).unstake(userAStake))
          .to.emit(stabilityPool, "Unstaked")
          .withArgs(alice.address, userAStake);
    
        userStakes[alice.address] = BigInt(0);
        totalStaked = totalStaked - userAStake;
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(0);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 6: Alice stakes again ===
        await expect(stabilityPool.connect(alice).stake(userAStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(alice.address, userAStake);
    
        userStakes[alice.address] = userAStake;
        totalStaked = totalStaked + userAStake;
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(userAStake);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 7: Alice unstakes again ===
        await expect(stabilityPool.connect(alice).unstake(userAStake))
          .to.emit(stabilityPool, "Unstaked")
          .withArgs(alice.address, userAStake);
    
        userStakes[alice.address] = BigInt(0);
        totalStaked = totalStaked - userAStake;
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(0);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 8: Alice stakes again ===
        await expect(stabilityPool.connect(alice).stake(userAStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(alice.address, userAStake);
    
        userStakes[alice.address] = userAStake;
        userRewards[alice.address] = BigInt(0);
        totalStaked = totalStaked + (userAStake);
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(userAStake);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);

        await time.increase(86400 * 100);
    
        // === Step 9: Bob unstakes ===
        await expect(stabilityPool.connect(bob).unstake(userBStake))
          .to.emit(stabilityPool, "Unstaked")
          .withArgs(bob.address, userBStake);
    
        userStakes[bob.address] = BigInt(0);
        userRewards[bob.address] = BigInt(0);
        totalStaked = totalStaked - userBStake;

        console.log("Total stake before 10th step", userStakes, userRewards, totalStaked);
    
        // === Check Bob's stake and total staked ===
        bobInfo = await stabilityPool.getUser(bob.address);
        expect(bobInfo.stake).to.equal(0);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 10: Add reward of 100 tokens ===
        const rewardAmount2 = ethers.parseUnits("100", 18);
        await sbdToken.transfer(stabilityPool.target, rewardAmount2);
    
        await expect(stabilityPool.connect(owner).addReward(rewardAmount2))
          .to.emit(stabilityPool, "RewardAdded")
          .withArgs(rewardAmount2);

        console.log("UserStakes after adding reward", userStakes, userRewards, rewardAmount2);
    
        // Update total rewards
        totalRewards = totalRewards + rewardAmount2;
    
        // Expected pending rewards per user
        // At this point, only Alice and Charlie have stakes
        const expectedRewardPerUser2 = (rewardAmount2
          * (userStakes[alice.address])
          / (totalStaked));
    
        userRewards[alice.address] = userRewards[alice.address] + (
          expectedRewardPerUser2
        );
        userRewards[charlie.address] = (userRewards[charlie.address] + (
          rewardAmount2) - (expectedRewardPerUser2)
        );
        console.log("User rewards after step10: ", userRewards);
    
        // === Check pending rewards ===
        alicePendingReward = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingReward).to.equal(expectedRewardPerUser2);
    
        charliePendingReward = await stabilityPool.userPendingReward(charlie.address);
        expect(charliePendingReward).to.equal(userRewards[charlie.address]);
    
        // Bob's pending reward should remain the same
        bobPendingReward = await stabilityPool.userPendingReward(bob.address);
        console.log("Bob pending:", bobPendingReward);
        expect(bobPendingReward).to.equal(userRewards[bob.address]);

        charliePendingReward = await stabilityPool.userPendingReward(charlie.address);
        expect(charliePendingReward).to.equal(userRewards[charlie.address]);
    
        // === Step 11: Charlie unstakes ===
        await expect(stabilityPool.connect(charlie).unstake(userCStake))
          .to.emit(stabilityPool, "Unstaked")
          .withArgs(charlie.address, userCStake);
    
        userStakes[charlie.address] = BigInt(0);
        userRewards[charlie.address] = BigInt(0);
        totalStaked = totalStaked - (userCStake);
    
        // === Check Charlie's stake and total staked ===
        charlieInfo = await stabilityPool.getUser(charlie.address);
        expect(charlieInfo.stake).to.equal(0);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 12: Perform liquidation ===
        const liquidateAmount1 = ethers.parseUnits("500", 18);
        const collateralAmount1 = ethers.parseUnits("1", 18);
        await sbdToken.transfer(stabilityPool.target, liquidateAmount1);

        await sendCollateral(collateralAmount1);
    
        await expect(
          stabilityPool.connect(owner).performLiquidation(liquidateAmount1, collateralAmount1)
        )
          .to.emit(stabilityPool, "LiquidationPerformed")
          .withArgs(liquidateAmount1, collateralAmount1);
    
        // Assume that liquidation reduces stakes proportionally
        // Since only Alice is staked, her stake should be reduced
        userStakes[alice.address] = userStakes[alice.address] - (liquidateAmount1);
        totalStaked = totalStaked - (liquidateAmount1);
    
        // Update pending collateral
        userCollateralGain[alice.address] = collateralAmount1;
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.equal(userStakes[alice.address]);
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);
    
        // === Step 13: Add another reward of 100 tokens ===
        await sbdToken.transfer(stabilityPool.target, rewardAmount2);
        console.log("UserStakes", userStakes, userRewards, rewardAmount2);
    
        await expect(stabilityPool.connect(owner).addReward(rewardAmount2))
          .to.emit(stabilityPool, "RewardAdded")
          .withArgs(rewardAmount2);
    
        // Update total rewards
        totalRewards = totalRewards + (rewardAmount2);
    
        // Since only Alice has stake
        userRewards[alice.address] = userRewards[alice.address] + (rewardAmount2);
        console.log("UserStakes", userStakes, userRewards, rewardAmount2);

    
        // === Check pending rewards ===
        alicePendingReward = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingReward).to.equal(userRewards[alice.address]);
    
        // === Step 14: Charlie claims rewards ===
        const charliePendingCollateral = await stabilityPool.userPendingCollateral(
          charlie.address
        );
        const charlieTotalPending = charliePendingCollateral;
    
        await expect(stabilityPool.connect(charlie).claim())
          .to.emit(stabilityPool, "RewardClaimed")
          .withArgs(
            charlie.address,
            userRewards[charlie.address],
            charliePendingCollateral
          );
        // Reset Charlie's rewards
        userRewards[charlie.address] = BigInt(0);
        userCollateralGain[charlie.address] = BigInt(0);
    
        // === Check Charlie's pending rewards ===
        charliePendingReward = await stabilityPool.userPendingReward(charlie.address);
        expect(charliePendingReward).to.equal(0);

        console.log("user stakes", userStakes, userRewards, userCollateralGain);



        /*
        pool.stake(3, Uint.unscaled(500))
print_pool(pool, "After 3 stakes 500 tokens")
pool.stake(4, Uint.unscaled(500))
print_pool(pool, "After 4 stakes 500 tokens")
pool.add_reward(Uint.unscaled(100))
print_pool(pool, "After 100 token rewards added")
pool.liquidate(Uint.unscaled(500), Uint.unscaled(1))
*/
        const stakeAmountStep14 = ethers.parseEther("500");
        await expect(stabilityPool.connect(charlie).stake(stakeAmountStep14))
        .to.emit(stabilityPool, "Staked")
        .withArgs(charlie.address, stakeAmountStep14);

        userStakes[charlie.address] = userStakes[charlie.address] + (stakeAmountStep14);

        await expect(stabilityPool.connect(david).stake(stakeAmountStep14))
        .to.emit(stabilityPool, "Staked")
        .withArgs(david.address, stakeAmountStep14);

        userStakes[david.address] = userStakes[david.address] + (stakeAmountStep14);

        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        totalStaked += stakeAmountStep14 + stakeAmountStep14;
        expect(totalStakedFromContract).to.equal(totalStaked);


        await expect(stabilityPool.connect(owner).addReward(rewardAmount2))
        .to.emit(stabilityPool, "RewardAdded")
        .withArgs(rewardAmount2);

        totalRewards = totalRewards + (rewardAmount2);

        let rewardPerUser = rewardAmount2 / BigInt(3);

        const alicePendingRewardStep14 = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingRewardStep14).to.be.closeTo(userRewards[alice.address] + rewardPerUser, ethers.parseEther("0.0000001"));
        userRewards[alice.address] = userRewards[alice.address] + rewardPerUser;

        const bobPendingRewardStep14 = await stabilityPool.userPendingReward(bob.address);
        expect(bobPendingRewardStep14).to.equal(BigInt(0));

        const charliePendingRewardStep14 = await stabilityPool.userPendingReward(charlie.address);
        expect(charliePendingRewardStep14).to.be.closeTo(userRewards[charlie.address] + rewardPerUser, ethers.parseEther("0.0000001"));
        userRewards[charlie.address] = userRewards[charlie.address] + rewardPerUser;

        const davidPendingRewardStep14 = await stabilityPool.userPendingReward(david.address);
        userRewards[david.address] = userRewards[david.address] + rewardPerUser;
        expect(davidPendingRewardStep14).to.be.closeTo(userRewards[david.address], ethers.parseEther("0.0000001"));

        const liquidateAmountStep14 = ethers.parseEther("500");
        const collateralAmountStep14 = ethers.parseEther("1");
        await sbdToken.connect(owner).transfer(stabilityPool.target, liquidateAmountStep14);
        await sendCollateral(collateralAmountStep14);
        await expect(stabilityPool.connect(owner).performLiquidation(liquidateAmountStep14, collateralAmountStep14))
        .to.emit(stabilityPool, "LiquidationPerformed")
        .withArgs(liquidateAmountStep14, collateralAmountStep14);
        totalStaked = totalStaked - liquidateAmountStep14;

        totalStakedFromContract = await stabilityPool.totalStakedRaw();

        expect(totalStaked).to.equal(totalStakedFromContract);
        userStakes[alice.address] = userStakes[alice.address] - liquidateAmountStep14 / BigInt(3);
        userStakes[charlie.address] = userStakes[charlie.address] - liquidateAmountStep14 / BigInt(3);
        userStakes[david.address] = userStakes[david.address] - liquidateAmountStep14 / BigInt(3);

        userCollateralGain[alice.address] = userCollateralGain[alice.address] + collateralAmountStep14 / BigInt(3);
        userCollateralGain[charlie.address] =  (userCollateralGain[charlie.address] | BigInt(0)) + collateralAmountStep14 / BigInt(3);
        userCollateralGain[david.address] = (userCollateralGain[david.address] | BigInt(0)) + collateralAmountStep14 / BigInt(3);

        /*
           Check the following
            1. Alice's stake and pending rewards
            2. Bob's stake and pending rewards
            3. Charlie's stake and pending rewards
            4. David's stake and pending rewards
        */
       await checkStates(userStakes, userRewards, userCollateralGain, totalStaked, [alice, bob, charlie, david], stabilityPool);
       
    
        // === Step 15: Alice stakes additional 666 tokens ===
        const additionalStake = ethers.parseUnits("666.666666667", 18);
        await expect(stabilityPool.connect(alice).stake(additionalStake))
          .to.emit(stabilityPool, "Staked")
          .withArgs(alice.address, additionalStake);
    
        userStakes[alice.address] = userStakes[alice.address] + (additionalStake);
        // reset rewards and collateral gain
        userRewards[alice.address] = BigInt(0);
        userCollateralGain[alice.address] = BigInt(0);
        totalStaked = totalStaked + (additionalStake);
    
        // === Check Alice's stake and total staked ===
        aliceInfo = await stabilityPool.getUser(alice.address);
        expect(aliceInfo.stake).to.be.closeTo(userStakes[alice.address], ethers.parseEther("0.0000001"));
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        expect(totalStakedFromContract).to.equal(totalStaked);

        // alice- 1000, bob- 0, charlie- 333, david- 333
    
        // === Step 16: Add reward of 100 tokens ===
        // Should be split Alice- 0.6, Charlie- 0.2, david- 0.2
        await sbdToken.transfer(stabilityPool.target, rewardAmount2);
    
        await expect(stabilityPool.connect(owner).addReward(rewardAmount2))
          .to.emit(stabilityPool, "RewardAdded")
          .withArgs(rewardAmount2);
    
        // Update total rewards
        totalRewards = totalRewards + (rewardAmount2);
    
        totalStakedFromContract = await stabilityPool.totalStakedRaw();
        userRewards[alice.address] = userRewards[alice.address] + ((rewardAmount2 * userStakes[alice.address]) / totalStaked);
    
        // === Check pending rewards ===
        alicePendingReward = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingReward).to.be.closeTo(userRewards[alice.address], ethers.parseEther("0.000001"));
        userRewards[charlie.address] = userRewards[charlie.address] + (rewardAmount2 * userStakes[charlie.address]) / totalStaked;
        userRewards[david.address] = userRewards[david.address] + (rewardAmount2 * userStakes[david.address]) / totalStaked;
        await checkStates(userStakes, userRewards, userCollateralGain, totalStaked, [alice, bob, charlie, david], stabilityPool);

        let end = Date.now();
        console.log("Total supply", await sbrToken.totalSupply(), await stabilityPool.totalSbrRewardPerToken(), "Time diff: ", end - start);
        for (const user of [alice, bob, charlie, david]) {
          console.log(await sbrToken.balanceOf(user.address));
        }
        //await new Promise(resolve => setTimeout(resolve, 10000));
        await time.increase(86400 * 365 + 20);
    
        // === Step 17: Perform another liquidation ===
        const liquidateAmount2 = ethers.parseUnits("333", 18);
        await sbdToken.transfer(stabilityPool.target, liquidateAmount2);

        await sendCollateral(collateralAmount1);
    
        await expect(
          stabilityPool.connect(owner).performLiquidation(liquidateAmount2, collateralAmount1)
        )
          .to.emit(stabilityPool, "LiquidationPerformed")
          .withArgs(liquidateAmount2, collateralAmount1);


        // Alice - 1000, Charlie- 333, David - 333
        // After liquidation of 333 tokens, 
        // 1000 + 333 + 333 = 1666
        // 1000/1666 = 0.6, 333/1666 = 0.2
        /// (1000 * 333) / 1666 = 
        // Alice should have approx: 799.5, Charlie - 266.5, David - 266.5
        const liquidationPerToken = liquidateAmount2 / totalStaked;
        userCollateralGain[alice.address] = userCollateralGain[alice.address] + collateralAmount1 * userStakes[alice.address] / totalStaked;
        userCollateralGain[charlie.address] = userCollateralGain[charlie.address] + collateralAmount1 * userStakes[charlie.address] / totalStaked;
        userCollateralGain[david.address] = userCollateralGain[david.address] + collateralAmount1 * userStakes[david.address] / totalStaked;
        userStakes[alice.address] = userStakes[alice.address] - (liquidateAmount2 * userStakes[alice.address] / totalStaked);
        userStakes[charlie.address] = userStakes[charlie.address] - (liquidateAmount2 * userStakes[charlie.address] / totalStaked);
        userStakes[david.address] = userStakes[david.address] - (liquidateAmount2 * userStakes[david.address] / totalStaked);
    
        totalStaked = totalStaked - (liquidateAmount2);
        await checkStates(userStakes, userRewards, userCollateralGain, totalStaked, [alice, bob, charlie, david], stabilityPool);
        //userRewards[alice.address] = userRewards[alice.address] + (collateralAmount1);

    
        // === Step 18: Alice claims rewards ===
        const alicePendingCollateral = await stabilityPool.userPendingCollateral(
          alice.address
        );
        const aliceTotalPending = userRewards[alice.address] + (
          alicePendingCollateral
        );
    
        await expect(stabilityPool.connect(alice).claim())
          .to.emit(stabilityPool, "RewardClaimed")
          //.withArgs(alice.address, userRewards[alice.address], alicePendingCollateral);
    
        // Reset Alice's rewards
        userRewards[alice.address] = BigInt(0);
        userCollateralGain[alice.address] = BigInt(0);
    
        // === Check Alice's pending rewards ===
        alicePendingReward = await stabilityPool.userPendingReward(alice.address);
        expect(alicePendingReward).to.equal(0);
    
        // === Step 19: Charlie claims rewards ===
        // Should be zero since he already claimed
        const charliePendingCollateral2 = await stabilityPool.userPendingCollateral(
          charlie.address
        );
    
        await expect(stabilityPool.connect(charlie).claim())
          .to.emit(stabilityPool, "RewardClaimed");
         /* .withArgs(
            charlie.address,
            userRewards[charlie.address],
            charliePendingCollateral2
          );*/
    
        // Reset Charlie's rewards
        userRewards[charlie.address] = BigInt(0);
        userCollateralGain[charlie.address] = BigInt(0);
    
        // === Step 20: David claims rewards ===
        // David hasn't staked or earned any rewards
        const davidPendingCollateral = await stabilityPool.userPendingCollateral(
          david.address
        );
    
        await expect(stabilityPool.connect(david).claim())
          .to.emit(stabilityPool, "RewardClaimed");
          /*.withArgs(
            david.address,
            userRewards[david.address],
            davidPendingCollateral
          );*/

        userRewards[david.address] = BigInt(0);
        userCollateralGain[david.address] = BigInt(0);
    
        await checkStates(userStakes, userRewards, userCollateralGain, totalStaked, [alice, bob, charlie, david], stabilityPool);



       // Add checks for reset mechanism
       /**
        * ## This should update stake reset count, and reset the stake scaling factor, all of these should work
pool.liquidate(Uint.unscaled(1332.9999999999), Uint.unscaled(1))
print_pool(pool, "After liquidation that resets the stake scaling factor")
pool.stake(5, Uint.unscaled(1000))
print_pool(pool, "After 5 stakes 1000 tokens")
pool.add_reward(Uint.unscaled(100))
print_pool(pool, "After 100 token rewards added")
pool.liquidate(Uint.unscaled(500), Uint.unscaled(1))
print_pool(pool, "After liquidation with new stake reset count")
print(pool.claim(1), "After 1 claims") # This should work
print_pool(pool, "After 1 claims")
print(pool.claim(3), "After 3 claims") # This should work
print_pool(pool, "After 3 claims")
print(pool.claim(4), "After 4 claims") # This should work
print_pool(pool, "After 4 claims")
print(pool.claim(5), "After 5 claims") # This should work
print_pool(pool, "After 5 claims")
        */
        const totalEffectiveStake = await stabilityPool.totalStakedRaw();
        const liquidateAmountStep20 = (totalEffectiveStake * BigInt(999999999999)) / BigInt(1000000000000);
        //const liquidateAmountStep20 = ethers.parseUnits("1333.999999999999999999", 18);
        const collateralAmountStep20 = ethers.parseUnits("1", 18);
        await sendCollateral(collateralAmountStep20);
        await expect(stabilityPool.connect(owner).performLiquidation(liquidateAmountStep20, collateralAmountStep20))
        .to.emit(stabilityPool, "LiquidationPerformed")
        .withArgs(liquidateAmountStep20, collateralAmountStep20);

        userCollateralGain[alice.address] = userCollateralGain[alice.address] + collateralAmountStep20 * userStakes[alice.address] / totalStaked;
        userCollateralGain[charlie.address] = userCollateralGain[charlie.address] + collateralAmountStep20 * userStakes[charlie.address] / totalStaked;
        userCollateralGain[david.address] = userCollateralGain[david.address] + collateralAmountStep20 * userStakes[david.address] / totalStaked;
        userStakes[alice.address] = userStakes[alice.address] - (liquidateAmountStep20 * userStakes[alice.address] / totalStaked);
        userStakes[charlie.address] = userStakes[charlie.address] - (liquidateAmountStep20 * userStakes[charlie.address] / totalStaked);
        userStakes[david.address] = userStakes[david.address] - (liquidateAmountStep20 * userStakes[david.address] / totalStaked);
        

        totalStaked = totalStaked - liquidateAmountStep20;
        expect(await stabilityPool.stakeScalingFactor()).to.equal(BigInt(10**18));
        expect(await stabilityPool.stakeResetCount()).to.equal(BigInt(1));

        await checkStates(userStakes, userRewards, userCollateralGain, totalStaked, [alice, bob, charlie, david], stabilityPool);






        end = Date.now();
        console.log("Total supply", await sbrToken.totalSupply() / BigInt(10 ** 18), await stabilityPool.totalSbrRewardPerToken() / BigInt(10 ** 18), "Time diff: ", end - start);
        for (const user of [alice, bob, charlie, david]) {
          console.log(await sbrToken.balanceOf(user.address) / BigInt(10 ** 18));
        }
        const endTime = await time.latest();
        console.log("Elapsed Time: ", endTime - startTime, startTime, endTime, midTime);
      });
    })


  async function checkStates(userStakes, userRewards, userCollateral, totalStaked, users, stabilityPool) {
     expect(totalStaked).to.equal(await stabilityPool.totalStakedRaw());
     for (const user of users) {
      console.log("Checking user: ", user.address);
       const userStake = await stabilityPool.getUser(user.address);
       expect(userStake.stake).to.be.closeTo(userStakes[user.address], ethers.parseEther("0.0000000000001"));
       const pendingReward = await stabilityPool.userPendingReward(user.address);
       expect(pendingReward).to.be.closeTo(userRewards[user.address], ethers.parseEther("0.0000000000001"));
       const pendingCollateral = await stabilityPool.userPendingCollateral(user.address);
       expect(pendingCollateral).to.be.closeTo(userCollateral[user.address], ethers.parseEther("0.0000000000001"));
     }
  }





    // Helper function to calculate expected cumulative scaling factor
  function calculateCumulativeScalingFactor(currentCumulative, newScaling, previousScaling) {
    return (currentCumulative * newScaling) / (previousScaling);
  }

  // Helper function to calculate expected user stake after scaling
  function calculateUserStake(userStake, cumulativeScalingFactor) {
    return (userStake * cumulativeScalingFactor) / (ethers.parseEther("1"));
  }

  async function sendCollateral(collateralValue) {
    const collateralAmount = collateralValue; // Mock debt contract returns 1 collateral for 900 debt
      const tx = await owner.sendTransaction({
        to: stabilityPool.target,
        value: collateralAmount, // amount in wei
      });
  
      // Wait for the transaction to be mined
      await tx.wait();
  }

});
