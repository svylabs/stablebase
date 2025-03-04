const { ethers, hardhatArguments } = require("hardhat");


const previousDeployment = {
  ethMainnet: {
      dfidToken: "0x8b52c6a0ECDd3952E8F14F711D638fd2b4dE2529",
      dfireToken: "0x236636842f6c64e198e223058794bbBBBaaccDE9",
      stabilityPool: "0x590e59BabaFf67FB3f10AD9eF315242D2A17F8d0",
      priceOracle: "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De",
      stableBaseCDP: "0xaF026bf59B738bDc7FD8899a641D79a6d5cEb151",
      sbrStaking: "0x4D6BFeAca22bbC0884e8F17a0Aa5FDe7F565d0C2",
      redemptionQueue: "0x7944588320547E46ddD0b0816E76678C0C4cB8A1",
      liquidationQueue: "0x86644d53B0bD9032D16FEEE1f856767481a16884"
  },
  citreaTestnet: {
      dfidToken: "0x6b11C5A44A8f21C3cDAe84e6Bc48DbE6f366Ba04",
      dfireToken: "0x040a2bDFde4AA456A765ed367F7f77C5574282eD",
      stabilityPool: "0x901e951592B147968e7e4Dbf5792de408Ac0480e",
      priceOracle: "0x8E2A54197A9F89E26F85080B63E6D969eec3733a",
      stableBaseCDP: "0x108d105FFe07C9615939DeE88A4Fe2ECD62Acdc7",
      sbrStaking: "0x11dAA360461b8E66f0DF125497dc88e6d992bF36",
      redemptionQueue: "0x1F9E6cCad7C8870bB40a17EdDd43a75f4bF0E440",
      liquidationQueue: "0xfaD62505b37bc196d23C3396B35e0d006fa534e2"
  }
};

const deployedAddresses = {
    ethMainnet: {
        dfidToken: "0xe52ffDc03CE2EFd8ca031815d4d86697819D99A0",
        dfireToken: "0xf1143634AF5954a2A6e6d553465fd08a4a512B83",
        stabilityPool: "0x6e1DBa1CD29D612DF5b7e90E915F221Ef0a217A8",
        priceOracle: "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De",
        stableBaseCDP: "0x028B4A08f503F1900fe1F05C4c1eAf7539BC49d7",
        sbrStaking: "0x3F0bBbc6B9395Af56b7dFadEfA7E9d0bF282F5C1",
        redemptionQueue: "0x01Ea8E68732C99fB2E6F0056DB637553907BE1a0",
        liquidationQueue: "0xA2Aa38FBB5EFC31023E8C4fA91A42464483d7Ab9"
    },
    citreaTestnet: {
        dfidToken: "0xfd48d551a10E45175089bDF4C7f839006E4E2502",
        dfireToken: "0xd41F09961e9124Ec517341f5C3c670EA6FEa64c1",
        stabilityPool: "0x5101dD14fA7262103c06B259a22Ea8Ab6d99734B",
        priceOracle: "0x7a831F59520783A89F27Bbeb31CcdF8c8a6d588D",
        stableBaseCDP: "0x1D98B0aBf89B6F9c150FAD226B997466fd34e9CA",
        sbrStaking: "0x3aa2A66b031F7e324E32fE83016203945797995e",
        redemptionQueue: "0x075809C6482fb01c88C9a2bA92f46593Cb3637EB",
        liquidationQueue: "0xeB57fb82E86e1b86A09Fc8eaE454fcd239Dd3bde"
    }
};

async function loadContracts(addresses) {
  // Get the deployer's wallet address
  const [user] = await ethers.getSigners();
  console.log("Loading contracts with the account:", user.address);

  // Display the deployer's balance
  const balance = await ethers.provider.getBalance(user.address);
  console.log("User balance:", balance);

    const sbdToken = await ethers.getContractAt("DFIDToken", addresses.dfidToken);
    //await sbdToken.waitForDeployment();
    console.log("Using SBDToken contract at:", sbdToken.target);
  
    const dfireToken = await ethers.getContractAt("DFIREToken", addresses.dfireToken);
    console.log("Using DFIREToken contract at:", dfireToken.target);

    const stabilityPool = await ethers.getContractAt("StabilityPool", addresses.stabilityPool);
    console.log("Using StabilityPool contract at:", stabilityPool.target);
    
    let priceOracle = await ethers.getContractAt("IPriceOracle", addresses.priceOracle);
    console.log("Using PriceOracle available at:", priceOracle.target);
    

    const stableBaseCDP = await ethers.getContractAt("StableBaseCDP", addresses.stableBaseCDP);
    console.log("Using StableBaseCDP contract at:", stableBaseCDP.target);

    const dfireStaking = await ethers.getContractAt("DFIREStaking", addresses.sbrStaking);
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
