async function main() {
    const StableBase = await ethers.getContractFactory("StableBaseCDP");
    const stableBase = await StableBase.deploy();
    await stableBase.deployed();
  
    console.log("StableBaseCDP deployed to:", stableBase.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  