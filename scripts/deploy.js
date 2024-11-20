const { ethers, hardhatArguments } = require("hardhat");

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
  
    const DFIRToken = await ethers.getContractFactory("DFIRToken");
    const dfirToken = await DFIRToken.deploy();
    await dfirToken.waitForDeployment();
    console.log("Deployed DFIRToken to:", dfirToken.target);

    const StabilityPool = await ethers.getContractFactory("StabilityPool");
    const stabilityPool = await StabilityPool.deploy(true);
    await stabilityPool.waitForDeployment();
    console.log("Deployed StabilityPool to:", stabilityPool.target);
    
    let PriceOracle, priceOracle;
    if (hardhatArguments.network === "eth_mainnet") {
      // Use existing price oracle deployed on mainnet
      priceOracle = await ethers.getContractAt("IPriceFeed", "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De");
    } else if (hardhatArguments.network === "sepolia_network") {
      PriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      priceOracle = await PriceOracle.deploy();
      await priceOracle.waitForDeployment();
    } else {
      PriceOracle = await ethers.getContractFactory("MockPriceOracle");
      priceOracle = await PriceOracle.deploy();
      await priceOracle.waitForDeployment();
    }
    console.log("Using PriceOracle available at:", priceOracle.target);
    

    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    const stableBaseCDP = await StableBaseCDPFactory.deploy();
    await stableBaseCDP.waitForDeployment();
    console.log("Deployed StableBaseCDP to:", stableBaseCDP.target);

    const DFIRStaking = await ethers.getContractFactory("DFIRStaking");
    const dfirStaking = await DFIRStaking.deploy(true);
    await dfirStaking.waitForDeployment();
    console.log("Deployed DFIRStaking to:", dfirStaking.target);

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
    console.log("Setting StabilityPool address to DFIRToken...");
    tx = await dfirToken.setAddresses(stabilityPool.target);
    await tx.wait();
    console.log("Setting SBDToken, StableBaseCDP, and DFIRToken addresses to StabilityPool...");
    tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, dfirToken.target);
    await tx.wait();
    console.log("Setting DFIRToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
    tx = await dfirStaking.setAddresses(dfirToken.target, sbdToken.target, stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to RedemptionQueue...");
    tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to LiquidationQueue...");
    tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
    tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, dfirStaking.target, liquidationQueue.target, redemptionQueue.target);
    await tx.wait();

    return {
        sbdToken,
        dfirToken,
        stabilityPool,
        priceOracle,
        stableBaseCDP,
        sbrStaking: dfirStaking,
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
