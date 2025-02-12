const { expect, assert} = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("Test the flow", function () {
    let stableBaseCDP, sbdToken, sbrToken, sbrStaking, mockPriceOracle, owner, user, stabilityPool, redemptionQueue, liquidationQueue, priceOracle, mockOracle, contracts;
    const safeId = 1;
    const price = BigInt(1000); // Price of the token

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
        },
        david: {
            collateralAmount: ethers.parseEther("2.0"),
            borrowAmount: ethers.parseEther("2000"),
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
  
      const StabilityPool = await ethers.getContractFactory("StabilityPool");
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

      const aliceCollateral = ethers.parseEther("2.0");
      const bobCollateral = ethers.parseEther("2.0");
      const charlieCollateral = ethers.parseEther("2.0");
      const davidCollateral = ethers.parseEther("2.0");

      const aliceBorrowAmount = ethers.parseEther("5000");
      const bobBorrowAmount = ethers.parseEther("4500");
      const charlieBorrowAmount = ethers.parseEther("5700");
      const davidBorrowAmount = ethers.parseEther("2000");

      users.alice.safeId = aliceSafeId;
      users.alice.borrowAmount = aliceBorrowAmount;
      users.alice.collateralAmount = aliceCollateral;
      users.bob.safeId = bobSafeId;
      users.bob.borrowAmount = bobBorrowAmount;
      users.bob.collateralAmount = bobCollateral;
      users.charlie.safeId = charlieSafeId;
      users.charlie.borrowAmount = charlieBorrowAmount;
      users.charlie.collateralAmount = charlieCollateral;
      users.david.safeId = davidSafeId;
      users.david.borrowAmount = davidBorrowAmount;
      users.david.collateralAmount = davidCollateral;

      priceOracle.setPrice(BigInt(3300)); // Should be able to borrow upto 3000 per collateral

      await utils.borrow(alice, aliceSafeId, aliceCollateral, aliceBorrowAmount, BigInt(0), contracts);
      await utils.borrow(bob, bobSafeId, bobCollateral, bobBorrowAmount, BigInt(0), contracts);
      await utils.borrow(charlie, charlieSafeId, charlieCollateral, charlieBorrowAmount, BigInt(200), contracts);

    });

    describe("Test Liquidation from Stability Pool", function() {
        it ("Liquidation should work", async function() {
            const aliceSnapshot = await utils.stakeSBD(alice, users.alice.safeId, users.alice.borrowAmount, contracts);
            const bobSnapshot = await utils.stakeSBD(bob, users.bob.safeId, users.bob.borrowAmount, contracts);
            //const charlieSnapshot = await utils.stakeSBD(charlie, users.charlie.safeId, users.charlie.borrowAmount, contracts);

            priceOracle.setPrice(BigInt(3100));
            const snapshots = await utils.liquidate(owner, contracts);
            const liquidationFee = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * snapshots.existingSnapshot.safe.collateralAmount) / BigInt(10000);
            const gasUsed = snapshots.gasPaid;

            console.log(snapshots.newSnapshot.user.ethBalance, snapshots.existingSnapshot.user.ethBalance, liquidationFee, snapshots.gasPaid);
            //expect(snapshots.newSnapshot.user.ethBalance).to.be.greaterThanOrEqual(snapshots.existingSnapshot.user.ethBalance);
            const gasCompensationPaid = snapshots.newSnapshot.user.ethBalance - (snapshots.existingSnapshot.user.ethBalance - gasUsed);
            const rewardAddedPerToken = (liquidationFee - gasCompensationPaid) / snapshots.existingSnapshot.stabilityPool.totalStakedRaw;

            expect(snapshots.newSnapshot.stabilityPool.ethBalance).to.be.closeTo(snapshots.existingSnapshot.stabilityPool.ethBalance + users.charlie.collateralAmount - gasCompensationPaid, BigInt(1e10));
            expect(snapshots.newSnapshot.stabilityPool.sbdBalance).equals(snapshots.existingSnapshot.stabilityPool.sbdBalance - users.charlie.borrowAmount);
            expect(snapshots.newSnapshot.sbdToken.totalSupply).equals(snapshots.existingSnapshot.sbdToken.totalSupply - users.charlie.borrowAmount);

            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).equals(snapshots.existingSnapshot.stableBaseCDP.totalCollateral - snapshots.existingSnapshot.safe.collateralAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).equals(snapshots.existingSnapshot.stableBaseCDP.totalDebt - snapshots.existingSnapshot.safe.borrowedAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals(BigInt(0));
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals(BigInt(0));

            const liquidatedCollateral = snapshots.existingSnapshot.safe.collateralAmount - gasCompensationPaid;
            const totalStaked = snapshots.existingSnapshot.stabilityPool.totalStakedRaw;

            expect(snapshots.newSnapshot.stabilityPool.totalCollateralPerToken).to.be.closeTo((liquidatedCollateral * BigInt(1e18) / totalStaked), ethers.parseEther("0.0000000001"));

            const aliceCollateral = snapshots.newSnapshot.stabilityPool.totalCollateralPerToken * aliceSnapshot.newSnapshot.user.stabilityPool.stake.stake / BigInt(1e18);
            const bobCollateral = snapshots.newSnapshot.stabilityPool.totalCollateralPerToken * bobSnapshot.newSnapshot.user.stabilityPool.stake.stake / BigInt(1e18);

            //console.log("Alice collateral: ", aliceCollateral.toString(), " Bob collateral: ", bobCollateral.toString());

            expect((await stabilityPool.connect(alice).userPendingRewardAndCollateral(alice.address))[1]).to.equal(aliceCollateral);
            expect((await stabilityPool.connect(bob).userPendingRewardAndCollateral(bob.address))[1]).to.equal(bobCollateral);
        })

        it ("Liquidation should work - fee should be distributed to SBR stakers", async function() {
            const aliceSnapshot = await utils.stakeSBD(alice, users.alice.safeId, users.alice.borrowAmount, contracts);
            const bobSnapshot = await utils.stakeSBD(bob, users.bob.safeId, users.bob.borrowAmount, contracts);
            time.increase(1000);
            const aliceClaim = await stabilityPool.connect(alice).claim();
            const bobClaim = await stabilityPool.connect(bob).claim();
            const totalSBRAlice = await sbrToken.balanceOf(alice.address);
            console.log("Total SBR Alice", totalSBRAlice.toString());
            const tx1= await contracts.sbrToken.connect(alice).approve(sbrStaking.target, totalSBRAlice);
            await tx1.wait();
            const tx2 = await contracts.sbrStaking.connect(alice).stake(totalSBRAlice);
            await tx2.wait();

            //const charlieSnapshot = await utils.stakeSBD(charlie, users.charlie.safeId, users.charlie.borrowAmount, contracts);

            await priceOracle.setPrice(BigInt(3100));
            const snapshots = await utils.liquidate(owner, contracts);
            console.log(snapshots.existingSnapshot.sbrStaking, snapshots.newSnapshot.sbrStaking);
            const liquidationFee = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * snapshots.existingSnapshot.safe.collateralAmount) / BigInt(10000);
            const gasUsed = snapshots.gasPaid;
            snapshots.logs.forEach(log => {
                try {
                console.log(contracts.stableBaseCDP.interface.parseLog(log));
                } catch (ex) {
                    console.log(ex);
                }
            });

            console.log(snapshots.newSnapshot.user.ethBalance, snapshots.existingSnapshot.user.ethBalance, liquidationFee, snapshots.gasPaid, snapshots.gasUsed);
            //expect(snapshots.newSnapshot.user.ethBalance).to.be.greaterThanOrEqual(snapshots.existingSnapshot.user.ethBalance);
            const gasCompensationPaid = snapshots.newSnapshot.user.ethBalance - (snapshots.existingSnapshot.user.ethBalance - gasUsed);
            console.log(gasCompensationPaid, liquidationFee);
            const rewardAddedPerToken = ((liquidationFee - gasCompensationPaid) * BigInt(1e18)) / snapshots.existingSnapshot.sbrStaking.totalStaked;
            console.log("Reward added per token", rewardAddedPerToken);

            expect(snapshots.newSnapshot.stabilityPool.ethBalance).to.be.closeTo(snapshots.existingSnapshot.stabilityPool.ethBalance + users.charlie.collateralAmount - liquidationFee, BigInt(1e10));
            expect(snapshots.newSnapshot.stabilityPool.sbdBalance).equals(snapshots.existingSnapshot.stabilityPool.sbdBalance - users.charlie.borrowAmount);
            expect(snapshots.newSnapshot.sbdToken.totalSupply).equals(snapshots.existingSnapshot.sbdToken.totalSupply - users.charlie.borrowAmount);

            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).equals(snapshots.existingSnapshot.stableBaseCDP.totalCollateral - snapshots.existingSnapshot.safe.collateralAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).equals(snapshots.existingSnapshot.stableBaseCDP.totalDebt - snapshots.existingSnapshot.safe.borrowedAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals(BigInt(0));
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals(BigInt(0));

            const liquidatedCollateral = snapshots.existingSnapshot.safe.collateralAmount - liquidationFee;
            const totalStaked = snapshots.existingSnapshot.stabilityPool.totalStakedRaw;

            expect(snapshots.newSnapshot.stabilityPool.totalCollateralPerToken).to.be.closeTo((liquidatedCollateral * BigInt(1e18) / totalStaked), ethers.parseEther("0.0000000001"));

            expect(snapshots.newSnapshot.sbrStaking.totalCollateralPerToken).to.be.closeTo(rewardAddedPerToken, ethers.parseEther("0.0000000001"));

            const aliceCollateral = snapshots.newSnapshot.stabilityPool.totalCollateralPerToken * aliceSnapshot.newSnapshot.user.stabilityPool.stake.stake / BigInt(1e18);
            const bobCollateral = snapshots.newSnapshot.stabilityPool.totalCollateralPerToken * bobSnapshot.newSnapshot.user.stabilityPool.stake.stake / BigInt(1e18);

            //console.log("Alice collateral: ", aliceCollateral.toString(), " Bob collateral: ", bobCollateral.toString());

            expect((await stabilityPool.connect(alice).userPendingRewardAndCollateral(alice.address))[1]).to.equal(aliceCollateral);
            expect((await stabilityPool.connect(bob).userPendingRewardAndCollateral(bob.address))[1]).to.equal(bobCollateral);
        })


        it("stability pool liquidation should not work", async function() {
            try {
                await contracts.stabilityPool.connect(owner).performLiquidation(BigInt(1), BigInt(1));
                assert.fail("Should not have worked!");
            } catch (ex) {
                //console.log(ex);
                expect(ex.message).includes("Caller is not the debt contract");
            }
        });

    });


    describe("Test Automatic liquidation by distributing debt and collateral to existing users", function() {
        it ("Automatic liquidation should work", async function() {
            try {
                const snapshots = await utils.liquidate(owner, contracts);
                assert.fail("Should not have liquidated!");
            } catch (ex) {
                expect(ex.message).includes("Can't liquidate yet");
            }
            priceOracle.setPrice(BigInt(3100));
            const snapshots = await utils.liquidate(owner, contracts);
            const liquidationFee = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * snapshots.existingSnapshot.safe.collateralAmount) / BigInt(10000);
            expect(snapshots.newSnapshot.user.ethBalance).equals(snapshots.existingSnapshot.user.ethBalance + liquidationFee - snapshots.gasPaid);
            expect(snapshots.newSnapshot.safe.collateralAmount).equals(0);
            expect(snapshots.newSnapshot.safe.borrowedAmount).equals(0);
            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).equals(snapshots.existingSnapshot.stableBaseCDP.totalCollateral - snapshots.existingSnapshot.safe.collateralAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).equals(snapshots.existingSnapshot.stableBaseCDP.totalDebt - snapshots.existingSnapshot.safe.borrowedAmount);


            const liquidatedAmount = snapshots.existingSnapshot.safe.borrowedAmount;
            const liquidatedCollateral = snapshots.existingSnapshot.safe.collateralAmount;
            const totalCollateralAfterLiquidation = snapshots.existingSnapshot.stableBaseCDP.totalCollateral - liquidatedCollateral;
            const totalDebtAfterLiquidation = snapshots.existingSnapshot.stableBaseCDP.totalDebt - liquidatedAmount;
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals((liquidatedCollateral - liquidationFee) * BigInt(1e18)/ totalCollateralAfterLiquidation);
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals((liquidatedAmount * BigInt(1e18))/ totalCollateralAfterLiquidation);

            const aliceSnapshot = await utils.adjustPosition(alice, users.alice.safeId, contracts);
            const bobSnapshot = await utils.adjustPosition(bob, users.bob.safeId, contracts);

            expect(aliceSnapshot.newSnapshot.stableBaseCDP.totalCollateral).equals(aliceSnapshot.existingSnapshot.stableBaseCDP.totalCollateral + (snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));
            expect(aliceSnapshot.newSnapshot.stableBaseCDP.totalDebt).equals(aliceSnapshot.existingSnapshot.stableBaseCDP.totalDebt + (snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));
            expect(aliceSnapshot.newSnapshot.safe.collateralAmount).equals(aliceSnapshot.existingSnapshot.safe.collateralAmount + (snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));
            expect(aliceSnapshot.newSnapshot.safe.borrowedAmount).equals(aliceSnapshot.existingSnapshot.safe.borrowedAmount + (snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));

            expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationSnapshotForSafe.collateralPerCollateralSnapshot).equals(aliceSnapshot.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral);
            expect(aliceSnapshot.newSnapshot.stableBaseCDP.liquidationSnapshotForSafe.debtPerCollateralSnapshot).equals(aliceSnapshot.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral);

            expect(bobSnapshot.newSnapshot.stableBaseCDP.totalCollateral).equals(bobSnapshot.existingSnapshot.stableBaseCDP.totalCollateral + (snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));
            expect(bobSnapshot.newSnapshot.stableBaseCDP.totalDebt).equals(bobSnapshot.existingSnapshot.stableBaseCDP.totalDebt + (snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));           
            expect(bobSnapshot.newSnapshot.safe.collateralAmount).equals(bobSnapshot.existingSnapshot.safe.collateralAmount + (snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));
            expect(bobSnapshot.newSnapshot.safe.borrowedAmount).equals(bobSnapshot.existingSnapshot.safe.borrowedAmount + (snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18));

            expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationSnapshotForSafe.collateralPerCollateralSnapshot).equals(bobSnapshot.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationSnapshotForSafe.debtPerCollateralSnapshot).equals(bobSnapshot.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral);


        });



        it ("Multiple Automatic liquidations should work", async function() {
            try {
                const snapshots = await utils.liquidate(owner, contracts);
                assert.fail("Should not have liquidated!");
            } catch (ex) {
                expect(ex.message).includes("Can't liquidate yet");
            }
            priceOracle.setPrice(BigInt(3100));
            let snapshots = await utils.liquidate(owner, contracts);
            const liquidationFee1 = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * snapshots.existingSnapshot.safe.collateralAmount) / BigInt(10000);
            expect(snapshots.newSnapshot.user.ethBalance).equals(snapshots.existingSnapshot.user.ethBalance + liquidationFee1 - snapshots.gasPaid);
            expect(snapshots.newSnapshot.safe.collateralAmount).equals(0);
            expect(snapshots.newSnapshot.safe.borrowedAmount).equals(0);
            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).equals(snapshots.existingSnapshot.stableBaseCDP.totalCollateral - snapshots.existingSnapshot.safe.collateralAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).equals(snapshots.existingSnapshot.stableBaseCDP.totalDebt - snapshots.existingSnapshot.safe.borrowedAmount);
            const firstLiquidationSnapshot = snapshots;

            const liquidatedAmount = snapshots.existingSnapshot.safe.borrowedAmount;
            const liquidatedCollateral = snapshots.existingSnapshot.safe.collateralAmount;
            const totalCollateralAfterLiquidation = snapshots.existingSnapshot.stableBaseCDP.totalCollateral - liquidatedCollateral;
            const totalDebtAfterLiquidation = snapshots.existingSnapshot.stableBaseCDP.totalDebt - liquidatedAmount;
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals((liquidatedCollateral - liquidationFee1) * BigInt(1e18)/ totalCollateralAfterLiquidation);
            expect(snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals((liquidatedAmount * BigInt(1e18))/ totalCollateralAfterLiquidation);

            //const aliceSnapshot = await utils.adjustPosition(alice, users.alice.safeId, contracts);
            //const debtIncrease = (snapshots.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18);
            //const collateralIncrease = (snapshots.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * aliceSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18);

            //expect(aliceSnapshot.newSnapshot.stableBaseCDP.totalCollateral).equals(aliceSnapshot.existingSnapshot.stableBaseCDP.totalCollateral + collateralIncrease);
            //expect(aliceSnapshot.newSnapshot.stableBaseCDP.totalDebt).equals(aliceSnapshot.existingSnapshot.stableBaseCDP.totalDebt + debtIncrease);

            const davidSnapshot = await utils.borrow(david, users.david.safeId, users.david.collateralAmount, users.david.borrowAmount, BigInt(0), contracts);

            // Charlie liquidated, alice, bob exists, david
            // Alice getting liquidated.
            const alicePendingIncrease = await contracts.stableBaseCDP.getInactiveDebtAndCollateral(users.alice.safeId);
            const bobPendingIncrease = await contracts.stableBaseCDP.getInactiveDebtAndCollateral(users.bob.safeId);
            let davidPendingIncrease = await contracts.stableBaseCDP.getInactiveDebtAndCollateral(users.david.safeId);

            expect(davidPendingIncrease[0]).equals(BigInt(0));
            expect(davidPendingIncrease[1]).equals(BigInt(0));

            priceOracle.setPrice(BigInt(2700));
            snapshots = await utils.liquidate(owner, contracts); // Alice liquidated, alice and bob exists, david just borrowed.
            const secondLiquidationSnapshot = snapshots;
            const liquidationFee2 = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * (snapshots.existingSnapshot.safe.collateralAmount + alicePendingIncrease[1])) / BigInt(10000);
            expect(snapshots.newSnapshot.user.ethBalance).to.be.closeTo(snapshots.existingSnapshot.user.ethBalance + liquidationFee2 - snapshots.gasPaid, BigInt(1e10));
            expect(snapshots.newSnapshot.safe.collateralAmount).equals(0);
            expect(snapshots.newSnapshot.safe.borrowedAmount).equals(0);
            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).equals(snapshots.existingSnapshot.stableBaseCDP.totalCollateral - snapshots.existingSnapshot.safe.collateralAmount);
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).equals(snapshots.existingSnapshot.stableBaseCDP.totalDebt - snapshots.existingSnapshot.safe.borrowedAmount);


            const cumulativeCollateralPerUnitCollateralAfterFirstLiquidation = (firstLiquidationSnapshot.existingSnapshot.safe.collateralAmount - liquidationFee1) * BigInt(1e18) / (firstLiquidationSnapshot.existingSnapshot.stableBaseCDP.totalCollateral - firstLiquidationSnapshot.existingSnapshot.safe.collateralAmount);
            const cumulativeDebtPerUnitCollateralAfterFirstLiquidation = (firstLiquidationSnapshot.existingSnapshot.safe.borrowedAmount) * BigInt(1e18) / (firstLiquidationSnapshot.existingSnapshot.stableBaseCDP.totalCollateral - firstLiquidationSnapshot.existingSnapshot.safe.collateralAmount);

            expect(firstLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals(cumulativeCollateralPerUnitCollateralAfterFirstLiquidation);
            expect(firstLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals(cumulativeDebtPerUnitCollateralAfterFirstLiquidation);

            const cumulativeDebtPerUnitCollateralAfterSecondLiquidation = cumulativeDebtPerUnitCollateralAfterFirstLiquidation + (((secondLiquidationSnapshot.existingSnapshot.safe.borrowedAmount + alicePendingIncrease[0]) * BigInt(1e18)) / (secondLiquidationSnapshot.newSnapshot.stableBaseCDP.totalCollateral));
            const cumulativeCollateralPerUnitCollateralAfterSecondLiquidation = cumulativeCollateralPerUnitCollateralAfterFirstLiquidation + (((secondLiquidationSnapshot.existingSnapshot.safe.collateralAmount + alicePendingIncrease[1] - liquidationFee2) * BigInt(1e18)) / (secondLiquidationSnapshot.newSnapshot.stableBaseCDP.totalCollateral));

            expect(secondLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral).equals(cumulativeCollateralPerUnitCollateralAfterSecondLiquidation);
            expect(secondLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral).equals(cumulativeDebtPerUnitCollateralAfterSecondLiquidation);

            expect(secondLiquidationSnapshot.newSnapshot.stableBaseCDP.totalCollateral).equals(secondLiquidationSnapshot.existingSnapshot.stableBaseCDP.totalCollateral - secondLiquidationSnapshot.existingSnapshot.safe.collateralAmount);
            expect(secondLiquidationSnapshot.newSnapshot.stableBaseCDP.totalDebt).equals(secondLiquidationSnapshot.existingSnapshot.stableBaseCDP.totalDebt - secondLiquidationSnapshot.existingSnapshot.safe.borrowedAmount);

            expect(secondLiquidationSnapshot.safeId).equals(users.alice.safeId);

            const bobSnapshot = await utils.adjustPosition(bob, users.bob.safeId, contracts);
            const debtIncreaseBob = (secondLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeDebtPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18);
            const collateralIncreaseBob = (secondLiquidationSnapshot.newSnapshot.stableBaseCDP.cumulativeCollateralPerUnitCollateral * bobSnapshot.existingSnapshot.safe.collateralAmount) / BigInt(1e18);

            expect(bobSnapshot.newSnapshot.stableBaseCDP.totalCollateral).equals(bobSnapshot.existingSnapshot.stableBaseCDP.totalCollateral + collateralIncreaseBob);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.totalDebt).equals(bobSnapshot.existingSnapshot.stableBaseCDP.totalDebt + debtIncreaseBob);

            expect(bobSnapshot.newSnapshot.safe.collateralAmount).equals(bobSnapshot.existingSnapshot.safe.collateralAmount + collateralIncreaseBob);
            expect(bobSnapshot.newSnapshot.safe.borrowedAmount).equals(bobSnapshot.existingSnapshot.safe.borrowedAmount + debtIncreaseBob);

            expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.all.length).equals(2);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.all.length).equals(2);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.head).equals(users.david.safeId);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.head).equals(users.david.safeId);

            expect(bobSnapshot.newSnapshot.stableBaseCDP.liquidationQueue.tail).equals(users.bob.safeId);
            expect(bobSnapshot.newSnapshot.stableBaseCDP.redemptionQueue.tail).equals(users.bob.safeId);

            // Charlie, Alice liquidated
            // Bob david exists
            // Bob has adjusted his position
            // David has not adjusted his position

            priceOracle.setPrice(BigInt(1090));
            snapshots = await utils.liquidate(owner, contracts);
                //assert.fail("Liquidation should have failed!");
            const thirdLiquidationSnapshot = snapshots;
            const liquidationFee3 = (await stableBaseCDP.REDEMPTION_LIQUIDATION_FEE() * (snapshots.existingSnapshot.safe.collateralAmount)) / BigInt(10000);

            // Bob liquidated, only david exists and david has not adjusted his position
            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral).to.be.closeTo(ethers.parseEther("2.0"), ethers.parseEther("0.1"));
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt).to.be.closeTo(ethers.parseEther("2000"), ethers.parseEther("0.1"));

            // Checks for the third liquidation
            let davidPendingIncrease2 = await contracts.stableBaseCDP.getInactiveDebtAndCollateral(users.david.safeId);

            try {
                await utils.liquidate(owner, contracts);
                assert.fail("Should not have liquidated!");
            } catch (ex) {
                //console.log(ex);
                expect(ex.message).includes("Cannot liquidate the last Safe");
            }

            expect(snapshots.newSnapshot.stableBaseCDP.totalCollateral + davidPendingIncrease2[1]).to.be.closeTo(ethers.parseEther("8.0"), ethers.parseEther("0.1"));
            expect(snapshots.newSnapshot.stableBaseCDP.totalDebt + davidPendingIncrease2[0]).to.be.closeTo(ethers.parseEther("17200"), ethers.parseEther("0.1"));
            
           

        });
    });

});