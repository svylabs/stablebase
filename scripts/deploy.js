const { ethers, hardhatArguments } = require("hardhat");

async function main() {
  // Get the deployer's wallet address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Display the deployer's balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", balance);

  let PriceOracle, priceOracle;
    if (hardhatArguments.network === "eth_mainnet") {
      // Use existing price oracle deployed on mainnet
      priceOracle = await ethers.getContractAt("IPriceOracle", "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De");
      console.log("Accessing priceOracle: ", await priceOracle.lastGoodPrice());
    } else if (hardhatArguments.network === "sepolia_network") {
      PriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      priceOracle = await PriceOracle.deploy(BigInt(11155111));
      await priceOracle.waitForDeployment();
    } else {
      PriceOracle = await ethers.getContractFactory("MockPriceOracle");
      priceOracle = await PriceOracle.deploy();
      await priceOracle.waitForDeployment();
    }
    console.log("Using PriceOracle available at:", priceOracle.target);

  const SBDToken = await ethers.getContractFactory("FUSDToken");
    const sbdToken = await SBDToken.deploy();
    await sbdToken.waitForDeployment();
    console.log("Deployed FUSDToken to:", sbdToken.target);

    const FREEToken = await ethers.getContractFactory("FREEToken");
    const freeToken = await FREEToken.deploy();
    await freeToken.waitForDeployment();
    console.log("Deployed FREEToken to:", freeToken.target);

    const StabilityPool = await ethers.getContractFactory("StabilityPool");
    const stabilityPool = await StabilityPool.deploy(true);
    await stabilityPool.waitForDeployment();
    console.log("Deployed StabilityPool to:", stabilityPool.target);

    

    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    const stableBaseCDP = await StableBaseCDPFactory.deploy();
    await stableBaseCDP.waitForDeployment();
    console.log("Deployed StableBaseCDP to:", stableBaseCDP.target);

    const FREEStaking = await ethers.getContractFactory("FREEStaking");
    const freeStaking = await FREEStaking.deploy(true);
    await freeStaking.waitForDeployment();
    console.log("Deployed FREEStaking to:", freeStaking.target);

    const OrderedDoublyLinkedList = await ethers.getContractFactory("OrderedDoublyLinkedList");
    const redemptionQueue = await OrderedDoublyLinkedList.deploy();
    await redemptionQueue.waitForDeployment();
    console.log("Deployed RedemptionQueue to:", redemptionQueue.target);

    

    const liquidationQueue = await OrderedDoublyLinkedList.deploy();
    await liquidationQueue.waitForDeployment();
    console.log("Deployed LiquidationQueue to:", liquidationQueue.target);



    console.log("Setting addresses...");
    console.log("Setting StableBase address to SBDToken...");
    let tx= await sbdToken.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StabilityPool address to FREEToken...");
    tx = await freeToken.setAddresses(stabilityPool.target);
    await tx.wait();
    console.log("Setting SBDToken, StableBaseCDP, and FREEToken addresses to StabilityPool...");
    tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, freeToken.target);
    await tx.wait();
    console.log("Setting FREEToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
    tx = await freeStaking.setAddresses(freeToken.target, sbdToken.target, stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to RedemptionQueue...");
    tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to LiquidationQueue...");
    tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
    tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, freeStaking.target, liquidationQueue.target, redemptionQueue.target);
    await tx.wait();

    return {
        sbdToken,
        freeToken,
        stabilityPool,
        priceOracle,
        stableBaseCDP,
        sbrStaking: freeStaking,
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
