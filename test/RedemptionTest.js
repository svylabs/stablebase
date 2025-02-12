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
  
      const SBDToken = await ethers.getContractFactory("DFIDToken");
      sbdToken = await SBDToken.deploy();
      await sbdToken.waitForDeployment();
    
      const SBRToken = await ethers.getContractFactory("DFIREToken");
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
  
      const SBRStaking = await ethers.getContractFactory("DFIREStaking");
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

      const aliceSafeId = ethers.solidityPackedKeccak256(["address", "address"], [alice.address, ethers.ZeroAddress]);
      const bobSafeId = ethers.solidityPackedKeccak256(["address", "address"], [bob.address, ethers.ZeroAddress]);
      const charlieSafeId = ethers.solidityPackedKeccak256(["address", "address"], [charlie.address, ethers.ZeroAddress]);
      const davidSafeId = ethers.solidityPackedKeccak256(["address", "address"], [david.address, ethers.ZeroAddress]);
      const eliSafeId = ethers.solidityPackedKeccak256(["address", "address"], [eli.address, ethers.ZeroAddress]);

      const aliceCollateral = ethers.parseEther("800");
      const bobCollateral = ethers.parseEther("800");
      const charlieCollateral = ethers.parseEther("900");
      const davidCollateral = ethers.parseEther("10");
        const eliCollateral = ethers.parseEther("10");

      const aliceBorrowAmount = ethers.parseEther("5000000");
      const bobBorrowAmount = ethers.parseEther("4500000");
      const charlieBorrowAmount = ethers.parseEther("5100000");
      const davidBorrowAmount = ethers.parseEther("50000");
        const eliBorrowAmount = ethers.parseEther("50000");

      users.alice.safeId = aliceSafeId;
      users.alice.borrowAmount = aliceBorrowAmount;
      users.alice.collateralAmount = aliceCollateral;
      users.bob.safeId = bobSafeId;
      users.bob.borrowAmount = bobBorrowAmount;
      users.bob.collateralAmount = bobCollateral;
      users.charlie.safeId = charlieSafeId;
      users.charlie.borrowAmount = charlieBorrowAmount;
      users.charlie.collateralAmount = charlieCollateral;
      users.david = {
         safeId: davidSafeId,
            borrowAmount: davidBorrowAmount,
            collateralAmount: davidCollateral,
      };
      users.eli = {
            safeId: eliSafeId,
                borrowAmount: eliBorrowAmount,
                collateralAmount: eliCollateral,
      };


      priceOracle.setPrice(BigInt(7000)); // Should be able to borrow upto 3000 per collateral

      await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
      await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);
      await utils.borrow(david, davidSafeId, davidCollateral, davidBorrowAmount, BigInt(25), contracts);
      await utils.borrow(eli, eliSafeId, eliCollateral, eliBorrowAmount, BigInt(10), contracts);
      await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(100), contracts);
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
             const snapshot = await utils.redeem(david, amount, contracts, [users.alice.safeId, users.bob.safeId, users.charlie.safeId, users.david.safeId, users.eli.safeId]);
             expect(snapshot.newSnapshot.safes[users.bob.safeId].borrowedAmount).to.equal(snapshot.existingSnapshot.safes[users.bob.safeId].borrowedAmount - amount);
             expect(snapshot.newSnapshot.safes[users.bob.safeId].collateralAmount).to.equal(snapshot.existingSnapshot.safes[users.bob.safeId].collateralAmount - collateralAmount);
             expect(snapshot.newSnapshot.user.ethBalance).to.equal(snapshot.existingSnapshot.user.ethBalance + collateralAmount - snapshot.gasPaid);
             expect(snapshot.newSnapshot.sbdToken.totalSupply).to.equal(snapshot.existingSnapshot.sbdToken.totalSupply - amount);

        });

        it("should be able to redeem multiple safes", async function() {
            priceOracle.setPrice(BigInt(7000));
            await contracts.sbdToken.connect(david).approve(contracts.stabilityPool.target, ethers.parseEther("40000"));
            stabilityPool.connect(david).stake(ethers.parseEther("40000"));
            sbdToken.connect(alice).transfer(david.address, ethers.parseEther("2000000"));
            sbdToken.connect(bob).transfer(david.address, ethers.parseEther("1000000"));
            sbdToken.connect(charlie).transfer(david.address, ethers.parseEther("3000000"));
            const amount = ethers.parseEther("6000000");
            const collateralAmount = amount / price;
            await contracts.sbdToken.connect(david).approve(contracts.stableBaseCDP.target, amount);
            const snapshot = await utils.redeem(david, amount, contracts, [users.alice.safeId, users.bob.safeId, users.charlie.safeId, users.david.safeId, users.eli.safeId]);

            /*

                 800    10     10       800   800
                 4.5m   0.05m   0.05m  5.0m   5.7m
                  0      10     21      100   200

                 6m redemption request

                 4.5m 

                 800 * 7000 = 5.6m 
                 bob: 4.5m / 7000 = 642.857 collateral
                 800 - 642.857 = (157.142) * 7000 = 1.1m to bob
                 redeemerFee: (0.15 * 642.857) / 100 = 0.964
                 ownerFee: 0.15 * 1100000 / 100 = 1650

                 eli: 0.05m 
                 50000 / 7000 = 7.142 collateral
                 10 - 7.142 = 2.857 * 7000 = 20k to eli
                 fee: 0.25 
                 redeemerFee: (0.25 * 7.142) / 100 = 0.0178
                 ownerFee: 0.25 * 20000 / 100 = 50

                 david: 0.05m
                 50000 / 7000 = 7.142 collateral
                 10 - 7.142 = 2.857 in david's safe
                 50k redeemed from david
                 fee: 0.21 + 0.15 = 0.36
                 redeemerFee: 0.36 * 7.142 / 100 = 0.0257
                 ownerFee: 0

                 4.5m + 1.1m + 50k + 20k + 50k = 5.72m

                 6m - 5.72m = 280k

                 alice:
                 800 * 7000 = 5.6m
                 280000 / 7000 = 40 collateral
                 alice: 760 collateral
                 borrowedamount: 5m - 280k = 4.72m
                 redeemerFee: (0.75 * 40) / 100 = 0.3
                 ownerFee: 0

            */
            let redeemed = BigInt(0);
            const bobCollateralRedeemed = BigInt(4500000 * 1e18) / BigInt(7000);
            const bobFeeTier = BigInt(15);
            redeemed += BigInt(5600000 * 1e18);
            const eliCollateralRedeemed = BigInt(50000 * 1e18) / BigInt(7000);
            const eliFeeTier = BigInt(15) + (((users.eli.borrowAmount * BigInt(10) / BigInt(10000))) * BigInt(10000)) / users.eli.borrowAmount;
            const eliFeePaid = (users.eli.borrowAmount * BigInt(10) / BigInt(10000));
            const eliFeeToPay = (BigInt(70000 * 1e18) * BigInt(15)) / BigInt(10000) - eliFeePaid;
            redeemed += BigInt(70000 * 1e18);
            const davidCollateralRedeemed = ethers.parseEther("50000") / BigInt(7000);
            const davidFeeTier = BigInt(15) + (((users.david.borrowAmount * BigInt(25) / BigInt(10000))) * BigInt(10000)) / users.david.borrowAmount;
            const davidFeePaid = (users.david.borrowAmount * BigInt(25) / BigInt(10000));
            const aliceCollateralRedeemed = BigInt(280000 * 1e18) / BigInt(7000);
            const aliceFeeTier = BigInt(75);
            const aliceFeePaid = (users.alice.borrowAmount * BigInt(100) / BigInt(10000));

            console.log(bobCollateralRedeemed, eliCollateralRedeemed, davidCollateralRedeemed, aliceCollateralRedeemed);
            console.log(bobFeeTier, eliFeeTier, davidFeeTier, aliceFeeTier);

           const expectedRedeemAmounts = [
               {safeId: users.bob.safeId, borrowedAmount: 0, collateralAmount: 0, collateralRedeemed: BigInt(800 * 1e18), refunded: BigInt(1100000), redeemerFee: BigInt(1.2 * 1e18), ownerFee: BigInt(8400 * 1e18)},
               {safeId: users.eli.safeId, borrowedAmount: 0, collateralAmount: 0, collateralRedeemed: BigInt(10 * 1e18), refunded: BigInt(20000), redeemerFee: (BigInt(10 * 1e18) * eliFeeTier) / BigInt(10000) , ownerFee: BigInt(55 * 1e18)},
               {safeId: users.david.safeId, borrowedAmount: 0, collateralAmount: ethers.parseEther("10") - davidCollateralRedeemed, collateralRedeemed: davidCollateralRedeemed, refunded: BigInt(0), redeemerFee: (davidCollateralRedeemed * davidFeeTier) / BigInt(10000), ownerFee: BigInt(0)},
               {safeId: users.alice.safeId, borrowedAmount: (users.alice.borrowAmount - ethers.parseEther("280000")), collateralAmount: BigInt(760 * 1e18), collateralRedeemed: BigInt(40 * 1e18), refunded: BigInt(0), redeemerFee: ((aliceCollateralRedeemed * aliceFeeTier) / BigInt(10000)), ownerFee: BigInt(0)}
           ]
           let totalOwnerFee = BigInt(0);
           let totalRedeemerFee = BigInt(0);
           expectedRedeemAmounts.forEach((expectedAmount) => {
               //console.log(expectedAmount);
               //console.log(snapshot.newSnapshot.safes[expectedAmount.safeId]);
               expect(snapshot.newSnapshot.safes[expectedAmount.safeId].borrowedAmount).to.be.closeTo(expectedAmount.borrowedAmount, ethers.parseEther("0.00000000001"));
               expect(snapshot.newSnapshot.safes[expectedAmount.safeId].collateralAmount).to.be.closeTo(expectedAmount.collateralAmount, ethers.parseEther("0.00000000001"));
               totalOwnerFee += expectedAmount.ownerFee;
               totalRedeemerFee += expectedAmount.redeemerFee;
           });
           
           /*console.log(snapshot.newSnapshot.stableBaseCDP.redemptionQueue.all);
           console.log(snapshot.existingSnapshot.stableBaseCDP.liquidationQueue.all);
           console.log(snapshot.newSnapshot.stableBaseCDP.liquidationQueue.all);
           */
           console.log(snapshot.existingSnapshot.stabilityPool.ethBalance, snapshot.newSnapshot.stabilityPool.ethBalance);
           console.log(snapshot.existingSnapshot.stabilityPool.sbdBalance, snapshot.newSnapshot.stabilityPool.sbdBalance);
           // Checking fee distributions
           expect(snapshot.newSnapshot.stabilityPool.sbdBalance).to.be.closeTo(snapshot.existingSnapshot.stabilityPool.sbdBalance + totalOwnerFee, ethers.parseEther("0.00000000001"));
           expect(snapshot.newSnapshot.stabilityPool.ethBalance).to.be.closeTo(snapshot.existingSnapshot.stabilityPool.ethBalance + totalRedeemerFee, ethers.parseEther("0.00000000001"));
           
          
           snapshot.logs.forEach((log) => {
            try {
               console.log(contracts.stableBaseCDP.interface.parseLog(log));
            } catch (ex) {
                try {
                    console.log(contracts.stabilityPool.interface.parseLog(log));
                } catch (ex1) {
                    try {
                        console.log(contracts.sbdToken.interface.parseLog(log));
                    } catch (ex2) {
                        console.log(ex2);
                    }
                }
            }
           });

        });

    });
});