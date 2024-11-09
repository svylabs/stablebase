const { expect, assert} = require("chai");
const { ethers } = require("hardhat");
const { time } = require('@nomicfoundation/hardhat-network-helpers');
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
      //await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, sbrToken.target);
      await stabilityPool.setAddresses(sbdToken.target, owner.address, sbrToken.target); // using owner for debt contract
      //await sbrStaking.setAddresses(sbrToken.target, sbdToken.target, stableBaseCDP.target);
      await sbrStaking.setAddresses(sbrToken.target, sbdToken.target, owner.address);
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
      await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(0), contracts);

    });

    describe("Test SBRIssuance And Staking", function() {
        it("Total issued tokens must be 1 per second", async function() {
             const price = BigInt(10000);
             priceOracle.setPrice(price);
             const davidAmount = ethers.parseEther("100000");
             sbdToken.connect(alice).transfer(david.address, davidAmount);
             const eliAmount = ethers.parseEther("300000");
             sbdToken.connect(bob).transfer(eli.address, eliAmount);
             const fabioAmount = ethers.parseEther("400000");
             sbdToken.connect(charlie).transfer(fabio.address, fabioAmount);

             let rewardPerDay = ethers.parseUnits("86400", 18);
             let davidStake = davidAmount / BigInt(2);
             await utils.stakeSBD(david, BigInt(0), davidAmount / BigInt(2), contracts);
             await time.increase(86400); // 1 day
             await stabilityPool.connect(david).claim();
             expect(await sbrToken.balanceOf(david.address)).to.be.closeTo(ethers.parseUnits("86400", 18), BigInt(1 * 1e18));
             let davidBalance = await sbrToken.balanceOf(david.address);
             let eliStake = eliAmount / BigInt(2);
             await utils.stakeSBD(eli, BigInt(0), eliAmount / BigInt(2), contracts);
             await time.increase(86400 * 6); // 1 day
             await stabilityPool.connect(david).claim();
             let davidReward = (davidStake * rewardPerDay * BigInt(6)) / (eliStake + davidStake);
             let eliReward = (eliStake * rewardPerDay * BigInt(6)) / (eliStake + davidStake);
             await stabilityPool.connect(eli).claim();
             //await stabilityPool.connect(david).claim();
             expect(await sbrToken.balanceOf(david.address)).to.be.closeTo(davidReward + davidBalance, BigInt(10 * 1e18));
             expect(await sbrToken.balanceOf(eli.address)).to.be.closeTo(eliReward, BigInt(100 * 1e18));
             expect(await sbrToken.totalSupply()).to.be.closeTo(ethers.parseUnits("86400", 18) * BigInt(7), BigInt(10 * 1e18));

             let fabioStake = fabioAmount / BigInt(2);
             await utils.stakeSBD(fabio, BigInt(0), fabioAmount / BigInt(2), contracts);
             await time.increase(86400 * 300); // 360 days
             await stabilityPool.connect(owner).performLiquidation(BigInt(200000), BigInt(5)) // Should have no impact on user stakes
             await time.increase(86400 * 60); // 1 day
             davidBalance = await sbrToken.balanceOf(david.address);
             davidReward = (davidStake * rewardPerDay * BigInt(358)) / (eliStake + davidStake + fabioStake);
             let eliBalance = await sbrToken.balanceOf(eli.address);
             eliReward = (eliStake * rewardPerDay * BigInt(358)) / (eliStake + davidStake + fabioStake);
             let fabioReward = (fabioStake * rewardPerDay * BigInt(358)) / (eliStake + davidStake + fabioStake);
             await stabilityPool.connect(david).claim();
             await stabilityPool.connect(eli).claim();
             await stabilityPool.connect(fabio).claim();
            expect(await sbrToken.totalSupply()).to.be.closeTo(ethers.parseUnits("86400", 18) * BigInt(365), BigInt(1 * 1e18));
            //expect(await sbrToken.totalSupply()).equals(ethers.parseUnits("86400", 18) * BigInt(365));
            expect(await sbrToken.balanceOf(david.address)).to.be.closeTo(davidReward + davidBalance, BigInt(10 * 1e18));
            expect(await sbrToken.balanceOf(eli.address)).to.be.closeTo(eliReward + eliBalance, BigInt(10 * 1e18));
            expect(await sbrToken.balanceOf(fabio.address)).to.be.closeTo(fabioReward, BigInt(10 * 1e18));
            const totalSupply = await sbrToken.totalSupply();
            const sbrDavid = await sbrToken.balanceOf(david.address);
            const sbrEli = await sbrToken.balanceOf(eli.address);
            const sbrFabio = await sbrToken.balanceOf(fabio.address);
            expect(totalSupply).equals(sbrDavid + sbrEli + sbrFabio);


        });
    });

});