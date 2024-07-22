const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MathTest", function () {
    this.beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const MathTestFactory = await ethers.getContractFactory("TestMath");
        mathTest = await MathTestFactory.deploy();
        await mathTest.waitForDeployment(); // wait for deployment to complete
    });

    // Test case for opening a new safe with ETH
    it("should add a weight and value", async function () {
        const weight = 1;
        const value = 2;
        const result = await mathTest.connect(addr1).addValue(value, weight);
        const resultValue = await mathTest.connect(addr1).rate();
        console.log("WeightedSum: ", resultValue.weightedSum);
        console.log("Weight: ", resultValue.totalWeight);
        expect(resultValue.weightedSum).to.equal(value * weight);
        expect(resultValue.totalWeight).to.equal(1);
    });

    it("should add and subtract a weight and value", async function () {
        const weight = 1;
        const value = 2;
        const result = await mathTest.connect(addr1).addValue(value, weight);
        const resultValue = await mathTest.connect(addr1).rate();
        console.log("WeightedSum: ", resultValue.weightedSum);
        console.log("Weight: ", resultValue.totalWeight);
        expect(resultValue.weightedSum).to.equal(2);
        expect(resultValue.totalWeight).to.equal(1);

        const result2 = await mathTest.connect(addr1).subtractValue(value, weight);
        const resultValue2 = await mathTest.connect(addr1).rate();
        console.log("WeightedSum: ", resultValue2.weightedSum);
        console.log("Weight: ", resultValue2.totalWeight);
        expect(resultValue2.weightedSum).to.equal(0);
        expect(resultValue2.totalWeight).to.equal(0);
    });


    it("Real world example using origination fee basis points", async function () {
        const mintedTokens = [
            {
                mintedTokens: 1000,
                originationFee: 100 // 1%
            },
            {
                mintedTokens: 2000,
                originationFee: 250 // 2.5%
            },
            {
                mintedTokens: 3000,
                originationFee: 500 // 5%
            },
        ];
        for (let i = 0; i < mintedTokens.length; i++) {
            const mintedToken = mintedTokens[i];
            const result = await mathTest.connect(addr1).addValue(mintedToken.originationFee, mintedToken.mintedTokens);
        }
        const resultValue = await mathTest.connect(addr1).rate();
        console.log("WeightedSum: ", resultValue.weightedSum);
        console.log("Weight: ", resultValue.totalWeight);
        expect(resultValue.weightedSum).to.equal(1000 * 100 + 2000 * 250 + 3000 * 500);
        expect(resultValue.totalWeight).to.equal(1000 + 2000 + 3000);
        const computedRate = await mathTest.connect(addr1).calculateRate();
        expect(computedRate).equals(resultValue.weightedSum / resultValue.totalWeight);

    });
});