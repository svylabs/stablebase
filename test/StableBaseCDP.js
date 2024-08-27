const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, addr1;
  const safeId = 1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy SBDToken
    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // Deploy StableBaseCDP with the sbdToken address
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy(await sbdToken.getAddress());
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

    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);

    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;

    const safe = await stableBaseCDP.safes(safeId);
    expect(safe.token).to.equal(tokenAddress);
    expect(safe.depositedAmount).to.equal(amount);
    expect(safe.borrowedAmount).to.equal(0);
  });

  /*
  it('only owner can perform operations on Safe', async () => {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseEther('1.0');
  
    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);
  
    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;
  
    // Try to perform an operation as addr1
    await expect(stableBaseCDP.connect(addr1).borrow(safeId, ethers.parseEther('0.5'))).to.be.revertedWith('Unauthorized');
  });
  
  it('safe can be transferred through standard transfer calls for a NFT', async () => {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseEther('1.0');
  
    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);
  
    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;
  
    // Transfer the safe to addr1
    await expect(stableBaseCDP.connect(owner).transferFrom(owner.address, addr1.address, safeId)).to.not.be.reverted;
  
    // Check that addr1 is the new owner
    expect(await stableBaseCDP.ownerOf(safeId)).to.equal(addr1.address);
  });

  it('new owner can perform operations on the Safe', async () => {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseEther('1.0');
  
    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);
  
    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;
  
    // Transfer the safe to addr1
    await expect(stableBaseCDP.connect(owner).transferFrom(owner.address, addr1.address, safeId)).to.not.be.reverted;
  
    console.log('addr1 is the new owner:', await stableBaseCDP.ownerOf(safeId));
  
    try {
      await stableBaseCDP.connect(addr1).borrow(safeId, ethers.parseEther('0.5'));
    } catch (error) {
      console.error('Error:', error);
      console.log('Safe state:', await stableBaseCDP.safes(safeId));
      console.log('Owner:', await stableBaseCDP.ownerOf(safeId));
      throw error;
    }
  });
  
  it('old owner is not able to perform any operation', async () => {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseEther('1.0');
  
    // Ensure the StableBaseCDP is approved to spend the mock token
    await mockToken.connect(owner).approve(await stableBaseCDP.getAddress(), amount);
  
    await expect(stableBaseCDP.connect(owner).openSafe(safeId, tokenAddress, amount, { value: ethers.parseEther('1.0') })).to.not.be.reverted;
  
    // Transfer the safe to addr1
    await expect(stableBaseCDP.connect(owner).transferFrom(owner.address, addr1.address, safeId)).to.not.be.reverted;
  
    // Try to perform an operation as owner
    await expect(stableBaseCDP.connect(owner).borrow(safeId, ethers.parseEther('0.5'))).to.be.revertedWith('Unauthorized');
  });
  */

});
