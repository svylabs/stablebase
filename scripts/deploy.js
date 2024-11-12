const { ethers } = require("hardhat");

async function main() {
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
    const stabilityPool = await StabilityPool.deploy(true);
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
    const sbrStaking = await SBRStaking.deploy(true);
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error deploying contracts:", error);
    process.exit(1);
  });
