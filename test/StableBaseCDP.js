const { expect } = require("chai");
const { ethers } = require("hardhat");
// const ethers = require("hardhat");

describe("StableBaseCDP", function () {
  let stableBaseCDP, owner, addr1;

  // Deploys the contract before each test
  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy();
    // await stableBaseCDP.deployed();
    await stableBaseCDP.waitForDeployment();
  });

  // Test case for opening a new safe with ETH
  it("should open a new safe with ETH", async function () {
    const depositAmount = ethers.parseEther("1"); // Amount of ETH to deposit
    const reserveRatio = 100; // Reserve ratio for the safe
    console.log("ethers:-> ", ethers);

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });

    // Compute the safe ID
    const safeId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([ "address", "address" ], [ addr1.address, ethers.ZeroAddress ]));
    const safe = await stableBaseCDP.safes(safeId);
    console.log("safe:-> ", safe);
    console.log("depositAmount:->", depositAmount);
    console.log("safe.depositedAmount:->", safe.depositedAmount);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.depositedAmount).to.equal(depositAmount);
    expect(safe.reserveRatio).to.equal(reserveRatio);
  });

  // Test case for opening a new safe with ERC20 token
  it("should open a new safe with ERC20 token", async function () {
    const ERC20Token = await ethers.getContractFactory("ERC20Token");
    const token = await ERC20Token.deploy("Mock Token", "MKT", ethers.parseEther("1000"));
    await token.waitForDeployment(); // Await deployment

    const depositAmount = ethers.parseEther("100"); // Amount of ERC20 token to deposit
    const reserveRatio = 100; // Reserve ratio for the safe

    // Approve the token transfer and open a safe with the ERC20 token
    console.log("depositAmount:-> ", depositAmount);
    await token.connect(addr1).approve(stableBaseCDP.address, depositAmount);
    await stableBaseCDP.connect(addr1).openSafe(token.address, depositAmount, reserveRatio);

    // Compute the safe ID
    const safeId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([ "address", "address" ], [ addr1.address, token.address ]));
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.depositedAmount).to.equal(depositAmount);
    expect(safe.reserveRatio).to.equal(reserveRatio);
  });

  // Test case for closing a safe and returning the collateral
  it("should close a safe and return the collateral", async function () {
    const depositAmount = ethers.parseEther("1"); // Amount of ETH to deposit
    const reserveRatio = 100; // Reserve ratio for the safe

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });

    // Compute the safe ID
    const safeId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([ "address", "address" ], [ addr1.address, ethers.ZeroAddress ]));
    await stableBaseCDP.connect(addr1).closeSafe(safeId);

    // Check if the safe has been closed (deposited amount should be 0)
    const safe = await stableBaseCDP.safes(safeId);
    expect(safe.depositedAmount).to.equal(0);
    expect(safe.borrowedAmount).to.equal(0);
  });
});
