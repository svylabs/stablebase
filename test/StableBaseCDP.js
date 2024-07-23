const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StableBaseCDP", function () {
  let stableBaseCDP, token, owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy();
    await stableBaseCDP.waitForDeployment(); // wait for deployment to complete

    // Deploy ERC20 token for testing
    const ERC20Token = await ethers.getContractFactory("ERC20Token");
    token = await ERC20Token.deploy("Mock Token", "MKT", ethers.parseEther("1000"));
    await token.waitForDeployment(); // wait for deployment to complete

    // Transfer some tokens to addr1
    await token.transfer(addr1.address, ethers.parseEther("100"));
  });

  console.log("ethers:-> ", ethers);

  // Test case for opening a new safe with ETH
  it("should open a new safe with ETH", async function () {
    const depositAmount = ethers.parseEther("1");
    const reserveRatio = 100;

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.token).to.equal(ethers.ZeroAddress);
    expect(safe.depositedAmount).to.equal(depositAmount);
    expect(safe.reserveRatio).to.equal(reserveRatio);
  });

  // Test case for opening a new safe with ERC20 token
  it("should open a new safe with ERC20 token", async function () {
    const depositAmount = ethers.parseEther("100");
    const reserveRatio = 100;

    // Approve the token transfer and open a safe with the ERC20 token
    await token.connect(addr1).approve(stableBaseCDP.target, depositAmount); // approve token transfer
    await stableBaseCDP.connect(addr1).openSafe(token.target, depositAmount, reserveRatio); // open safe

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, token.target]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.token).to.equal(token.target);
    expect(safe.depositedAmount).to.equal(depositAmount);
    expect(safe.reserveRatio).to.equal(reserveRatio);
  });

  // Test case for closing a safe and returning the collateral
  it("should close a safe and return the collateral", async function () {
    const depositAmount = ethers.parseEther("1");
    const reserveRatio = 100;

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });

    // Compute the safe ID
    const safeId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [addr1.address, ethers.ZeroAddress]));
    await stableBaseCDP.connect(addr1).closeSafe(ethers.ZeroAddress);

    // Check if the safe has been closed (deposited amount should be 0)
    const safe = await stableBaseCDP.safes(safeId);
    expect(safe.depositedAmount).to.equal(0);
    expect(safe.borrowedAmount).to.equal(0);
  });
});