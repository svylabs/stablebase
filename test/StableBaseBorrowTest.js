const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");



describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, user, priceOracle, mockOracle;
  const safeId = 1;
  const price = BigInt(1000); // Price of the token

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

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
    await mockToken.transfer(user.address, ethers.parseEther("100"));
  });

  it("Borrow with reserve ratio enabled", async function(){
    const depositAmount = ethers.parseEther("1");
    console.log(await stableBaseCDP.orderedReserveRatios());
    console.log("hello");
    const safeId = ethers.toBigInt(ethers.solidityPackedKeccak256(["address", "address"], [user.address, ethers.ZeroAddress]));
    console.log("Safe ID: ", safeId);

    // Open a safe with ETH
    //await stableBaseCDP.connect(user).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });
    await stableBaseCDP.connect(user).openSafe(safeId, ethers.ZeroAddress, depositAmount,  { value: depositAmount });
    console.log("Safe opened");

    
    // first 4 bytes, rates
    // next 4-35 bytes: nearestSpot
    // next 36-67 byte: nearestSpot(optional)
    //const liquidationRatio = BigInt(110); // Ensure consistency with contract
    //const maxBorrowAmount = (depositAmount * price * BigInt(100)) / BigInt(liquidationRatio); // BigInt calculation
    // Adjust the borrow amount to be within the limit
    const borrowAmount = (depositAmount * price) / BigInt(2); // Borrow nearly half
    console.log("Borrow amount: ", borrowAmount);

    const {contractSnapshotBeforeBorrow, contractSnapshotAfterBorrow} = await utils.borrow({ stableBaseCDP, sbdToken, mockToken }, user, safeId, borrowAmount, { reserveRatio: 5, targetShieldingRate: 8 });
    
    console.log("Before borrow", contractSnapshotBeforeBorrow);
    console.log("After Borrow", contractSnapshotAfterBorrow);
    // Checks needed
    // 1. Check if the borrowed amount is correct
    expect(contractSnapshotAfterBorrow.safe.borrowedAmount).to.equal(borrowAmount);
    // 3. Check if the target shielding rate is added  to the list correctly
    expect(contractSnapshotAfterBorrow.targetShieldingRateList.value.value).to.equal(800);
    expect(contractSnapshotAfterBorrow.targetShieldingRateList.head).to.equal(safeId);
    expect(contractSnapshotAfterBorrow.targetShieldingRateList.tail).to.equal(safeId);

    const reserveRatioFromReservePoolStake = (contractSnapshotAfterBorrow.reservePool.stake * BigInt(10000) / contractSnapshotAfterBorrow.safe.borrowedAmount);
    // 4. Check if the reserve ratio is updated correctly
    expect(contractSnapshotAfterBorrow.reserveRatioList.value.value).to.equal(reserveRatioFromReservePoolStake);
    expect(contractSnapshotAfterBorrow.reserveRatioList.head).to.equal(safeId);
    expect(contractSnapshotAfterBorrow.reserveRatioList.tail).to.equal(safeId);

    // 5. Check if the tokens equivalent to reserve ratio is added to the reserve pool.
    expect(contractSnapshotAfterBorrow.reservePool.balance).to.equal(contractSnapshotBeforeBorrow.reservePool.balance + (borrowAmount * BigInt(5) / BigInt(100)));

    // 6. Check if the tokens are minted to the borrower's address
    expect(contractSnapshotAfterBorrow.user.sbd).to.equal(contractSnapshotBeforeBorrow.user.sbd + borrowAmount - contractSnapshotAfterBorrow.reservePool.stake);
    // 2. Check if the reference shielding rate is correct
    expect((contractSnapshotAfterBorrow.referenceShieldingRate.weightedSum  * BigInt(100)) / contractSnapshotAfterBorrow.referenceShieldingRate.totalWeight).to.equal(800 * 100);
    
    //expect(await sbdToken.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));
  });

  it("Borrow with shielding rate enabled", async function() {
    const depositAmount = ethers.parseEther("1");
    console.log(await stableBaseCDP.orderedReserveRatios());

    const safeId = ethers.toBigInt(ethers.solidityPackedKeccak256(["address", "address"], [user.address, ethers.ZeroAddress]));

    // Open a safe with ETH
    //await stableBaseCDP.connect(user).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });
    await stableBaseCDP.connect(user).openSafe(safeId, ethers.ZeroAddress, depositAmount,  { value: depositAmount });
    
    // first 4 bytes, rates
    // next 4-35 bytes: nearestSpot
    // next 36-67 byte: nearestSpot(optional)
    //const liquidationRatio = BigInt(110); // Ensure consistency with contract
    //const maxBorrowAmount = (depositAmount * price * BigInt(100)) / BigInt(liquidationRatio); // BigInt calculation
    const price = BigInt(1000); // Price of the token
    // Adjust the borrow amount to be within the limit
    const borrowAmount = (depositAmount * price) / BigInt(2); // Borrow nearly half
    console.log("Borrow amount: ", borrowAmount);

    const {contractSnapshotBeforeBorrow, contractSnapshotAfterBorrow} = await utils.borrow({ stableBaseCDP, sbdToken, mockToken }, user, safeId, borrowAmount, { shieldingRate: 0 });
    
    console.log("Before borrow", contractSnapshotBeforeBorrow);
    console.log("After Borrow", contractSnapshotAfterBorrow);
    // Checks needed
    // 1. Check if the borrowed amount is correct
    expect(contractSnapshotAfterBorrow.safe.borrowedAmount).to.equal(borrowAmount);
    // 3. Check if the target shielding rate is added  to the list correctly
    //const reserveRatioFromReservePoolStake = (contractSnapshotAfterBorrow.reservePool.stake * BigInt(10000) / contractSnapshotAfterBorrow.safe.borrowedAmount);
    // 4. Check if the reserve ratio is updated correctly
    expect(contractSnapshotAfterBorrow.reservePool.stake).to.equal(0);
    
    // 5. Check if the tokens equivalent to reserve ratio is added to the reserve pool.
    expect(contractSnapshotAfterBorrow.reservePool.balance).to.equal(contractSnapshotBeforeBorrow.reservePool.balance);

    // As the safe currently doesn't set any fee
    // 6. Check if the tokens are minted to the borrower's address
    expect(contractSnapshotAfterBorrow.user.sbd).to.equal(contractSnapshotBeforeBorrow.user.sbd + borrowAmount);
    // 2. Check if the reference shielding rate is correct
    ///expect((contractSnapshotAfterBorrow.referenceShieldingRate.weightedSum  * BigInt(100)) / contractSnapshotAfterBorrow.referenceShieldingRate.totalWeight).to.equal(800 * 100);
    console.log(contractSnapshotAfterBorrow.safe);
    //expect(await sbdToken.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));
  });

});