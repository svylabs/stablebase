const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StableBaseCDP", function () {
  let stableBaseCDP, sbdToken, mockToken, owner, addr1, priceOracle, mockOracle;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

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

    // Mint tokens to owner so that we can transfer them to addr1
    await mockToken.mint(owner.address, ethers.parseEther("1000"));

    // Transfer some tokens to addr1
    await mockToken.transfer(addr1.address, ethers.parseEther("100"));
  });

  console.log("ethers:-> ", ethers);

  // Test case for opening a new safe with ETH
  it("should open a new safe with ETH", async function () {
    const depositAmount = ethers.parseEther("1");

    // Open a safe with ETH
    //await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, reserveRatio, { value: depositAmount });
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount,  { value: depositAmount });

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.token).to.equal(ethers.ZeroAddress);
    expect(safe.depositedAmount).to.equal(depositAmount);
  });

  // Test case for opening a new safe with ERC20 token
  it("should open a new safe with ERC20 token", async function () {
    const depositAmount = ethers.parseEther("100");

    // Approve the token transfer and open a safe with the ERC20 token
    await mockToken.connect(addr1).approve(stableBaseCDP.target, depositAmount); // approve token transfer
    await stableBaseCDP.connect(addr1).openSafe(mockToken.target, depositAmount); // open safe

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, mockToken.target]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct deposited amount and reserve ratio
    expect(safe.token).to.equal(mockToken.target);
    expect(safe.depositedAmount).to.equal(depositAmount);
  });

  // Test case for borrowing against the collateral in a safe
  it("should allow borrowing SBD tokens against the collateral and return the borrowed amount", async function () {
    const depositAmount = ethers.parseEther("1");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount,  { value: depositAmount });

    // Calculate the maximum borrowable amount based on the dummy price and liquidation ratio
    const price = BigInt(1000); // Dummy price from getPriceFromOracle
    // console.log("priceOracle:-> ", priceOracle);
    // const price = await priceOracle.getPrice();
    // console.log("price:-> ", price);
    const liquidationRatio = BigInt(110); // Ensure consistency with contract
    const maxBorrowAmount = (depositAmount * price * BigInt(100)) / liquidationRatio; // BigInt calculation

    // Adjust the borrow amount to be within the limit
    const borrowAmount = maxBorrowAmount - BigInt(1); // Slightly less than max borrowable amount

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the safe has the correct borrowed amount
    expect(safe.borrowedAmount).to.equal(borrowAmount);

    // Check if the SBD tokens have been minted to the borrower
    const sbdBalance = await sbdToken.balanceOf(addr1.address);
    expect(sbdBalance).to.equal(borrowAmount);
  });

  // Test case for repaying borrowed amount with ETH
  it("should repay borrowed amount with ETH", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.5");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Check initial SBD balance
    const initialSBDTokenBalance = await sbdToken.balanceOf(addr1.address);

    // Repay borrowed amount
    await sbdToken.connect(addr1).approve(stableBaseCDP.target, borrowAmount);
    await stableBaseCDP.connect(addr1).repay(ethers.ZeroAddress, borrowAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the borrowed amount is repaid
    expect(safe.borrowedAmount).to.equal(0);

    // Check if the SBD tokens have been burned
    const finalSBDTokenBalance = await sbdToken.balanceOf(addr1.address);
    expect(finalSBDTokenBalance).to.equal(initialSBDTokenBalance - borrowAmount);
  });

  // Test case for repaying borrowed amount with ETH and checking ETH balances
  it("should repay borrowed amount with ETH and check ETH balances", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.5");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Check initial ETH balance
    const initialETHBalance = await ethers.provider.getBalance(addr1.address);
    // console.log("initialETHBalance;->", initialETHBalance);

    // Approve and repay borrowed amount with ETH
    await sbdToken.connect(addr1).approve(stableBaseCDP.target, borrowAmount);
    await stableBaseCDP.connect(addr1).repay(ethers.ZeroAddress, borrowAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the borrowed amount is repaid
    expect(safe.borrowedAmount).to.equal(0);

    // Check if the ETH balance is reduced correctly
    const finalETHBalance = await ethers.provider.getBalance(addr1.address);
    expect(finalETHBalance).to.be.closeTo(initialETHBalance, ethers.parseEther("0.01")); // Allow for gas cost differences
  });


  // Test case for repaying borrowed amount with ERC20 token
  it("should repay borrowed amount with ERC20 tokens", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.5");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Check initial balances
    const initialSBDTokenBalance = await sbdToken.balanceOf(addr1.address);

    // Convert initial balance to BigNumber using parseUnits if necessary
    const initialSBDTokenBalanceBN = ethers.parseUnits(initialSBDTokenBalance.toString(), 18);

    // Repay borrowed amount with tokens
    await sbdToken.connect(addr1).approve(stableBaseCDP.target, borrowAmount);
    await stableBaseCDP.connect(addr1).repay(ethers.ZeroAddress, borrowAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the borrowed amount is repaid
    expect(safe.borrowedAmount).to.equal(0);

    // Check if the SBD tokens have been burned
    const finalSBDTokenBalance = await sbdToken.balanceOf(addr1.address);

    // Convert final balance to BigNumber using parseUnits
    const finalSBDTokenBalanceBN = ethers.parseUnits(finalSBDTokenBalance.toString(), 18);
    const borrowAmountBN = ethers.parseUnits(borrowAmount.toString(), 18);

    // Verify the balance after repayment
    expect(finalSBDTokenBalanceBN).to.equal(initialSBDTokenBalanceBN - borrowAmountBN);
  });


  // Test case for withdrawing collateral successfully
  it("should withdraw collateral successfully", async function () {
    const depositAmount = ethers.parseEther("1");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount,  { value: depositAmount });

    // Get the balance of addr1 before withdrawal
    const balanceBeforeWithdrawal = await ethers.provider.getBalance(addr1.address);

    // Withdraw collateral
    await stableBaseCDP.connect(addr1).withdrawCollateral(ethers.ZeroAddress, depositAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the collateral is withdrawn
    expect(safe.depositedAmount).to.equal(0);

    // Check if ETH has been refunded to the address
    const balanceAfterWithdrawal = await ethers.provider.getBalance(addr1.address);
    expect(balanceAfterWithdrawal).to.be.gt(balanceBeforeWithdrawal);
  });

  it("should redeem collateral", async function () {
    const depositAmount = ethers.parseEther("1"); // 1 ETH
    const borrowAmount = ethers.parseEther("0.5"); // Borrow 0.5 SBD
    const redeemAmount = ethers.parseEther("0.5"); // Redeem 0.5 SBD worth of collateral

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Redeem collateral
    await stableBaseCDP.connect(addr1).redeem(redeemAmount);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Calculate the expected remaining collateral after redemption
    const price = BigInt(1000); // Dummy price from getPriceFromOracle
    const liquidationRatio = BigInt(110);
    const expectedCollateralReduction = (redeemAmount * liquidationRatio) / (price * BigInt(100));

    // Check if the borrowed amount is reduced correctly
    expect(safe.borrowedAmount).to.equal(borrowAmount - redeemAmount);

    // Check if the deposited amount is reduced correctly
    expect(safe.depositedAmount).to.be.closeTo(depositAmount - expectedCollateralReduction, 1); // Using closeTo for precision differences
  });

  // Test case for closing a safe and returning collateral
  it("should close a safe and return collateral", async function () {
    const depositAmount = ethers.parseEther("1");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Close the safe
    await stableBaseCDP.connect(addr1).closeSafe(ethers.ZeroAddress);

    // Compute the safe ID
    const safeId = ethers.solidityPackedKeccak256(["address", "address"], [addr1.address, ethers.ZeroAddress]);
    const safe = await stableBaseCDP.safes(safeId);

    // Check if the collateral is returned and the safe is closed
    expect(safe.depositedAmount).to.equal(0);
    expect(safe.borrowedAmount).to.equal(0);
  });

  // Test case for failing to withdraw more collateral than deposited
  it("should fail to withdraw more collateral than deposited", async function () {
    const depositAmount = ethers.parseEther("1");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Attempt to withdraw more collateral than deposited
    await expect(
      stableBaseCDP.connect(addr1).withdrawCollateral(ethers.ZeroAddress, ethers.parseEther("2"))
    ).to.be.revertedWith("Insufficient collateral");
  });

  // Test case for failing to repay more than borrowed amount
  it("should fail to repay more than borrowed amount", async function () {
    const depositAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.5");
    const excessiveRepayAmount = ethers.parseEther("1");

    // Open a safe with ETH
    await stableBaseCDP.connect(addr1).openSafe(ethers.ZeroAddress, depositAmount, { value: depositAmount });

    // Borrow SBD tokens
    await stableBaseCDP.connect(addr1).borrow(ethers.ZeroAddress, borrowAmount);

    // Approve the repayment amount
    await sbdToken.connect(addr1).approve(stableBaseCDP.target, excessiveRepayAmount);

    // Ensure that the repayment fails due to excessive repayment amount
    await expect(
      stableBaseCDP.connect(addr1).repay(ethers.ZeroAddress, excessiveRepayAmount)
    ).to.be.revertedWith("Repayment amount exceeds borrowed amount");
  });

});