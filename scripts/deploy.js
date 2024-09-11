async function main() {
    const Gravity = await ethers.getContractFactory("Gravity");
    const gravity = await Gravity.deploy();
    await gravity.deployed();

    //     // Compile the contract
    //   await hre.run('compile');

    //   // Get the contract factory
    //   const Gravity = await hre.ethers.getContractFactory("Gravity");

    //   // Deploy the contract
    //   const gravity = await Gravity.deploy();

    console.log("Gravity deployed to:", gravity.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
