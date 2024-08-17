const { expect } = require("chai");
const { ethers } = require("hardhat");
const utils = require("./utils");



describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, user, priceOracle, mockOracle;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy SBDToken
    const SBDToken = await ethers.getContractFactory("SBDToken");
    sbdToken = await SBDToken.deploy("SBD Token", "SBD");
    await sbdToken.waitForDeployment();

    // // Deploy mock oracle
    // const MockOracle = await ethers.getContractFactory("MockV3Aggregator");
    // mockOracle = await MockOracle.deploy(8, ethers.parseUnits("1000", 8)); // 8 decimal places, price 1000
    // await mockOracle.waitForDeployment();

    // // Deploy ChainlinkPriceOracle
    // const PriceConsumer = await ethers.getContractFactory("ChainlinkPriceOracle");
    // priceOracle = await PriceConsumer.deploy(mockOracle.address);
    // // priceOracle = await PriceConsumer.deploy(ethers.ZeroAddress);
    // await priceOracle.waitForDeployment();

    // Deploy StableBaseCDP with the price oracle address
    const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
    stableBaseCDP = await StableBaseCDPFactory.deploy(sbdToken.target);
    await stableBaseCDP.waitForDeployment();

    // Set the minter to StableBaseCDP contract
    await sbdToken.setMinter(stableBaseCDP.target);

    // Deploy a mock ERC20 token
    const MockToken = await ethers.getContractFactory("SBDToken");
    mockToken = await MockToken.deploy("Mock Token", "MKT");
    await mockToken.waitForDeployment();

    // Mint tokens to owner so that we can transfer them to user
    await mockToken.mint(owner.address, ethers.parseEther("1000"));

    // Transfer some tokens to user
    await mockToken.transfer(user.address, ethers.parseEther("100"));
  });

  it("Should mint SBD tokens", async function(){
    const depositAmount = ethers.parseEther("1");
    console.log(await stableBaseCDP.orderedReserveRatios());

    // Open a safe with ETH
    //await stableBaseCDP.connect(user).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });
    await stableBaseCDP.connect(user).openSafe(ethers.ZeroAddress, depositAmount,  { value: depositAmount });

    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [user.address, ethers.ZeroAddress]);
    const contractSnapshotBeforeBorrow = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safeId, { address: user.address, collateral: true });

    // first 4 bytes, rates
    // next 4-35 bytes: nearestSpot
    // next 36-67 byte: nearestSpot(optional)
    const _nearestSpotForRate = ethers.ZeroHash;

    const reserveRatioEnabled = 1;
    const reserveRatio = 500; // 5%
    const targetShieldingRate = 800; // 8%
    const targetShieldingRateEnabled = 1;
    // 1- reserve ratio, 5- reserve ratio value, 1- target shielding rate, 8- target shielding rate value 
    // targetShieldingRate(14 bits) | targetShieldingRateEnabled(2 bits) | reserveRatio(14 bits) | reserveRatioEnabled(2 bits)
    const _compressedRate = reserveRatioEnabled | (reserveRatio << 2) | (targetShieldingRateEnabled << 16) | (targetShieldingRate << 18); 
    console.log(_compressedRate.toString(16), _compressedRate.toString(2), _nearestSpotForRate);
    const borrowParams = ethers.solidityPacked(["uint32", "uint256", "uint256"], [BigInt(_compressedRate), BigInt(_nearestSpotForRate), BigInt(_nearestSpotForRate)]);
    console.log(borrowParams);
    const price = BigInt(1000);
    //const liquidationRatio = BigInt(110); // Ensure consistency with contract
    //const maxBorrowAmount = (depositAmount * price * BigInt(100)) / BigInt(liquidationRatio); // BigInt calculation

    // Adjust the borrow amount to be within the limit
    const borrowAmount = (depositAmount * price) / BigInt(2); // Borrow nearly half
    console.log("Borrow amount: ", borrowAmount);

    await stableBaseCDP.connect(user).borrowWithParams(ethers.ZeroAddress, borrowAmount, borrowParams);
    //const safeId = ethers.solidityPackedKeccak256(["address", "address"], [user.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);
    console.log(safe);
    const refShieldingRate = await stableBaseCDP.referenceShieldingRate();
    console.log(refShieldingRate);
    const contractSnapshotAfterBorrow = await utils.takeContractSnapshots(stableBaseCDP, sbdToken, mockToken, safeId, { address: user.address, collateral: true });
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

});