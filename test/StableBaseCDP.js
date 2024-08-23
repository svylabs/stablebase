const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy SBDToken
    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // Deploy StableBaseCDP with the sbdToken address
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy(owner.address, await sbdToken.getAddress());
    await stableBaseCDP.waitForDeployment();

    // Set the minter to StableBaseCDP contract
    await sbdToken.setMinter(await stableBaseCDP.getAddress());

    // Deploy a mock ERC20 token
    const MockToken = await ethers.getContractFactory("SBDToken");
    mockToken = await MockToken.deploy("Mock Token", "MKT");
    await mockToken.waitForDeployment();

    // Mint tokens to owner so that we can transfer them to addr1
    await mockToken.mint(owner.address, ethers.parseEther("1000"));

    // Transfer some tokens to addr1
    await mockToken.transfer(addr1.address, ethers.parseEther("100"));
  });

  console.log("ethers:-> ", ethers);

  it('should open a new safe', async () => {
    const tokenAddress = await mockToken.getAddress();
    console.log("Mock Token Address:", tokenAddress);
    const amount = ethers.parseEther('1.0');
    const safeId = 1;

    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);

    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;

    const safe = await stableBaseCDP.safes(safeId);
    expect(safe.token).to.equal(tokenAddress);
    expect(safe.depositedAmount).to.equal(amount);
    expect(safe.borrowedAmount).to.equal(0);
  });

});
