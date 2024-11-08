const { Environment, Agent } = require("flocc");

class Borrower extends Agent {
    constructor(account, initialBalance) {
        super();
        this.ethBalance = initialBalance;
        this.sbdBalance = 0;
        this.sbrBalance = 0;
        this.safe = {
            collateral: 0,
            debt: 0
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
    constructor(account, initialBalance) {
        super();
        this.ethBalance = initialBalance;
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
    constructor(account, initialBalance) {
        super();
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
    constructor() {
      super();
      this.collateralPrice = 3000; // Starting price for collateral (e.g., ETH)
      this.sbdPrice = 1;
    }
  
    // Method to fluctuate collateral price
    async fluctuatePrice() {
      this.collateralPrice *= (0.98 + Math.random() * 0.04); // ±2% fluctuation
    }
  
    async step() {
      await this.fluctuatePrice();
      console.log(`Market collateral price updated to: ${this.collateralPrice.toFixed(2)}`);
      return this.collateralPrice;
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
class Protocol extends Agent {
  constructor() {
    super();
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

  // Top-up fee method to prevent redemption
  topUpFee(amount) {
    this.stabilityPoolContribution += amount;
    this.redemptionQueuePriority += amount / this.debt;
    this.stabilityPool.addFees(amount);
  }

  // Method to check if this CDP is below the liquidation threshold
  checkForLiquidation(collateralPrice) {
    this.collateralizationRatio = (this.collateral * collateralPrice) / this.debt;
    if (this.collateralizationRatio < 1.1) {
      console.log(`Liquidating CDP with collateral: ${this.collateral}, debt: ${this.debt}`);
      this.liquidate();
    }
  }

  // Liquidate this CDP and distribute its collateral to the Stability Pool
  liquidate() {
    this.stabilityPool.addFees(this.collateral * 0.9); // Distribute 90% to the Stability Pool
    this.collateral = 0;
    this.debt = 0;
  }

  step(collateralPrice) {
    this.checkForLiquidation(collateralPrice);
  }
}

// Set up the environment
const env = new Environment();

// Initialize the Stability Pool
const stabilityPool = new StabilityPool();
env.addAgent(stabilityPool);

// Initialize the Market agent
const market = new Market();
env.addAgent(market);

// Initialize CDP agents with random collateral and debt values
for (let i = 0; i < 10; i++) {
  const collateral = Math.random() * 100 + 10; // Collateral between 10 and 110
  const debt = Math.random() * 50 + 10; // Debt between 10 and 60
  const cdp = new CDP();
  env.addAgent(cdp);
}

// Main simulation loop
for (let i = 0; i < 100; i++) {
  console.log(`--- Simulation Step ${i + 1} ---`);
  
  // Get the updated collateral price from the market
  const collateralPrice = await market.step();
  
  // Update each CDP based on the new collateral price
  env.getAgents()
    .filter(agent => agent instanceof CDP)
    .forEach(cdp => cdp.step(collateralPrice));
  
  console.log(); // Blank line for readability between steps
}
