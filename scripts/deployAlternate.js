const { ethers, hardhatArguments } = require("hardhat");

const addresses= {
    sbdToken: "0x8b52c6a0ECDd3952E8F14F711D638fd2b4dE2529",
    dfireToken: "0x236636842f6c64e198e223058794bbBBBaaccDE9",
    stabilityPool: "0x590e59BabaFf67FB3f10AD9eF315242D2A17F8d0",
    priceOracle: "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De",
    stableBaseCDP: "0xaF026bf59B738bDc7FD8899a641D79a6d5cEb151",
    sbrStaking: "0x4D6BFeAca22bbC0884e8F17a0Aa5FDe7F565d0C2",
    redemptionQueue: "0x7944588320547E46ddD0b0816E76678C0C4cB8A1",
    liquidationQueue: "0x86644d53B0bD9032D16FEEE1f856767481a16884"
};

async function main() {
  // Get the deployer's wallet address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Display the deployer's balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", balance);

  
  const sbdToken = await ethers.getContractAt("SBDToken", addresses.sbdToken);
  //await sbdToken.waitForDeployment();
  console.log("Using SBDToken contract at:", sbdToken.target);

  const dfireToken = await ethers.getContractAt("DFIRToken", addresses.dfireToken);
  console.log("Using DFIREToken contract at:", dfireToken.target);

  const stabilityPool = await ethers.getContractAt("StabilityPool", addresses.stabilityPool);
  console.log("Using StabilityPool contract at:", stabilityPool.target);
  
  let priceOracle = await ethers.getContractAt("IPriceOracle", addresses.priceOracle);
  console.log("Using PriceOracle available at:", priceOracle.target);
  

  const stableBaseCDP = await ethers.getContractAt("StableBaseCDP", addresses.stableBaseCDP);
  console.log("Using StableBaseCDP contract at:", stableBaseCDP.target);

  const dfireStaking = await ethers.getContractAt("DFIRStaking", addresses.sbrStaking);
  console.log("Using DFIREStaking contract at:", dfireStaking.target);

  const redemptionQueue = await ethers.getContractAt("OrderedDoublyLinkedList", addresses.redemptionQueue);
  console.log("Using RedemptionQueue  contract at :", redemptionQueue.target);

  const liquidationQueue = await ethers.getContractAt("OrderedDoublyLinkedList", addresses.liquidationQueue);
  console.log("Using LiquidationQueue contract at:", liquidationQueue.target);

    console.log("Setting addresses...");
   /* console.log("Setting StableBase address to SBDToken...");
    let tx= await sbdToken.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StabilityPool address to DFIRToken...");
    tx = await dfirToken.setAddresses(stabilityPool.target);
    await tx.wait();*/
    console.log("Setting SBDToken, StableBaseCDP, and DFIRToken addresses to StabilityPool...");
    tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, dfireToken.target);
    await tx.wait();
    console.log("Setting DFIRToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
    tx = await dfireStaking.setAddresses(dfireToken.target, sbdToken.target, stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to RedemptionQueue...");
    tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to LiquidationQueue...");
    tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
    tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, dfireStaking.target, liquidationQueue.target, redemptionQueue.target);
    await tx.wait();

    return {
        sbdToken,
        dfirToken,
        stabilityPool,
        priceOracle,
        stableBaseCDP,
        sbrStaking: dfireStaking,
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
