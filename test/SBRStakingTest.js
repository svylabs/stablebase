const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SBRStaking Contract", function () {
  let SBRStaking, sbrStaking;
  let StakingToken, stakingToken;
  let RewardToken, rewardToken;
  let owner, addr1, addr2;
  let stableBaseContract;

  beforeEach(async function () {
    // Get contract factories
    [owner, addr1, addr2, stableBaseContract, ...addrs] = await ethers.getSigners();

    // Deploy mock ERC20 tokens for staking and rewards
    StakingToken = await ethers.getContractFactory("DFIRToken");
    stakingToken = await StakingToken.deploy();
    await stakingToken.waitForDeployment();

    RewardToken = await ethers.getContractFactory("SBDToken");
    rewardToken = await RewardToken.deploy();
    await rewardToken.waitForDeployment();

    // Deploy the SBRStaking contract
    const SBRStakingContract = await ethers.getContractFactory("DFIRStaking");
    sbrStaking = await SBRStakingContract.deploy(false);
    await sbrStaking.waitForDeployment();

    // Set addresses
    await sbrStaking.setAddresses(stakingToken.target, rewardToken.target, stableBaseContract.address);

    stakingToken.mint(owner.address, ethers.parseEther("1000000"));

    // Distribute staking tokens to addr1 and addr2
    await stakingToken.mint(addr1.address, ethers.parseEther("1000"));
    await stakingToken.mint(addr2.address, ethers.parseEther("1000"));

    // Approve the staking contract to spend staking tokens on behalf of addr1 and addr2
    await stakingToken.connect(addr1).approve(sbrStaking.target, ethers.parseEther("1000"));
    await stakingToken.connect(addr2).approve(sbrStaking.target, ethers.parseEther("1000"));

    // Mint some Ether to stableBaseContract for collateral rewards
    await owner.sendTransaction({
      to: stableBaseContract.address,
      value: ethers.parseEther("100"),
    });
    await rewardToken.mint(stableBaseContract.address, ethers.parseEther("1000000"));

    // Approve reward tokens transfer from stableBaseContract to staking contract
    await rewardToken.connect(stableBaseContract).approve(sbrStaking.target, ethers.parseEther("1000000"));
  });

  describe("Deployment", function () {
    it("Should set the correct staking and reward token addresses", async function () {
      expect(await sbrStaking.stakingToken()).to.equal(stakingToken.target);
      expect(await sbrStaking.rewardToken()).to.equal(rewardToken.target);
      expect(await sbrStaking.stableBaseContract()).to.equal(stableBaseContract.address);
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      const stake = await sbrStaking.getStake(addr1.address);
      expect(stake.stake.toString()).to.equal(ethers.parseEther("100"));
      expect(await sbrStaking.totalStake()).to.equal(ethers.parseEther("100"));
    });

    it("Should not allow staking zero tokens", async function () {
      await expect(sbrStaking.connect(addr1).stake(0)).to.be.revertedWith("Cannot stake zero tokens");
    });
  });

  describe("Unstaking", function () {
    

    it("Should allow users to unstake tokens", async function () {
      await stakingToken.connect(addr1).approve(sbrStaking.target, ethers.parseEther("100"));
      await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      await sbrStaking.connect(addr1).unstake(ethers.parseEther("50"));
      const stake = await sbrStaking.getStake(addr1.address);
      expect(stake.stake.toString()).to.equal(ethers.parseEther("50"));
      expect(await sbrStaking.totalStake()).to.equal(ethers.parseEther("50"));
    });

    it("Should not allow unstaking more than staked amount", async function () {
        await stakingToken.connect(addr1).approve(sbrStaking.target, ethers.parseEther("100"));
        await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      await expect(sbrStaking.connect(addr1).unstake(ethers.parseEther("150"))).to.be.revertedWith("Invalid unstake amount");
    });

    it("Should not allow unstaking zero tokens", async function () {
        await stakingToken.connect(addr1).approve(sbrStaking.target, ethers.parseEther("100"));
        await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
       await expect(sbrStaking.connect(addr1).unstake(0)).to.be.revertedWith("Cannot unstake zero tokens");
    });
  });

  describe("Rewards", function () {
    
    it("Should distribute rewards proportionally", async function () {
      // stableBaseContract adds reward
      //await rewardToken.transfer(stableBaseContract.address, ethers.parseEther("300"));
       // addr1 and addr2 stake tokens
      await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      await sbrStaking.connect(addr2).stake(ethers.parseEther("200"));

      await rewardToken.connect(stableBaseContract).approve(sbrStaking.target, ethers.parseEther("300"));
      await sbrStaking.connect(stableBaseContract).addReward(ethers.parseEther("300"));

      // Claim rewards
      await sbrStaking.connect(addr1).claim();
      await sbrStaking.connect(addr2).claim();

      // Check rewards
      const addr1RewardBalance = await rewardToken.balanceOf(addr1.address);
      const addr2RewardBalance = await rewardToken.balanceOf(addr2.address);

      // addr1 should get 100/300 of the rewards
      expect(addr1RewardBalance.toString()).to.equal(ethers.parseEther("100"));
      // addr2 should get 200/300 of the rewards
      expect(addr2RewardBalance.toString()).to.equal(ethers.parseEther("200"));
    });

    it("Should handle collateral rewards", async function () {

        await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      await sbrStaking.connect(addr2).stake(ethers.parseEther("200"));
      // stableBaseContract adds collateral reward
      const collateralAmount = ethers.parseEther("10");
      await sbrStaking.connect(stableBaseContract).addCollateralReward(collateralAmount, { value: collateralAmount });

      // Record initial Ether balances
      const addr1InitialBalance = await ethers.provider.getBalance(addr1.address);
      const addr2InitialBalance = await ethers.provider.getBalance(addr2.address);

      // Claim rewards
      const tx1 = await sbrStaking.connect(addr1).claim();
      const receipt1 = await tx1.wait();
      const gasUsed1 = receipt1.gasUsed *  tx1.gasPrice

      const tx2 = await sbrStaking.connect(addr2).claim();
      const receipt2 = await tx2.wait();
      const gasUsed2 = receipt2.gasUsed * tx2.gasPrice;

      // Check Ether balances after claiming
      const addr1FinalBalance = await ethers.provider.getBalance(addr1.address);
      const addr2FinalBalance = await ethers.provider.getBalance(addr2.address);

      // Calculate expected rewards
      const addr1ExpectedReward = (collateralAmount * ethers.parseEther("100")) / (ethers.parseEther("300"));
      const addr2ExpectedReward = (collateralAmount * ethers.parseEther("200")) / (ethers.parseEther("300"));

      // Assert balances (considering gas costs)
      expect(addr1FinalBalance - addr1InitialBalance + gasUsed1).to.be.closeTo(addr1ExpectedReward, ethers.parseEther("0.0000000000001"));
      expect(addr2FinalBalance - addr2InitialBalance + gasUsed2).to.be.closeTo(addr2ExpectedReward, ethers.parseEther("0.0000000000001"));
    });

    it("Should not distribute rewards if total stake is zero", async function () {

        await sbrStaking.connect(addr1).stake(ethers.parseEther("100"));
      await sbrStaking.connect(addr2).stake(ethers.parseEther("200"));
      // Unstake all tokens
      await sbrStaking.connect(addr1).unstake(ethers.parseEther("100"));
      await sbrStaking.connect(addr2).unstake(ethers.parseEther("200"));

      let totalReward = await sbrStaking.totalRewardPerToken();
      // Attempt to add rewards
      await sbrStaking.connect(stableBaseContract).addReward(ethers.parseEther("100"));
      expect(await sbrStaking.totalRewardPerToken()).to.equal(totalReward);

    });
  });

  describe("Access Control", function () {
    it("Should only allow the stableBaseContract to add rewards", async function () {
      await expect(
        sbrStaking.connect(addr1).addReward(ethers.parseEther("100"))
      ).to.be.revertedWith("Only stableBase contract can add rewards");
    });

    it("Should only allow the stableBaseContract to add collateral rewards", async function () {
      const collateralAmount = ethers.parseEther("10");
      await expect(
        sbrStaking.connect(addr1).addCollateralReward(collateralAmount, { value: collateralAmount })
      ).to.be.revertedWith("Only stableBase contract can add collateral rewards");
    });
  });
});
