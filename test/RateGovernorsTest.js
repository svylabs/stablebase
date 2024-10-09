const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RateGovernors Contract - Reserve Ratio < 100% Scenario", function () {
  let RateGovernors;
  let rateGovernors;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // Deploy the RateGovernors contract
    const RateGovernorsFactory = await ethers.getContractFactory("RateGovernors");
    rateGovernors = await RateGovernorsFactory.deploy();
    await rateGovernors.waitForDeployment();
  });

  describe("Complex Scenario with Reserve Ratio < 100%", function () {
    beforeEach(async function () {
      // Initial staking by Rate Governors with reserve ratio < 100%
      await rateGovernors.connect(addr1).stake(1, 300); // Governor 1, Stake = 300, Debt = 1000 (30% reserve ratio)
      await rateGovernors.connect(addr2).stake(2, 400); // Governor 2, Stake = 400, Debt = 2000 (20% reserve ratio)
      await rateGovernors.connect(addr3).stake(3, 200); // Governor 3, Stake = 200, Debt = 500  (40% reserve ratio)

      // Initial debt assignments
      await rateGovernors.connect(owner).assignDebt(1, 1000, 10);  // Governor 1 
      await rateGovernors.connect(owner).assignDebt(2, 2000, 20); // Governor 2
      await rateGovernors.connect(owner).assignDebt(3, 500, 20);  // Governor 3
    });

    it("Should handle multiple distributions with reserve ratios < 100% and validate intermediary states", async function () {
      // Verify initial total debt and stake
      expect(await rateGovernors.totalDebt()).to.equal(3500); // 1000 + 2000 + 500
      expect(await rateGovernors.totalStake()).to.equal(900); // 300 + 400 + 200

      // **First Distribution**
      // 1: 200, 2: 400, 3: 100
      // 1000, 2000, 500 
      // 1200, 2400, 600
      await rateGovernors.distributeCollateralAndDebt(700, 350);

      // Check cumulative variables after first distribution
      let cumulativeDebtPerDebtUnit = await rateGovernors.cumulativeDebtPerDebtUnit();
      let cumulativeCollateralPerDebtUnit = await rateGovernors.cumulativeCollateralPerDebtUnit();
      expect(cumulativeDebtPerDebtUnit).to.equal(ethers.parseUnits("200000000000000000", 0)); // (700 * 1e18) / 3500
      expect(cumulativeCollateralPerDebtUnit).to.equal(ethers.parseUnits("100000000000000000", 0)); // (350 * 1e18) / 3500

      //await rateGovernors.connect(addr1).updateRateGovernor(1); // Trigger update for Governor 1
      //await rateGovernors.connect(addr2).updateRateGovernor(2); // Trigger update for Governor 2
      //await rateGovernors.connect(addr3).updateRateGovernor(3); // Trigger update for Governor 3

      console.log("Governor 1: ", await rateGovernors.rateGovernors(1));
      console.log("Governor 2: ", await rateGovernors.rateGovernors(2));
      console.log("Governor 3: ", await rateGovernors.rateGovernors(3));

      // Verify total debt after distribution
      //expect(await rateGovernors.totalDebt()).to.equal(4200); // 3500 + 700

      // **Governor 1 stakes additional amount**
      //await rateGovernors.connect(addr1).stake(1, 100); // Total stake for Governor 1: 300 + 100 = 400

      // Verify intermediate stake and total stake
      let governor1 = await rateGovernors.rateGovernors(1);
      expect(governor1.stakeAmount).to.equal(300);
      expect(await rateGovernors.totalStake()).to.equal(900); // 400 + 400 + 200

      // **Second Distribution**
      // // 1200, 2400, 600 = 4200
      // (800 / 4200) = 0.190476190476190476 * 1200 = 228.571428571428571
      //  0.190476190476190476 * 2400 = 457.142857142857142
      // 0.190476190476190476 * 600 = 114.285714285714285
      // 1200 + 228.571428571428571, 2400 + 457.142857142857142, 600 + 114.285714285714285
      // 1428.571428571428571, 2857.142857142857142, 714.285714285714285
      await rateGovernors.distributeCollateralAndDebt(800, 400);
      console.log("Governor 1: ", await rateGovernors.rateGovernors(1));
      console.log("Governor 2: ", await rateGovernors.rateGovernors(2));
      console.log("Governor 3: ", await rateGovernors.rateGovernors(3));
      console.log("Governor 3: ", await rateGovernors.totalDebt());

      // Verify cumulative variables after second distribution
      cumulativeDebtPerDebtUnit = await rateGovernors.cumulativeDebtPerDebtUnit();
      cumulativeCollateralPerDebtUnit = await rateGovernors.cumulativeCollateralPerDebtUnit();
      expect(cumulativeDebtPerDebtUnit).to.equal(ethers.parseUnits("428571428571428571", 0)); // Previous + (800 * 1e18 / 4200)
      expect(cumulativeCollateralPerDebtUnit).to.equal(ethers.parseUnits("214285714285714285", 0)); // Previous + (400 * 1e18 / 4200)

      await rateGovernors.connect(addr1).updateRateGovernor(1); // Trigger update for Governor 1
      await rateGovernors.connect(addr2).updateRateGovernor(2); // Trigger update for Governor 2
      await rateGovernors.connect(addr3).updateRateGovernor(3); // Trigger update for Governor 3

      console.log("Governor 1: ", await rateGovernors.rateGovernors(1));
      console.log("Governor 2: ", await rateGovernors.rateGovernors(2));
      console.log("Governor 3: ", await rateGovernors.rateGovernors(3));

      // Verify total debt after second distribution
      //expect(await rateGovernors.totalDebt()).to.equal(5000); // 4200 + 800

      // **Governor 2 unstakes some amount**
      //await rateGovernors.connect(addr2).unstake(2, 100); // Total stake for Governor 2: 400 - 100 = 300

      // Verify intermediate stake and total stake
      let governor2 = await rateGovernors.rateGovernors(2);
      expect(governor2.stakeAmount).to.equal(400);
      expect(await rateGovernors.totalStake()).to.equal(900); // 400 + 300 + 200

      // **Third Distribution**
      // 1428.571428571428571, 2857.142857142857142, 714.285714285714285 = 5000
      // (600 / 5000) = 0.12 * 1428.571428571428571 = 171.428571428571428
      // 0.12 * 2857.142857142857142 = 342.857142857142857
      // 0.12 * 714.285714285714285 = 85.714285714285714
      await rateGovernors.distributeCollateralAndDebt(600, 300);

      // Verify cumulative variables after third distribution
      cumulativeDebtPerDebtUnit = await rateGovernors.cumulativeDebtPerDebtUnit();
      cumulativeCollateralPerDebtUnit = await rateGovernors.cumulativeCollateralPerDebtUnit();
      //expect(cumulativeDebtPerDebtUnit).to.equal(ethers.parseUnits("599999999999999999", 0)); // Previous + (600 * 1e18 / 5000)
      //expect(cumulativeCollateralPerDebtUnit).to.equal(ethers.parseUnits("299999999999999999", 0)); // Previous + (300 * 1e18 / 5000)

      // Verify total debt after third distribution
      //expect(await rateGovernors.totalDebt()).to.equal(5600); // 5000 + 600

      // Trigger updates for all governors
      await rateGovernors.connect(addr1).updateRateGovernor(1); // Trigger update for Governor 1
      await rateGovernors.connect(addr2).updateRateGovernor(2); // Trigger update for Governor 2
      await rateGovernors.connect(addr3).updateRateGovernor(3); // Trigger update for Governor 3

      // Get updated balances
      governor1 = await rateGovernors.rateGovernors(1);
      governor2 = await rateGovernors.rateGovernors(2);
      governor3 = await rateGovernors.rateGovernors(3);

      // Final debt amounts for each governor
      expect(governor1.debtAmount).to.be.closeTo(1000 + 200 + 228 + 171, 1); // Initial + First + Second + Third
      expect(governor2.debtAmount).to.be.closeTo(2000 + 400 + 457 +  342, 1);
      expect(governor3.debtAmount).to.be.closeTo(500 + 100 + 114 + 85, 1);

      // Verify total debt matches expected value
      expect(await rateGovernors.totalDebt()).to.equal(5600);
    });
  });
});
