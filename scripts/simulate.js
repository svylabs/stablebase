const { Environment, Agent } = require("flocc");
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require("hardhat");
const { deployContract } = require("@nomicfoundation/hardhat-ethers/types");

class Borrower extends Agent {
    constructor(account, initialBalance, contracts) {
        super();
        this.account = account;
        this.contracts = contracts;
        this.ethBalance = initialBalance;
        this.sbdBalance = 0;
        this.sbrBalance = 0;
        this.safe = {
            collateral: 0,
            debt: 0
        }
        this.stabilityPool = {

        }
        this.sbrStaking = {

        }
    }

    async openSafe() {

    }

    async borrow() {

    }

    async repay() {

    }

    async closeSafe() {

    }

    async withdrawCollateral() {

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

    }
}

class Bot extends Agent {
    constructor(account, initialBalance, contracts) {
        super();
        this.ethBalance = initialBalance;
        this.account = account;
        this.contracts = contracts;
        this.sbdBalance = 0;
        this.sbrBalance = 0;
    }
    async liquidate() {

    }
    async redeem() {

    }
    async step() {

    }
}

class ThirdpartyStablecoinHolder extends Agent {
    constructor(account, initialBalance, contracts) {
        super();
        this.account = account;
        this.contracts = contracts;
        this.ethBalance = initialBalance;
        this.sbdBalance = 0;
        this.sbrBalance = 0;
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
    constructor(account, initialBalance, contracts) {
      super();
      this.contracts = contracts;
      this.account = account;
      this.ethBalance = initialBalance;
      console.log("Market initial balance: ", this.ethBalance);
      this.collateralPrice = 3000; // Starting price for collateral (e.g., ETH)
      this.sbdPrice = 1;
    }

    async buyETH(amount, buyer) {
        if (this.ethBalance < amount) {
            return false;
        }
        this.ethBalance -= amount;
        this.sbdBalance += amount;
        this.collateralPrice = this.collateralPrice * (1 + Math.random() * 0.02); // ±4% fluctuation
        this.sbdPrice = this.sbdPrice * (1 - Math.random() * 0.01); // ±4% fluctuation
        const tx = await account.sendTransaction({
            to: accounts[i + 1].address,
            value: amount // Send 1 ETH
          });
        await tx.wait();
        return true;
    }

    async buySBD(amount, buyer) {
        if (this.sbdBalance < amount) {
            return false;
        }
        this.sbdPrice = this.sbdPrice * (1 + Math.random() * 0.01); // ±4% fluctuation
        this.collateralPrice = this.collateralPrice * (1 - Math.random() * 0.02); // ±4% fluctuation
        this.ethBalance += amount;
        this.sbdBalance -= amount;
        const tx = await this.contracts.sbdToken.connect(this.account).tranfser(buyer.address, amount);
        await tx.wait();
        return true;
    }
  
    async step() {
       // Do nothing
    }
  }
  
  

// Stability Pool agent to collect fees and distribute rewards
class StabilityPool extends Agent {
  constructor() {
    super();
    this.stakedSBD = 0; // Amount of stablecoin staked
    this.collateralGains = 0; // Collateral gains from liquidations
  }

  // Method to add fees from CDP top-ups
  addFees(fee) {
    this.stakedSBD += fee * 0.9; // 90% goes to the Stability Pool
    console.log(`Stability Pool staked SBD: ${this.stakedSBD.toFixed(2)}`);
  }
}

// CDP agent representing a collateralized debt position
class OfflineProtocolTracker extends Agent {
  constructor(contracts) {
    super();
    this.contracts = contracts;
    this.borrowers = [];
    this.totalCollateral = 0; // Collateral value
    this.totalDebt = 0; // Debt in stablecoin (SBD)
  }

  async addBorrower(borrowerAgent) {
    this.borrowers.push(borrowerAgent);
  }

  async removeBorrower(borrowerAgent) {
    this.borrowers = this.borrowers.filter(borrower => borrower.id !== borrowerAgent.id);
  }

  async distributeShieldingFee() {

  }

  async distributeCollateralGains() {

  }

  async distributeLiquidationFee() {

  }

  async distributeRedemptionFee() {

  }

  step(collateralPrice) {
    //this.checkForLiquidation(collateralPrice);
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
    console.log(contracts);

    // Initialize the Market agent
    const market = new Market(marketAccount, marketAccount.balance, contracts);
    env.addAgent(market);

    // Initialize CDP agents with random collateral and debt values
    /*
    for (let i = 0; i < 10; i++) {
    const collateral = Math.random() * 100 + 10; // Collateral between 10 and 110
    const debt = Math.random() * 50 + 10; // Debt between 10 and 60
    const cdp = new CDP();
    env.addAgent(cdp);
    }
    */

    // Main simulation loop
    for (let i = 0; i < 100; i++) {
        console.log(`--- Simulation Step ${i + 1} ---`);
        
        // Get the updated collateral price from the market
       await market.step();
        
        // Update each CDP based on the new collateral price
        /*
        env.getAgents()
            .filter(agent => agent instanceof CDP)
            .forEach(cdp => cdp.step(collateralPrice));
        */
        console.log(); // Blank line for readability between steps
    }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
