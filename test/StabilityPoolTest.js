const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StabilityPool", function () {
  let StabilityPool, stabilityPool, SBDToken, sbdToken, CollateralToken, collateralToken;
  let owner, user1, user2, addrs;

  beforeEach(async function () {
    [owner, user1, user2, ...addrs] = await ethers.getSigners();

    // Deploy mock SBD and Collateral tokens
    SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("Stable Borrow Dollar", "SBD");
    await sbdToken.waitForDeployment();

    CollateralToken = await ethers.getContractFactory("SBDToken");
    collateralToken = await CollateralToken.deploy("Collateral Token", "CLT");
    await collateralToken.waitForDeployment();

    // Deploy StabilityPool
    StabilityPool = await ethers.getContractFactory("StabilityPool");
    stabilityPool = await StabilityPool.deploy(sbdToken.target, collateralToken.target);
    await stabilityPool.waitForDeployment();

    // Mint some tokens to users
    await sbdToken.mint(owner.address, ethers.parseEther("1000"));
    await sbdToken.mint(user1.address, ethers.parseEther("1000"));
    await sbdToken.mint(user2.address, ethers.parseEther("1000"));
    await collateralToken.mint(owner.address, ethers.parseEther("1000"));

    // Approve StabilityPool to spend tokens
    await sbdToken.connect(user1).approve(stabilityPool.target, ethers.MaxUint256);
    await sbdToken.connect(user2).approve(stabilityPool.target, ethers.MaxUint256);
    await collateralToken.connect(owner).approve(stabilityPool.target, ethers.MaxUint256);
  });

  describe("Staking", function () {
    it("Should allow users to stake SBD tokens", async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
      expect(await stabilityPool.getUserStakedAmount(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await stabilityPool.getTotalStaked()).to.equal(ethers.parseEther("100"));
    });

    it("Should emit Staked event when staking", async function () {
      await expect(stabilityPool.connect(user1).stake(ethers.parseEther("100")))
        .to.emit(stabilityPool, "Staked")
        .withArgs(user1.address, ethers.parseEther("100"));
    });

    it("Should not allow staking zero amount", async function () {
      await expect(stabilityPool.connect(user1).stake(0)).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
    });

    it("Should allow users to unstake SBD tokens", async function () {
      await stabilityPool.connect(user1).unstake(ethers.parseEther("50"));
      expect(await stabilityPool.getUserStakedAmount(user1.address)).to.equal(ethers.parseEther("50"));
      expect(await stabilityPool.getTotalStaked()).to.equal(ethers.parseEther("50"));
    });

    it("Should emit Unstaked event when unstaking", async function () {
      await expect(stabilityPool.connect(user1).unstake(ethers.parseEther("50")))
        .to.emit(stabilityPool, "Unstaked")
        .withArgs(user1.address, ethers.parseEther("50"));
    });

    it("Should not allow unstaking more than staked amount", async function () {
      await expect(stabilityPool.connect(user1).unstake(ethers.parseEther("101"))).to.be.revertedWith("Insufficient stake");
    });
  });

  describe("Rewards", function () {
    beforeEach(async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
      await stabilityPool.connect(user2).stake(ethers.parseEther("200"));
    });

    it("Should allow adding SBD rewards", async function () {
      await expect(stabilityPool.connect(owner).addRewards(ethers.parseEther("30")))
        .to.emit(stabilityPool, "SBDRewardsAdded")
        .withArgs(ethers.parseEther("30"));
    });

    it("Should allow adding collateral rewards", async function () {
      await expect(stabilityPool.connect(owner).addCollateralRewards(ethers.parseEther("30")))
        .to.emit(stabilityPool, "CollateralRewardsAdded")
        .withArgs(ethers.parseEther("30"));
    });

    it("Should distribute rewards correctly", async function () {
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("30"));
      await stabilityPool.connect(owner).addCollateralRewards(ethers.parseEther("30"));

      // Manually transfer rewards to the StabilityPool contract
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("50"));
      await collateralToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("50"));

      await expect(stabilityPool.connect(user1).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user1.address, ethers.parseEther("10"), ethers.parseEther("10"));

      await expect(stabilityPool.connect(user2).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user2.address, ethers.parseEther("20"), ethers.parseEther("20"));
    });
  });

  describe("View functions", function () {
    it("Should return correct total staked amount", async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
      await stabilityPool.connect(user2).stake(ethers.parseEther("200"));
      expect(await stabilityPool.getTotalStaked()).to.equal(ethers.parseEther("300"));
    });

    it("Should return correct user staked amount", async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
      expect(await stabilityPool.getUserStakedAmount(user1.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should return correct global reward snapshot", async function () {
      await stabilityPool.connect(user1).stake(ethers.parseEther("100"));
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("10"));
      await stabilityPool.connect(owner).addCollateralRewards(ethers.parseEther("20"));

      const globalSnapshot = await stabilityPool.getGlobalRewardSnapshot();
      expect(globalSnapshot.sbdRewardPerShare).to.equal(ethers.parseEther("0.1"));
      expect(globalSnapshot.collateralRewardPerShare).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("Dynamic staking and rewards", function () {
    it("Should correctly distribute rewards with dynamic staking and unstaking", async function () {
      // User1 stakes 100 SBD
      await expect(stabilityPool.connect(user1).stake(ethers.parseEther("100")))
        .to.not.emit(stabilityPool, "RewardPaid");

      // Add 50 SBD as rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("50"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("50"));

      // User2 stakes 200 SBD
      await expect(stabilityPool.connect(user2).stake(ethers.parseEther("200")))
        .to.not.emit(stabilityPool, "RewardPaid");

      // Add 90 SBD as rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("90"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("90"));

      // User1 unstakes 50 SBD
      await expect(stabilityPool.connect(user1).unstake(ethers.parseEther("50")))
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user1.address, ethers.parseEther("55"), 0);

      // Add 60 SBD as rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("60"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("60"));

      // Check final rewards for User1
      await expect(stabilityPool.connect(user1).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user1.address, ethers.parseEther("15"), 0);

      // Check final rewards for User2
      await expect(stabilityPool.connect(user2).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user2.address, ethers.parseEther("130"), 0);

      // Verify final staked amounts
      expect(await stabilityPool.getUserStakedAmount(user1.address)).to.equal(ethers.parseEther("50"));
      expect(await stabilityPool.getUserStakedAmount(user2.address)).to.equal(ethers.parseEther("200"));
      expect(await stabilityPool.getTotalStaked()).to.equal(ethers.parseEther("250"));
    });

    it("Should handle multiple users staking, unstaking, and claiming rewards", async function () {
      const user3 = addrs[0];
      await sbdToken.mint(user3.address, ethers.parseEther("1000"));
      await sbdToken.connect(user3).approve(stabilityPool.target, ethers.MaxUint256);

      // Initial stakes
      await expect(stabilityPool.connect(user1).stake(ethers.parseEther("100")))
        .to.not.emit(stabilityPool, "RewardPaid");
      await expect(stabilityPool.connect(user2).stake(ethers.parseEther("200")))
        .to.not.emit(stabilityPool, "RewardPaid");
      await expect(stabilityPool.connect(user3).stake(ethers.parseEther("300")))
        .to.not.emit(stabilityPool, "RewardPaid");

      // Add rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("120"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("120"));

      // User2 unstakes half
      await expect(stabilityPool.connect(user2).unstake(ethers.parseEther("100")))
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user2.address, ethers.parseEther("40"), 0);

      // Add more rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("90"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("90"));

      // User1 stakes more
      await expect(stabilityPool.connect(user1).stake(ethers.parseEther("50")))
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user1.address, ethers.parseEther("30"), 0);

      // Add final rewards
      await stabilityPool.connect(owner).addRewards(ethers.parseEther("60"));
      await sbdToken.connect(owner).transfer(stabilityPool.target, ethers.parseEther("60"));

      // Check final rewards
      await expect(stabilityPool.connect(user1).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user1.address, ethers.parseEther("25"), 0);

      await expect(stabilityPool.connect(user2).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user2.address, ethers.parseEther("30"), 0);

      await expect(stabilityPool.connect(user3).withdrawRewards())
        .to.emit(stabilityPool, "RewardPaid")
        .withArgs(user3.address, ethers.parseEther("145"), 0);

      // Verify final staked amounts
      expect(await stabilityPool.getUserStakedAmount(user1.address)).to.equal(ethers.parseEther("150"));
      expect(await stabilityPool.getUserStakedAmount(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await stabilityPool.getUserStakedAmount(user3.address)).to.equal(ethers.parseEther("300"));
      expect(await stabilityPool.getTotalStaked()).to.equal(ethers.parseEther("550"));
    });
  });
});
