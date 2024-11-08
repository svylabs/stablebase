const { Environment, Agent } = require("flocc");
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require("hardhat");
const { deployContract } = require("@nomicfoundation/hardhat-ethers/types");
const { assert, expect } = require("chai");

const numBorrowers = 100;
const numBots = 5;
const numThirdpartyStablecoinHolders = 300;

function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

class Actor extends Agent {
    constructor(account, initialBalance, contracts, market, tracker) {
        super();
        this.account = account;
        this.contracts = contracts;
        this.ethBalance = initialBalance;
        this.sbdBalance = BigInt(0);
        this.sbrBalance = BigInt(0);
        this.market = market;
        this.tracker = tracker;
        this.stabilityPool = {
            stake: BigInt(0),
            unclaimedRewards: {
                sbd: BigInt(0),
                eth: BigInt(0),
                sbr: BigInt(0)
            }
        }
        this.sbrStaking = {
            stake: BigInt(0),
            unclaimedRewards: {
                sbd: BigInt(0),
                eth: BigInt(0),
                sbr: BigInt(0)
            }
        }
    }
    async distributeCollateralGain(gain) {
        this.stabilityPool.unclaimedRewards.eth += gain;
    }
    async distributeSbdRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbd += reward;
    }
    async distributeSbrRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbr += reward;
    }
    async distributeSbrStakingRewards(reward) {
        this.sbrStaking.unclaimedRewards.sbr += reward;
    }
    async distributeSbrStakingEthRewards(reward) {
        this.sbrStaking.unclaimedRewards.eth += reward;
    }
    async step() {
        this.ethBalance = await this.account.provider.getBalance(this.account.address);
    }
}

class Borrower extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super(account, initialBalance, contracts, market, tracker);
        this.safeId = ethers.solidityPackedKeccak256(["address", "address"], [account.address, ethers.ZeroAddress]);
        this.safe = {
            collateral: BigInt(0),
            debt: BigInt(0)
        }
        this.riskProfile = getRandomInRange(0.0001, 0.002); // lower this number, higher the risk
        this.shieldingRate = BigInt(Math.floor(this.riskProfile * 1000)); // 0.01 * 1000 = 10 basis points
    }

    async openSafe() {
        console.log("Opening safe for ", this.safeId, this.id);
        ///console.log("Account balance: ", this.account, );
        let collateralAmount = (this.ethBalance * BigInt(Math.floor(getRandomInRange(0.001, 0.01) * 1000)) / BigInt(1000));
        console.log("OPening safe with collateral ", collateralAmount);
        const tx = await this.contracts.stableBaseCDP.connect(this.account).openSafe(this.safeId, collateralAmount, { value: collateralAmount });
        const detail = await tx.wait();
        const gas = detail.gasUsed * tx.gasPrice;
        this.safe.collateral = collateralAmount;
        this.tracker.addBorrower(this);
        expect(this.ethBalance - collateralAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
    }

    async borrow() {
        if (this.safe.collateral == BigInt(0)) {
            await this.openSafe();
        }
        const borrowAmount = (this.safe.collateral * this.market.collateralPrice * BigInt(Math.floor(getRandomInRange(0.1, 0.8) * 1000)) / BigInt(1000));
        console.log("Borrowing  ", borrowAmount);
        if (this.safe.debt + borrowAmount > ((this.safe.collateral * this.market.collateralPrice * BigInt(909)) / BigInt(1000))) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, BigInt(0), BigInt(0));
                assert.fail("Borrow should have failed");
            } catch (error) {
                console.log("Borrow failed as expected");
            }
        } else {
            const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, BigInt(0), BigInt(0));
            const detail = await tx.wait();
            this.safe.debt += borrowAmount;
            const shieldingFee = borrowAmount * this.shieldingRate / BigInt(10000);
            this.sbdBalance += borrowAmount - shieldingFee;
            const refund = await this.tracker.distributeShieldingFee(shieldingFee);
            this.sbdBalance += refund;
            // Check fees refund, fee paid to stability pool, fee paid to SBR stakers, debt and collateral in contract
        }
    }

    async repay() {
        if (this.safe.debt == BigInt(0)) {
            return;
        }
        const repayAmount = (this.safe.debt * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) / BigInt(1000));
        console.log("Repaying ", repayAmount);
        if (repayAmount > this.sbdBalance || ((this.safe.debt - repayAmount) < await this.contracts.stableBaseCDP.MINIMUM_DEBT())) {
            // this should fail
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, BigInt(0));
                assert.fail(`Repay should have failed ${repayAmount} ${this.sbdBalance} ${this.safe.debt}`);
            } catch (error) {
                console.log("Repay failed as expected");
            }
        } else {
            const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, BigInt(0));
            const detail = await tx.wait();
            this.safe.debt -= repayAmount;
            this.sbdBalance -= repayAmount;
            // Check debt and collateral in contract
        }
    }

    async closeSafe() {

    }

    async withdrawCollateral() {
        if (this.safe.collateral == BigInt(0)) {
            return;
        }
        const withdrawAmount = (this.safe.collateral * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) / BigInt(1000));
        console.log("Withdrawing collateral ", withdrawAmount);
        const collateralValue = this.safe.collateral * this.market.collateralPrice;
        const withdrawValue = withdrawAmount * this.market.collateralPrice;
        if ((collateralValue - withdrawValue) < (this.safe.debt * BigInt(1100) / BigInt(1000))) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, BigInt(0));
                assert.fail("Withdraw should have failed");
            } catch (error) {
                console.log("Withdraw failed as expected");
            }
        } else {
            const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, BigInt(0));
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            this.safe.collateral -= withdrawAmount;
            expect(this.ethBalance + withdrawAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
            // Check collateral in contract
        }
    }

    async addCollateral() {

    }

    async topupFee() {

    }

    async stakeSBD() {
    }

    async unstakeSBD() {
    }

    async claimRewards() {
    }

    async stakeSBR() {
    }

    async unstakeSBR() {
    }

    async step() {
        await super.step();
        if (Math.random() < 0.03) {
            await this.borrow();
            return;
        }
        if (Math.random() < 0.03) {
            await this.repay();
            return;
        }
        if (Math.random() < 0.03) {
            await this.withdrawCollateral();
            return;
        }
        if (Math.random() < 0.03) {
            await this.addCollateral();
            return;
        }
        if (Math.random() < 0.03) {
            await this.topupFee();
            return;
        }
        if (Math.random() < 0.5) {
            await this.stakeSBD();
            return;
        }
        if (Math.random() < 0.1) {
            await this.unstakeSBD();
            return;
        }
    }
}

class Bot extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super(account, initialBalance, contracts, market, tracker);
    }
    async liquidate() {

    }
    async redeem() {

    }
    async step() {

    }
}

class ThirdpartyStablecoinHolder extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super(account, initialBalance, contracts, market, tracker);
    }
    async stakeSBD() {
    }

    async unstakeSBD() {
    }

    async claimRewards() {
    }

    async stakeSBR() {
    }

    async unstakeSBR() {
    }

    async step() {

    }

}

// Market agent to simulate collateral price fluctuations
class Market extends Agent {
    constructor(account, initialBalance, contracts, tracker) {
      super();
      this.contracts = contracts;
      this.account = account;
      this.ethBalance = initialBalance;
      console.log("Market initial balance: ", this.ethBalance);
      this.collateralPrice = BigInt(3000); // Starting price for collateral (e.g., ETH)
      this.sbdPrice = BigInt(1);;
      this.tracker = tracker;
      this.sbdBalance = BigInt(0);
      this.sbrBalance = BigInt(0);
    }

    async buyETH(amount, buyer) {
        if (this.ethBalance < amount) {
            return false;
        }
        this.ethBalance -= amount;
        this.sbdBalance += amount;
        this.collateralPrice = this.collateralPrice * (1 + Math.random() * 0.02); // ±2% fluctuation
        this.sbdPrice = this.sbdPrice * (1 - Math.random() * 0.01); // ±2% fluctuation
        const tx = await account.sendTransaction({
            to: buyer.address,
            value: amount // Send 1 ETH
          });
        await tx.wait();
        return true;
    }

    async buySBD(amount, buyer) {
        if (this.sbdBalance < amount) {
            return false;
        }
        this.sbdPrice = this.sbdPrice * (1 + Math.random() * 0.01); // ±2% fluctuation
        this.collateralPrice = this.collateralPrice * (1 - Math.random() * 0.02); // ±2% fluctuation
        this.ethBalance += amount;
        this.sbdBalance -= amount;
        const tx = await this.contracts.sbdToken.connect(this.account).tranfser(buyer.address, amount);
        await tx.wait();
        return true;
    }

    async fluctuateCollateralPrice() {
        this.collateralPrice = this.collateralPrice * (1 + Math.random() * 0.02); // ±2% fluctuation
    }
  
    async step() {
       //await this.fluctuateCollateralPrice();
       await this.contracts.priceOracle.setPrice(this.collateralPrice);
    }
  }

// A tracker agent to compute and verify the protocol's state offline, used to ensure protocol works as expected
class OfflineProtocolTracker extends Agent {
  constructor(contracts, market, actors) {
    super();
    this.contracts = contracts;
    this.actors = actors;
    this.borrowers = {};
    this.totalCollateral = BigInt(0); // Collateral value
    this.totalDebt = BigInt(0); // Debt in stablecoin (SBD)
    this.market = market;
    this.stabilityPool = {
        stakers: [],
        totalStake: BigInt(0),
        totalRewards: {
            sbd: BigInt(0),
            eth: BigInt(0),
            sbr: BigInt(0)
        }
    }
    this.sbrStaking = {
        totalStake: 0,
        stakers: [],
        totalRewards: {
            sbd: BigInt(0),
            eth: BigInt(0)
        }
    }
  }

  async addBorrower(borrowerAgent) {
    this.borrowers[borrowerAgent.id] = borrowerAgent;
  }

  async removeBorrower(borrowerAgent) {
    delete this.borrowers[borrowerAgent.id];
  }

  async distributeShieldingFee(fee) {
     let totalStake = this.stabilityPool.totalStake;
     let distributed = BigInt(0);
     for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
        const staker= this.stabilityPool.stakers[i];
         const share = (fee * staker.stabilityPool.stake * BigInt(9000))  / (totalStake * BigInt(10000));
         staker.distributeSbdRewards(share);
         distributed += share;
     }
     let sbrTotalStake = this.sbrStaking.totalStake;
     let distributedToSbrStakers = BigInt(0);
     for (let i = 0; i< this.sbrStaking.stakers.length ; i++) {
         const staker = this.sbrStaking.stakers[i];
         const share = (fee * staker.stake * BigInt(1000))  / (sbrTotalStake * BigInt(10000));
         staker.distributeSbrStakingRewards(share);
         distributedToSbrStakers += share;
     }
     this.stabilityPool.totalRewards.sbd += distributed;
     this.sbrStaking.totalRewards.sbd += distributedToSbrStakers;
     return fee - distributed - distributedToSbrStakers; // return refund
  }

  async distributeCollateralGains(collateral) {

  }

  async distributeLiquidationFee() {

  }

  async distributeRedemptionFee() {

  }

  async validateDebtAndCollateral() {
    let totalCollateral = BigInt(0);
    let totalDebt = BigInt(0);

    for (const borrowerId of Object.keys(this.borrowers)) {
        //console.log("Checking..", borrowerId);
        const borrower = this.borrowers[borrowerId];
        totalCollateral += borrower.safe.collateral;
        totalDebt += borrower.safe.debt;
    }
    expect(totalCollateral).to.equal(await this.contracts.stableBaseCDP.totalCollateral(), "Total collateral mismatch");
    expect(totalDebt).to.equal(await this.contracts.stableBaseCDP.totalDebt(), "Total debt mismatch");
  }

  async validateTotalSupply() {
    let sbdTokens = BigInt(0);
    let sbrTokens = BigInt(0);
    for (const actor of this.actors) {
        sbdTokens += actor.sbdBalance;
        sbrTokens += actor.sbrBalance;
    }
    sbdTokens += this.market.sbdBalance;
    sbrTokens += this.market.sbrBalance;
    expect(sbdTokens).to.equal(await this.contracts.sbdToken.totalSupply(), "Total SBD tokens mismatch");
    expect(sbrTokens).to.equal(await this.contracts.sbrToken.totalSupply(), "Total SBR tokens mismatch");
  }

  async step() {
    //this.checkForLiquidation(collateralPrice);
    await this.validateDebtAndCollateral();
    await this.validateTotalSupply();
  }
}

async function deployContracts() {
    // Get the deployer's wallet address
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
  
    // Display the deployer's balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", balance);
  
    const SBDToken = await ethers.getContractFactory("SBDToken");
      const sbdToken = await SBDToken.deploy();
      await sbdToken.waitForDeployment();
      console.log("Deployed SBDToken to:", sbdToken.target);
    
      const SBRToken = await ethers.getContractFactory("SBRToken");
      const sbrToken = await SBRToken.deploy();
      await sbrToken.waitForDeployment();
      console.log("Deployed SBRToken to:", sbrToken.target);
  
      const StabilityPool = await ethers.getContractFactory("StabilityPool");
      const stabilityPool = await StabilityPool.deploy();
      await stabilityPool.waitForDeployment();
      console.log("Deployed StabilityPool to:", stabilityPool.target);
      
      const PriceOracle = await ethers.getContractFactory("MockPriceOracle");
      const priceOracle = await PriceOracle.deploy();
      await priceOracle.waitForDeployment();
      console.log("Deployed PriceOracle to:", priceOracle.target);
  
      const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
      const stableBaseCDP = await StableBaseCDPFactory.deploy();
      await stableBaseCDP.waitForDeployment();
      console.log("Deployed StableBaseCDP to:", stableBaseCDP.target);
  
      const SBRStaking = await ethers.getContractFactory("SBRStaking");
      const sbrStaking = await SBRStaking.deploy();
      await sbrStaking.waitForDeployment();
      console.log("Deployed SBRStaking to:", sbrStaking.target);
  
      const OrderedDoublyLinkedList = await ethers.getContractFactory("OrderedDoublyLinkedList");
      const redemptionQueue = await OrderedDoublyLinkedList.deploy();
      await redemptionQueue.waitForDeployment();
      console.log("Deployed LiquidationQueue to:", redemptionQueue.target);
  
      
  
      const liquidationQueue = await OrderedDoublyLinkedList.deploy();
      await liquidationQueue.waitForDeployment();
      console.log("Deployed RedemptionQueue to:", liquidationQueue.target);
  
  
  
      console.log("Setting addresses...");
      console.log("Setting StableBase address to SBDToken...");
      let tx= await sbdToken.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StabilityPool address to SBRToken...");
      tx = await sbrToken.setAddresses(stabilityPool.target);
      await tx.wait();
      console.log("Setting SBDToken, StableBaseCDP, and SBRToken addresses to StabilityPool...");
      tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, sbrToken.target);
      await tx.wait();
      console.log("Setting SBRToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
      tx = await sbrStaking.setAddresses(sbrToken.target, sbdToken.target, stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StableBaseCDP address to RedemptionQueue...");
      tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StableBaseCDP address to LiquidationQueue...");
      tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
      tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, sbrStaking.target, liquidationQueue.target, redemptionQueue.target);
      await tx.wait();
  
      return {
          sbdToken,
          sbrToken,
          stabilityPool,
          priceOracle,
          stableBaseCDP,
          sbrStaking,
          redemptionQueue,
          liquidationQueue
      }
  }

async function main() {

    const [deployer, marketAccount, ...addrs] = await ethers.getSigners();

    const env = new Environment();

    const contracts = await deployContracts();
    //console.log(contracts);

    // Initialize the Market agent
    const market = new Market(marketAccount, marketAccount.balance, contracts);
    env.addAgent(market);

    const tracker = new OfflineProtocolTracker(contracts, market, []);
    env.addAgent(tracker);

    // Initialize CDP agents with random collateral and debt values
    /*
    for (let i = 0; i < 10; i++) {
    const collateral = Math.random() * 100 + 10; // Collateral between 10 and 110
    const debt = Math.random() * 50 + 10; // Debt between 10 and 60
    const cdp = new CDP();
    env.addAgent(cdp);
    }
    */

    let addressIndex = 0;
    for (let i = 0; i < numBorrowers; i++) {
        const borrower = new Borrower(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        borrower.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(borrower);
        addressIndex++;
    }
    for (let i = 0; i < numBots; i++) {
        const bot = new Bot(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        bot.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(bot);
        addressIndex++;
    }
    for (let i = 0; i < numThirdpartyStablecoinHolders; i++) {
        const thirdpartyStablecoinHolder = new ThirdpartyStablecoinHolder(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        thirdpartyStablecoinHolder.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(thirdpartyStablecoinHolder);
        addressIndex++;
    }

    // Update each CDP based on the new collateral price
    const actors = env.getAgents()
    .filter(agent => agent instanceof Actor).map((agent) => agent);
    console.log(actors);
    tracker.actors = actors;

    // Main simulation loop
    for (let i = 0; i < 100; i++) {
        console.log(`--- Simulation Step ${i + 1} ---`);
        
        // Get the updated collateral price from the market
       await market.step();
        
        for (const actor of actors) {
            await actor.step();
        }
        
        console.log(); // Blank line for readability between steps
        await tracker.step();
    }
    console.log("Simulation completed without errors");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
