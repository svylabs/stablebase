const { ethers, hardhatArguments } = require("hardhat");

const deployedAddresses = {
    ethMainnet: {
        sbdToken: "",
        dfireToken: "",
        stabilityPool: "",
        priceOracle: "",
        stableBaseCDP: "",
        sbrStaking: "",
        redemptionQueue: "",
        liquidationQueue: ""
    },
    citreaTestnet: {
        sbdToken: "0x6b11C5A44A8f21C3cDAe84e6Bc48DbE6f366Ba04",
        dfireToken: "0x040a2bDFde4AA456A765ed367F7f77C5574282eD",
        stabilityPool: "0x901e951592B147968e7e4Dbf5792de408Ac0480e",
        priceOracle: "0x8E2A54197A9F89E26F85080B63E6D969eec3733a",
        stableBaseCDP: "0x108d105FFe07C9615939DeE88A4Fe2ECD62Acdc7",
        sbrStaking: "0x11dAA360461b8E66f0DF125497dc88e6d992bF36",
        redemptionQueue: "0x1F9E6cCad7C8870bB40a17EdDd43a75f4bF0E440",
        liquidationQueue: "0xfaD62505b37bc196d23C3396B35e0d006fa534e2"
    }
};

async function loadContracts(addresses) {
  // Get the deployer's wallet address
  const [user] = await ethers.getSigners();
  console.log("Loading contracts with the account:", user.address);

  // Display the deployer's balance
  const balance = await ethers.provider.getBalance(user.address);
  console.log("User balance:", balance);

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


    return {
        sbdToken,
        dfireToken,
        stabilityPool,
        priceOracle,
        stableBaseCDP,
        sbrStaking: dfireStaking,
        redemptionQueue,
        liquidationQueue
    }
}

async function test(user, contracts) {
    // Test the contracts...
    console.log("Testing contracts...");
    // Fetch the price from the price oracle
    const price = await contracts.priceOracle.lastGoodPrice();
    console.log("Price: ", price);
    // Open Safe
    const collAmount = ethers.parseEther("0.1");
    const safeId = BigInt(user.address);
    console.log(safeId);
    // Open Safe
    let tx = await contracts.stableBaseCDP.openSafe(safeId, collAmount, { value: collAmount });
    await tx.wait();
    // Get Safe
    const safe = await contracts.stableBaseCDP.safes(safeId);
    console.log("Created Safe: ", safe);
    // Borrow min debt is 2000 DFID
    const dfidAmount = ethers.parseUnits("3000", 18);
    tx = await contracts.stableBaseCDP.borrow(safeId, dfidAmount, BigInt(0), BigInt(0), BigInt(0));
    await tx.wait();
    // Get Safe
    const safe2 = await contracts.stableBaseCDP.safes(safeId);
    console.log("Borrowed Safe: ", safe2);

    // Repay
    const repayAmount = ethers.parseUnits("3000", 18);
    tx = await contracts.stableBaseCDP.repay(safeId, repayAmount, BigInt(0));
    await tx.wait();
    // Get Safe
    const safe3 = await contracts.stableBaseCDP.safes(safeId);
    console.log("Repay Safe: ", safe3);
    // Close Safe
    tx = await contracts.stableBaseCDP.closeSafe(safeId);
    await tx.wait();
    // Get Safe
    const safe4 = await contracts.stableBaseCDP.safes(safeId);
    console.log("Closed Safe: ", safe4);
}

async function main() {
  const contracts = await loadContracts(deployedAddresses.citreaTestnet);
  const [user] = await ethers.getSigners();
  await test(user, contracts);
}   

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error deploying contracts:", error);
    process.exit(1);
  });
