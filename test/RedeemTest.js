const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");



describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, user, priceOracle, mockOracle;
  const safeId = 1;
  const price = BigInt(1000); // Price of the token

  beforeEach(async function () {
    [owner, borrower1, borrower2, borrower3, redeemer] = await ethers.getSigners();

    // Deploy SBDToken
    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // Deploy StableBaseCDP with the price oracle address
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    // stableBaseCDP = await StableBaseCDPFactory.deploy(sbdToken.target);
    stableBaseCDP = await StableBaseCDPFactory.deploy(await sbdToken.getAddress());
    await stableBaseCDP.waitForDeployment();

    // Set the minter to StableBaseCDP contract
    // await sbdToken.setMinter(stableBaseCDP.target);
    await sbdToken.setMinter(await stableBaseCDP.getAddress());

    // Deploy a mock ERC20 token
    const MockToken = await ethers.getContractFactory("SBDToken");
    mockToken = await MockToken.deploy("Mock Token", "MKT");
    await mockToken.waitForDeployment();

    // Mint tokens to owner so that we can transfer them to user
    await mockToken.mint(owner.address, ethers.parseEther("1000"));

    // Transfer some tokens to user
    await mockToken.transfer(borrower1.address, ethers.parseEther("100"));
    await mockToken.transfer(borrower2.address, ethers.parseEther("100"));
  });

  it("Redeem test", async function() {
    
    const safe1Params = {
        depositAmount: 1,
        reserveRatio: 5,
        targetShieldingRate: 8,
        borrowAmount: 50 // 50%
    };
    const safe2Params = {
        depositAmount: 2,
        shieldingRate: 1,
        borrowAmount: 50 // 50%
    };
    const system = {price: 1000, contracts: {stableBaseCDP, sbdToken, mockToken}};
    const safe1 = await utils.setupUserSafe(borrower1, safe1Params, system);
    const safe2 = await utils.setupUserSafe(borrower2, safe2Params, system);
    console.log(safe1, safe2);


  });

});