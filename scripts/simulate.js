const { Environment, Agent } = require("flocc");
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require("hardhat");
const { deployContract } = require("@nomicfoundation/hardhat-ethers/types");
const { assert, expect } = require("chai");
const { takeODLLSnapshot, takeUserSnapshots, takeContractSnapshots, takeSafeSnapshots } = require("../test/utils");

const numBorrowers = 100;
const numBots = 5;
const numThirdpartyStablecoinHolders = 300;
const numSimulations = 300;

function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

const totalPrecision = ethers.parseEther("0.00001", 18);
const aggregatePrecision = ethers.parseEther("0.0000001", 18);
const individualPrecision = ethers.parseEther("0.000000001", 18);


class Actor extends Agent {
    constructor(actorType, account, initialBalance, contracts, market, tracker) {
        super();
        this.actorType = actorType;
        this.account = account;
        this.contracts = contracts;
        this.ethBalance = initialBalance;
        this.sbdBalance = BigInt(0);
        this.sbrBalance = BigInt(0);
        this.market = market;
        this.tracker = tracker;
        this.stabilityPool = {
            stake: BigInt(0),
            unclaimedRewards: {
                sbd: BigInt(0),
                eth: BigInt(0),
                sbr: BigInt(0)
            }
        }
        this.sbrStaking = {
            stake: BigInt(0),
            unclaimedRewards: {
                sbd: BigInt(0),
                eth: BigInt(0),
                sbr: BigInt(0)
            }
        }
    }
    async distributeCollateralGain(gain, check) {
        this.stabilityPool.unclaimedRewards.eth += gain;
        if (check) {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
        }
    }
    async claimCollateralGain() {
        this.ethBalance += this.stabilityPool.unclaimedRewards.eth;
        this.stabilityPool.unclaimedRewards.eth = BigInt(0);
    }
    async distributeSbdRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbd = this.stabilityPool.unclaimedRewards.sbd + reward;
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
        //console.log(await this.contracts.stabilityPool.rewardLoss());
        //console.log("Pending rewards ", pendingRewards[0], this.stabilityPool.unclaimedRewards.sbd);
        expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
    }
    async claimSbdRewards() {
        this.sbdBalance += this.stabilityPool.unclaimedRewards.sbd;
        this.stabilityPool.unclaimedRewards.sbd = BigInt(0);
    }
    async distributeSbrRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbr += reward;
    }
    async distributeSbrStakingRewards(reward) {
        this.sbrStaking.unclaimedRewards.sbr += reward;
    }
    async distributeSbrStakingEthRewards(reward) {
        this.sbrStaking.unclaimedRewards.eth += reward;
    }
    async buyETH() {
        const sbdToUse = (BigInt(Math.floor(getRandomInRange(0.1, 0.5) * 100)) * this.sbdBalance / BigInt(100));
        const collateralAmount = sbdToUse / this.market.collateralPrice;
        console.log("Buying ETH ", collateralAmount, " with ", sbdToUse, " SBD");
        expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
        if (this.market.ethBalance > collateralAmount && this.sbdBalance > BigInt(0) && collateralAmount > BigInt(0)) {
            const sbdRequired = collateralAmount * this.market.collateralPrice;
                const tx = await this.contracts.sbdToken.connect(this.account).transfer(this.market.account.address, sbdRequired);
                await tx.wait();
                console.log("Buying ETH ", collateralAmount, " with ", sbdRequired, " SBD");
                await this.market.buyETH(collateralAmount, sbdRequired, this);
                this.sbdBalance -= sbdRequired;
                this.ethBalance += collateralAmount;
        }
    }
    async buySBD() {
       const maxSbdToBuy = this.market.sbdBalance;
       let sbdToBuy = (BigInt(Math.floor(getRandomInRange(0.01, 0.05) * 100)) * maxSbdToBuy / BigInt(100));
       const collateralNeeded = sbdToBuy / this.market.collateralPrice;
       console.log("Attemping to Buy SBD ", sbdToBuy, " with ", collateralNeeded, " collateral");
       if (this.ethBalance > collateralNeeded) {
           const tx = await this.account.sendTransaction({
            to: this.market.account.address,
            value: collateralNeeded // Send 1 ETH
          });
          sbdToBuy = collateralNeeded * this.market.collateralPrice;
          await tx.wait();
          console.log("Buying SBD ", sbdToBuy, " with ", collateralNeeded, " collateral");
          await this.market.buySBD(collateralNeeded, sbdToBuy, this);
          this.sbdBalance += sbdToBuy;
          this.ethBalance -= collateralNeeded;
       }
    }
    async step() {
        console.log(`[${Date.now()}] [${this.actorType} - ${this.id}] executing step`);
        this.ethBalance = await this.account.provider.getBalance(this.account.address);
        try {
            await this._step();
        } catch (error) {
            console.log(this.ethBalance, this.sbdBalance, this.sbrBalance);
            await this._printState();
            console.log(this.stabilityPool);
            console.log(await this.contracts.sbdToken.balanceOf(this.account.address));
            console.log(await this.contracts.stabilityPool.getUser(this.account.address));
            await this.tracker.printState();
            throw error;
        }
    }

    async stakeSBD() {
        let stakeAmount = (((this.sbdBalance * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        console.log("Staking SBD ", this.id, stakeAmount, this.sbdBalance);
        if (stakeAmount == BigInt(0) && Math.random() < 0.5) {
            stakeAmount = BigInt(1000);
            console.log("Updating stake amount to ", stakeAmount);
        }
        if (stakeAmount > this.sbdBalance || stakeAmount == BigInt(0)) {
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stabilityPool.target, stakeAmount);
                await tx1.wait();
                const tx = await this.contracts.stabilityPool.connect(this.account).stake(stakeAmount);
                assert.fail("Stake SBD should have failed");
            } catch (error) {
                console.log("Stake SBD failed as expected");
            }
        } else {
            if (Math.random < 0.3) {
                try {
                    const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stabilityPool.target, BigInt(0));
                    await tx1.wait();
                    // Should fail because of insufficient allowance
                    const tx = await this.contracts.stabilityPool.connect(this.account).stake(stakeAmount);
                    assert.fail("Stake SBD should have failed");
                } catch (ex) {
                    //console.log("Stake SBD failed as expected");
                }
            } else {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stabilityPool.target, stakeAmount);
                await tx1.wait();
                // Claim rewards beforehand
                const ethBalance = await this.account.provider.getBalance(this.account.address);
                const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
                console.log("Pending rewards ", pendingRewards);
                const tx = await this.contracts.stabilityPool.connect(this.account).stake(stakeAmount);
                const detail = await tx.wait();
                const gas = detail.gasUsed * tx.gasPrice;
                this.sbdBalance = this.sbdBalance - stakeAmount;
                expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
                expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
                expect(ethBalance + pendingRewards[1] - gas).to.be.closeTo(await this.account.provider.getBalance(this.account.address), aggregatePrecision);
                if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0)) {
                    await this.claimSbdRewards();
                    await this.claimCollateralGain();
                }
                expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
                //expect(this.stabilityPool.stake + stakeAmount).to.equal(await this.contracts.stableBaseCDP.stabilityPoolStake());
                this.stabilityPool.stake += stakeAmount;
                const added = await this.tracker.addStabilityPoolStaker(this);
            }
            // Check SBD balance in contract
        }
    }

    async unstakeSBD() {
        let unstakeAmount = (((this.stabilityPool.stake * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        console.log("Unstaking SBD ", this.id, unstakeAmount, this.stabilityPool.stake);
        if (unstakeAmount > this.stabilityPool.stake || unstakeAmount == BigInt(0)) {
            try {
                const tx = await this.contracts.stabilityPool.connect(this.account).unstake(unstakeAmount);
                assert.fail("Unstake SBD should have failed");
            } catch (error) {
                console.log("Unstake SBD failed as expected");
            }
        } else {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            const tx = await this.contracts.stabilityPool.connect(this.account).unstake(unstakeAmount);
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd,aggregatePrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
            await this.claimSbdRewards();
            await this.claimCollateralGain();
            this.sbdBalance = this.sbdBalance + unstakeAmount;
            expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            expect(this.stabilityPool.stake - unstakeAmount).to.be.closeTo((await this.contracts.stabilityPool.getUser(this.account.address)).stake, aggregatePrecision);
            this.stabilityPool.stake -= unstakeAmount;
            await this.tracker.updateStabilityPoolStake(this);
        }
        // Check SBD balance in contract
    }

    async claimRewards() {
        console.log("Claiming rewards ", this.id);
        if (this.stabilityPool.stake == BigInt(0)) {
            // No need to claim rewards
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
            const tx = await this.contracts.stabilityPool.connect(this.account).claim();
            const detail = await tx.wait();
            if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0)) {
                await this.claimSbdRewards();
                await this.claimCollateralGain();
            }
        } else {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            const tx = await this.contracts.stabilityPool.connect(this.account).claim();
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            //this.sbdBalance += pendingRewards[0];
            //this.ethBalance += pendingRewards[1] - gas;
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
            await this.claimSbdRewards();
            await this.claimCollateralGain();
            expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), aggregatePrecision);
        }
    }
}

class Borrower extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super("Borrower", account, initialBalance, contracts, market, tracker);
        this.safeId = ethers.solidityPackedKeccak256(["address", "address"], [account.address, ethers.ZeroAddress]);
        this.safe = {
            collateral: BigInt(0),
            debt: BigInt(0),
            pending: {
                collateral: BigInt(0),
                debt: BigInt(0)
            }
        }
        this.riskProfile = getRandomInRange(0.0001, 0.002); // lower this number, higher the risk
        this.shieldingRate = BigInt(Math.floor(this.riskProfile * 10000)); // 0.01 * 1000 = 10 basis points
    }

    async activatePendingCollateralAndDebt() {
        const result = await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(this.safeId);
        if (result[0] > BigInt(0) || result[1] > BigInt(0)) {
            console.log("Applying pending collateral and debt ", result[0], result[1]);
            const pendingDebtIncrease=  this.safe.pending.debt;
            const pendingCollateralIncrease = this.safe.pending.collateral;
            expect(pendingDebtIncrease).to.be.closeTo(result[0], aggregatePrecision);
            expect(pendingCollateralIncrease).to.be.closeTo(result[1], aggregatePrecision);
            this.safe.collateral += pendingCollateralIncrease;
            this.safe.pending.collateral = BigInt(0);
            this.safe.debt += pendingDebtIncrease;
            this.safe.pending.debt = BigInt(0);
            await this.tracker.increaseDebtAndCollateral(pendingDebtIncrease, pendingCollateralIncrease);
        }
    }

    async openSafe() {
        console.log("Opening safe for ", this.safeId, this.id);
        ///console.log("Account balance: ", this.account, );
        try {
            if ((await this.contracts.stableBaseCDP.ownerOf(this.safeId)) != ethers.ZeroAddress) {
                return;
            }
        } catch (err) {
            // For now do nothing
        }
        let collateralAmount = (((this.ethBalance / BigInt(1e18)) * BigInt(1e18)) * BigInt(Math.floor(getRandomInRange(0.001, 0.01) * 1000))) / BigInt(1000);
        console.log("OPening safe with collateral ", collateralAmount);
        const tx = await this.contracts.stableBaseCDP.connect(this.account).openSafe(this.safeId, collateralAmount, { value: collateralAmount });
        const detail = await tx.wait();
        const gas = detail.gasUsed * tx.gasPrice;
        this.safe.collateral = collateralAmount;
        await this.tracker.addBorrower(this);
        expect(this.ethBalance - collateralAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
    }

    async borrow() {
        if (this.safe.collateral == BigInt(0) && Math.random() < 0.5) {
            // doing this only 50% of the time
            await this.openSafe();
        }
        let borrowAmount = ((((this.safe.collateral * this.market.collateralPrice * BigInt(Math.floor(getRandomInRange(0.1, 0.8) * 1000)))  / BigInt(1e18)) * BigInt(1e18))/ BigInt(1000));
        if (this.safe.collateral == BigInt(0)) {
            borrowAmount = BigInt(10000);
            // this should fail as there is no safe
        }
        console.log("Borrowing  ", borrowAmount);
        if ((this.safe.debt + borrowAmount) > ((this.safe.collateral * this.market.collateralPrice * BigInt(909)) / BigInt(1000)) || (this.safe.debt + borrowAmount) < await this.contracts.stableBaseCDP.MINIMUM_DEBT()) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, BigInt(0), BigInt(0));
                assert.fail("Borrow should have failed");
            } catch (error) {
                console.log("Borrow failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, BigInt(0), BigInt(0));
            const detail = await tx.wait();
            this.safe.debt += borrowAmount;
            const shieldingFee = (borrowAmount * this.shieldingRate) / BigInt(10000);
            this.sbdBalance = this.sbdBalance + borrowAmount - shieldingFee;
            const refund = await this.tracker.distributeShieldingFee(shieldingFee);
            this.sbdBalance += refund;
            console.log("Borrowed ", borrowAmount, " shielding fee ", shieldingFee, this.shieldingRate," refund ", refund);
            //expect(this.sbdBalance).to.equal(await this.contracts.sbdToken.balanceOf(this.account.address));
            // Check fees refund, fee paid to stability pool, fee paid to SBR stakers, debt and collateral in contract
        }
    }

    async repay() {
        if (this.safe.debt === BigInt(0)) {
            return;
        }
        const repayAmount = (((this.safe.debt * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) ) / BigInt(1e18) ) * BigInt(1e18)) / BigInt(1000);
        console.log("Repaying ", repayAmount);
        if (repayAmount > this.sbdBalance || ((this.safe.debt - repayAmount) < await this.contracts.stableBaseCDP.MINIMUM_DEBT())) {
            // this should fail
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, BigInt(0));
                assert.fail(`Repay should have failed ${repayAmount} ${this.sbdBalance} ${this.safe.debt}`);
            } catch (error) {
                console.log("Repay failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, BigInt(0));
            const detail = await tx.wait();
            this.safe.debt -= repayAmount;
            this.sbdBalance -= repayAmount;
            // Check debt and collateral in contract
        }
    }

    async closeSafe() {

    }

    async setSafeClosed() {
        this.safe.collateral = BigInt(0);
        this.safe.debt = BigInt(0);
    }

    async withdrawCollateral() {
        const withdrawAmount = ((this.safe.collateral * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) / BigInt(1e18)) * BigInt(1e18)) / BigInt(1000);
        console.log("Withdrawing collateral ", withdrawAmount);
        const collateralValue = this.safe.collateral * this.market.collateralPrice;
        const withdrawValue = withdrawAmount * this.market.collateralPrice;
        if ((this.safe.collateral == BigInt(0)) || (collateralValue - withdrawValue) < (this.safe.debt * BigInt(1100) / BigInt(1000))) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, BigInt(0));
                assert.fail("Withdraw should have failed");
            } catch (error) {
                console.log("Withdraw failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, BigInt(0));
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            this.safe.collateral -= withdrawAmount;
            expect(this.ethBalance + withdrawAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
            // Check collateral in contract
        }
    }

    async addCollateral() {
        const addAmount = ((this.ethBalance * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) / BigInt(1e18)) * BigInt(1e18)) / BigInt(1000);
        console.log("Adding collateral ", addAmount);
        if (this.safe.collateral == BigInt(0)) {
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).addCollateral(this.safeId, addAmount, BigInt(0), { value: addAmount });
                assert.fail("Add collateral should have failed");
            } catch (ex) {
                console.log("Add collateral failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).addCollateral(this.safeId, addAmount, BigInt(0), { value: addAmount });
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            this.safe.collateral += addAmount;
            expect(this.ethBalance - addAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
        }
        // Check collateral in
    }

    async topupFee() {
        let topupFee = (this.safe.debt * this.shieldingRate) / BigInt(10000);
        console.log("Paying topup fee ", topupFee, this.safe.debt, this.sbdBalance, this.shieldingRate);
        if (this.safe.collateral == BigInt(0) || this.sbdBalance < topupFee || topupFee == BigInt(0)) {
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, topupFee);
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, BigInt(0));
                assert.fail("Topup fee should have failed");
            } catch (error) {
                console.log("Topup fee failed as expected");
            }
        } else {
            try {
                const tx1= await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, BigInt(0));
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, BigInt(0));
                assert.fail("This should have failed");
            } catch (ex) {
                await this.activatePendingCollateralAndDebt();
                topupFee = (this.safe.debt * this.shieldingRate) / BigInt(10000);
                console.log("Paying topup fee ", topupFee, this.safe.debt, this.sbdBalance, this.shieldingRate);
                if (topupFee > this.sbdBalance) {
                    console.log("Adjusting position in the safe instead of paying topup fee at this point.");
                    const tx1 = await this.contracts.sbdToken.connect(this.account).adjustPosition(this.safeId, BigInt(0));
                    await tx1.wait();
                    return;
                }
                //expect(this.safe.debt).to.equal((await this.contracts.stableBaseCDP.safes(this.safeId)).borrowedAmount);
                const tx1= await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, topupFee);
                await tx1.wait();
                await this.tracker.verifyStakerPendingRewards();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, BigInt(0));
                const detail = await tx.wait();
                const refund = await this.tracker.distributeShieldingFee(topupFee);
                console.log("Paid topup fee ", topupFee, refund);
                this.sbdBalance = this.sbdBalance - topupFee + refund;
                expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            }
            // Check debt in contract
        }
    }

    async stakeSBR() {
    }

    async unstakeSBR() {
    }

    async _printState() {
        console.log("Borrower state ", this.safeId, this.safe);
        console.log("Safe: ", await this.contracts.stableBaseCDP.safes(this.safeId));
        console.log("Safe pending collateral and debt: ", await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(this.safeId));
        console.log("Stability Pool State: ", this.stabilityPool);
        console.log("Stability Pool state for user: ", await this.contracts.stabilityPool.getUser(this.account.address));
        console.log("Stability Pool Reward State: ", await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address));
    }

    async _step() {
        if (Math.random() < 0.03) {
            await this.borrow();
            return;
        }
        if (Math.random() < 0.03) {
            await this.repay();
            return;
        }
        if (Math.random() < 0.03) {
            await this.withdrawCollateral();
            return;
        }
        if (Math.random() < 0.03) {
            await this.addCollateral();
            return;
        }
        if (Math.random() < 0.03) {
            await this.topupFee();
            return;
        }
        if (Math.random() < 0.03) {
            await this.stakeSBD();
            return;
        }
        if (Math.random() < 0.005) {
            await this.unstakeSBD();
            return;
        }
        if (Math.random() < 0.03) {
            await this.claimRewards();
            return;
        }
        if (Math.random() < 0.005) {
            await this.buyETH();
            return;
        }
    }
}

class Bot extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super("Bot", account, initialBalance, contracts, market, tracker);
    }

    async _printState() {
        // nothing
    }
    async liquidate() {
        const safeId = await this.contracts.liquidationQueue.getTail();
        const safe = await this.contracts.stableBaseCDP.safes(safeId);
        const collateralValue = safe.collateralAmount * this.market.collateralPrice;
        if (collateralValue < (safe.borrowedAmount * BigInt(1100) / BigInt(1000))) {
            // liquidate
            console.log("Attempting to liquidate ", safeId);
            this.tracker.activatePendingCollateralAndDebt(safeId);
            const safeBeforeLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
            console.log("Safe before liquidation: ", safeBeforeLiquidation);
            console.log("Total debt/collateral", await this.contracts.stableBaseCDP.totalDebt(), await this.contracts.stableBaseCDP.totalCollateral(), this.tracker.totalDebt, this.tracker.totalCollateral);
            const tx = await this.contracts.stableBaseCDP.connect(this.account).liquidate();
            const txDetail = await tx.wait();
            const gas = txDetail.gasUsed * tx.gasPrice;
            let gasCompensation = BigInt(0);
            txDetail.logs.forEach(log => {
                if (log.address == this.contracts.stableBaseCDP.address) {
                    const event = this.contracts.stableBaseCDP.interface.parseLog(log);
                    if (event.name == "LiquidationGasCompensationPaid") {
                        console.log("Gas compensation for liquidation: ", event.args.gasCompensated, txDetail.gasUsed, tx.gasPrice);
                        gasCompensation = event.args.refund;
                    }
                }
            });
            // Check debt and collateral in contract
            // Adjust stakes, rewards, etc.
            const safeAfterLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
            expect(safeAfterLiquidation.borrowedAmount).to.equal(BigInt(0));
            expect(safeAfterLiquidation.collateralAmount).to.equal(BigInt(0));
            const liquidationFee = safe.collateralAmount * (await this.contracts.stableBaseCDP.REDEMPTION_LIQUIDATION_FEE()) / BigInt(10000);
            const refund = await this.tracker.liquidate(safe, safeId, liquidationFee - gasCompensation);
            //this.ethBalance += refund;
            //expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), ethers.parseUnits("0.1", 18));

        } else if (Math.random() < 0.05) {
            console.log("Attempting to liquidate ", safeId);
            try {
                const safeBeforeLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
                console.log("Safe before liquidation: ", safeBeforeLiquidation);
                const tx = await this.contracts.stableBaseCDP.connect(this.account).liquidate();
                assert.fail("Liquidation should have failed");
            } catch (ex) {
                console.log("Liquidation failed as expected");
            }
        }
    }

    validateRedeemParams(safe, params, amountToRedeem, collateralPrice) {
        return true;
    }

    async getRedeemedSafes(sbdAmount) {
        const redeemedSafes = [];
        let amountToRedeem = sbdAmount;
        let safeId = await this.contracts.redemptionQueue.getHead();
        do {
            this.tracker.activatePendingCollateralAndDebt(safeId);
            //console.log("Redeeming safe: ", safeId);
            const safe = await this.contracts.stableBaseCDP.safes(safeId);
            const safeCopy = {
                collateralAmount: safe.collateralAmount,
                borrowedAmount: safe.borrowedAmount,
                feePaid: safe.feePaid,
                weight: safe.weight,
                totalBorrowedAmount: safe.totalBorrowedAmount
            };
            //console.log("Safe: ", safeCopy);
            const collateralValue = safe.collateralAmount * this.market.collateralPrice;
            const borrowedAmount = safe.borrowedAmount;
            const feePaid = safe.feePaid;
            const collateralPrice = await this.contracts.priceOracle.fetchPrice();
            const result = await this.contracts.stableBaseCDP.calculateRedemptionAmountsAndFee(safeCopy, amountToRedeem, collateralPrice);
            //console.log("Redeem result: ", result);
            expect(this.validateRedeemParams(safe, result, amountToRedeem, this.market.collateralPrice)).to.be.true;
            redeemedSafes.push({
                safeId,
                safe,
                params: result
            });
            const safeNode = await this.contracts.redemptionQueue.getNode(safeId);
            safeId = safeNode.next;
            amountToRedeem = amountToRedeem - (result[2] + result[3]);
            console.log("Amount to redeem, amount redeemed from safe, refunded", amountToRedeem, result[2], result[3]);
        } while (amountToRedeem > BigInt(0));
        console.log("RedeemedSafes: ", redeemedSafes);
        return redeemedSafes;
    }

    async redeem() {

        if (this.market.sbdPrice < BigInt(9900) && await this.contracts.stableBaseCDP.PROTOCOL_MODE() != BigInt(0)) {
            const redeemAmount = this.sbdBalance / BigInt(2);
            console.log(this.market.sbdPrice, "Redeeming ", redeemAmount);
            // Redeem half of the available SBD
            if (this.sbdBalance > BigInt(0)) {
                // Calculate expected collateral return, fees, etc.
                const ethBal = await this.account.provider.getBalance(this.account.address);
                const redeemedSafes = await this.getRedeemedSafes(redeemAmount);
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, redeemAmount);
                let detail = await tx1.wait();
                let gasUsed = detail.gasUsed * tx1.gasPrice;
                const tx = await this.contracts.stableBaseCDP.connect(this.account).redeem(redeemAmount, BigInt(0));
                detail = await tx.wait();
                gasUsed += detail.gasUsed * tx.gasPrice;
                this.sbdBalance -= redeemAmount;
                // adding total collateral redeemed
                this.ethBalance += redeemedSafes.reduce((acc, safe) => acc + safe.params[1], BigInt(0));
                // - tx fees
                this.ethBalance -= gasUsed;
                // - redemption fees paid
                this.ethBalance -= redeemedSafes.reduce((acc, safe) => acc + safe.params[5], BigInt(0));
                expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
                expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), aggregatePrecision);
                await this.tracker.updateRedeemedSafes(redeemedSafes);
                // update safes in tracker to update actors debt and collateral
                // Check SBD balance in contract
            }
        }
    }
    async _step() {
        if (Math.random() < 0.1) {
            await this.buySBD();
            return;
        }
        if (Math.random() < 0.01) {
            await this.buyETH();
            return;
        }
        if (Math.random() < 0.2) {
            await this.liquidate();
            return;
        }
        if (Math.random() < 0.2) {
            await this.redeem();
            return;
        }
    }
}

class ThirdpartyStablecoinHolder extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super("ThirdpartyStablecoinHolder", account, initialBalance, contracts, market, tracker);
    }

    async _printState() {
        // Nothing spl
    }
    
    async stakeSBR() {
    }

    async unstakeSBR() {
    }

    async _step() {
        if (Math.random() < 0.1) {
            await this.buySBD();
            return;
        }
        if (Math.random() < 0.01) {
            await this.buyETH();
            return;
        }
        if (Math.random() < 0.5) {
            await this.stakeSBD();
            return;
        }
        if (Math.random() < 0.05) {
            await this.unstakeSBD();
            return;
        }
        if (Math.random() < 0.03) {
            await this.claimRewards();
            return;
        }
    }

}

// Market agent to simulate collateral price fluctuations
class Market extends Agent {
    constructor(account, initialBalance, contracts, tracker) {
      super();
      this.contracts = contracts;
      this.account = account;
      this.ethBalance = initialBalance;
      console.log("Market initial balance: ", this.ethBalance);
      this.collateralPrice = BigInt(3000); // Starting price for collateral (e.g., ETH)
      this.sbdPrice = BigInt(10000);
      this.tracker = tracker;
      this.sbdBalance = BigInt(0);
      this.sbrBalance = BigInt(0);
    }

    async buyETH(ethAmount, sbdAmount, buyer) {
        if (this.ethBalance < ethAmount) {
            return false;
        }
        this.ethBalance -= ethAmount;
        this.sbdBalance += sbdAmount;
        const tx = await this.account.sendTransaction({
            to: buyer.account.address,
            value: ethAmount // Send 1 ETH
          });
        await tx.wait();
        return true;
    }

    async buySBD(ethAmount, sbdAmount, buyer) {
        if (this.sbdBalance < sbdAmount) {
            return false;
        }
        this.ethBalance += ethAmount;
        this.sbdBalance -= sbdAmount;
        const tx = await this.contracts.sbdToken.connect(this.account).transfer(buyer.account.address, sbdAmount);
        await tx.wait();
        return true;
    }

    async fluctuateCollateralPrice(factor) {
        const f = Math.floor(factor * 1000);
        const rand = (Math.floor(getRandomInRange(0, 2 * factor) * 1000));
        console.log("Fluctuating collateral price ", factor, f, rand);
        this.collateralPrice = (this.collateralPrice * BigInt((1000 - f) + rand)) / BigInt(1000); // ±2% fluctuation
        this.sbdPrice = (this.sbdPrice * BigInt((BigInt(1000) + BigInt(f) / BigInt(8)) - BigInt(rand) / BigInt(8))) / BigInt(1000); // ±2% fluctuation
    }
  
    async step() {
        this.ethBalance = await this.account.provider.getBalance(this.account.address);
        if (Math.random() < 0.1) {
            await this.fluctuateCollateralPrice(0.04);
        } else if (Math.random() < 0.01) {
            await this.fluctuateCollateralPrice(0.08);
        } else if (Math.random() < 0.001) {
            await this.fluctuateCollateralPrice(0.16);
        } else {
            await this.fluctuateCollateralPrice(0.015);
        }
        console.log("Collateral price: ", this.collateralPrice);
        console.log("SBD price: ", this.sbdPrice);
       //await this.fluctuateCollateralPrice();
       await this.contracts.priceOracle.setPrice(this.collateralPrice);
    }

     async printState() {
        console.log("Market state: ", this.ethBalance, this.collateralPrice, this.sbdPrice);
     }
  }

// A tracker agent to compute and verify the protocol's state offline, used to ensure protocol works as expected
class OfflineProtocolTracker extends Agent {
  constructor(contracts, market, actors) {
    super();
    this.contracts = contracts;
    this.actors = actors;
    this.borrowers = {};
    this.totalCollateral = BigInt(0); // Collateral value
    this.totalDebt = BigInt(0); // Debt in stablecoin (SBD)
    this.market = market;
    this.stabilityPool = {
        stakers: [],
        totalStake: BigInt(0),
        rewardLoss: BigInt(0),
        stakeLoss: BigInt(0),
        totalRewards: {
            sbd: BigInt(0),
            eth: BigInt(0),
            sbr: BigInt(0)
        }
    }
    this.sbrStaking = {
        totalStake: BigInt(0),
        stakers: [],
        totalRewards: {
            sbd: BigInt(0),
            eth: BigInt(0)
        }
    }
    this.safeMapping = {};
  }

  async addBorrower(borrowerAgent) {
    this.borrowers[borrowerAgent.id] = borrowerAgent;
    this.safeMapping[BigInt(borrowerAgent.safeId)] = borrowerAgent;
  }

  async removeBorrower(borrowerAgent) {
    delete this.borrowers[borrowerAgent.id];
    delete this.safeMapping[BigInt(borrowerAgent.safeId)];
  }

  async activatePendingCollateralAndDebt(safeId) {
    const borrower = this.safeMapping[BigInt(safeId)];
    await borrower.activatePendingCollateralAndDebt();
  }

  async addStabilityPoolStaker(staker) {
    if (this.stabilityPool.stakers.filter(s => s.id == staker.id).length == 0) {
        this.stabilityPool.stakers.push(staker);
    }
    this.stabilityPool.totalStake = this.stabilityPool.stakers.reduce((acc, s) => acc + s.stabilityPool.stake, BigInt(0));
  }

  async updateStabilityPoolStake(staker) {
    if (staker.stabilityPool.stake == BigInt(0)) {
        this.stabilityPool.stakers = this.stabilityPool.stakers.filter(s => s != staker);
    }
    this.stabilityPool.totalStake = this.stabilityPool.stakers.reduce((acc, s) => acc + s.stabilityPool.stake, BigInt(0));
  }

  async increaseDebtAndCollateral(debt, collateral) {
    this.totalCollateral += collateral;
    this.totalDebt += debt;
  }

  async liquidate(safe, safeId, liquidationFee) { 
     const borrowAmount = safe.borrowedAmount;
     const collateralAmount = safe.collateralAmount;
     const fee = liquidationFee;
     this.totalCollateral -= collateralAmount;
     this.totalDebt -= borrowAmount;
     const refund = BigInt(0);
     if (this.stabilityPool.totalStake >= borrowAmount) {
        await this.distributeCollateralGainsToStabilityPoolStakers(collateralAmount - fee, false);
        const totalStake = this.stabilityPool.totalStake;
        const scalingFactor =  ((totalStake - borrowAmount) * BigInt(1e27)) / totalStake;
        let totalStakeAfterLiquidation = BigInt(0);
        for (const staker of this.stabilityPool.stakers) {
            staker.stabilityPool.stake = (staker.stabilityPool.stake * scalingFactor) / BigInt(1e27);
            totalStakeAfterLiquidation += staker.stabilityPool.stake;
        }
        this.stabilityPool.totalStake -= borrowAmount;
        this.stabilityPool.stakeLoss += (this.stabilityPool.totalStake - totalStakeAfterLiquidation);
        if (this.sbrStaking.totalStake > BigInt(0)) {
            await this.distributeCollateralGainsToSBRStakers(liquidationFee);
            //return BigInt(0);
        } else if (this.stabilityPool.totalStake > BigInt(0)) {
            await this.distributeCollateralGainsToStabilityPoolStakers(liquidationFee, true);
            //return BigInt(0);
            //refund = 
        } else {
           // return liquidationFee;
           refund = liquidationFee;
        }
     } else {
        await this.cleanupBorrower(safeId);
        const totalCollateral = Object.keys(this.borrowers).reduce((acc, id) => acc + this.borrowers[id].safe.collateral, BigInt(0));
        expect(totalCollateral).to.equal(await this.contracts.stableBaseCDP.totalCollateral());
        await this.distributeDebtAndCollateralToExistingBorrowers(borrowAmount, collateralAmount - fee, totalCollateral);
        if (this.sbrStaking.totalStake > BigInt(0)) {
            await this.distributeCollateralGainsToSBRStakers(fee);
            //return BigInt(0);
        } else if (this.stabilityPool.totalStake > BigInt(0)) {
            await this.distributeCollateralGainsToStabilityPoolStakers(liquidationFee, true);
            //return BigInt(0);
            //refund = 
        } else {
           // return liquidationFee;
           refund = liquidationFee;
        }
     }
     //expect(this.totalCollateral).to.equal(await this.contracts.stableBaseCDP.totalCollateral());
     //expect(this.totalDebt).to.equal(await this.contracts.stableBaseCDP.totalDebt());
     expect(await this.contracts.redemptionQueue.getNode(safeId)).to.deep.equal([BigInt(0), BigInt(0), BigInt(0)]);
     expect(await this.contracts.liquidationQueue.getNode(safeId)).to.deep.equal([BigInt(0), BigInt(0), BigInt(0)]);
     await this.cleanupBorrower(safeId);
     return refund;
  }

  async distributeDebtAndCollateralToExistingBorrowers(debt, collateral, totalCollateral) {
     console.log("Distributing debt and collateral to existing borrowers ", debt, collateral, totalCollateral);
     for (const borrowerId of Object.keys(this.borrowers)) {
        const borrower = this.borrowers[borrowerId];
        const share = ((collateral * borrower.safe.collateral * BigInt(1e18)) / totalCollateral);
        borrower.safe.pending.collateral += share / BigInt(1e18);
        borrower.safe.pending.debt += ((debt * share) / collateral) / BigInt(1e18);
        const pendingIncrease = await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(borrower.safeId);
        console.log("Distributing debt and collateral to borrower ", borrower.id, share / BigInt(18), borrower.safe.pending.collateral, borrower.safe.pending.debt);
        expect(pendingIncrease[0]).to.be.closeTo(borrower.safe.pending.debt, aggregatePrecision);
        expect(pendingIncrease[1]).to.be.closeTo(borrower.safe.pending.collateral, aggregatePrecision);
     }
  }

  async cleanupBorrower(safeId) {
    let borrower = this.safeMapping[safeId];
    if (borrower === undefined) {
        borrower = this.safeMapping[BigInt(safeId)];
        if (borrower === undefined) {
            return;
        }
    }
    await borrower.setSafeClosed();
    await this.removeBorrower(borrower);
  }

  async removeBorrower(borrower) {
    delete this.borrowers[borrower.id];
    delete this.safeMapping[BigInt(borrower.safeId)];
  }



  async updateRedeemedSafes(redeemedSafes) {
    for (const safe of redeemedSafes) {
        const collateralToRedeem = safe.params[1];
        const debtToRedeem = safe.params[2];
        const toRefund = safe.params[3];
        const ownerFee = safe.params[4];
        const redeemerFee = safe.params[5];
        this.totalCollateral -= collateralToRedeem;
        this.totalDebt -= debtToRedeem;
        //console.log(this.safeMapping, safe.safeId);
        const borrower = this.safeMapping[safe.safeId];
        borrower.safe.collateral -= collateralToRedeem;
        borrower.safe.debt -= debtToRedeem;
        borrower.sbdBalance += (toRefund - ownerFee);
        // Update the redemption / liquidation queue.
        if (this.stabilityPool.totalStake > BigInt(0)) {
            if (ownerFee > BigInt(0)) {
                // distribute sbd
                await this.distributeRedemptionFeeToStabilityPoolStakers(ownerFee);
            }
            const redeemerFee = safe.params[5];
            if (redeemerFee > BigInt(0)) {
                // distribute fee paid in collateral 
                await this.distributeCollateralGainsToStabilityPoolStakers(redeemerFee, false);
            }
        }
    }
    // Check fee distribution
  }

  async verifyStakerPendingRewards() {
    for (const staker of this.stabilityPool.stakers) {
        const user = await this.contracts.stabilityPool.getUser(staker.account.address);
        expect(user.stake).to.be.closeTo(staker.stabilityPool.stake, aggregatePrecision);
        //console.log("Verifying rewards for ", staker.id, staker.account.address);
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(staker.account.address);
        console.log("Pending rewards ", pendingRewards[0], staker.stabilityPool.unclaimedRewards.sbd);
        expect(pendingRewards[0]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
        expect(pendingRewards[1]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
    }
  }

  async distributeRedemptionFeeToStabilityPoolStakers(redeemerFee) {
    let totalStake = this.stabilityPool.totalStake;
    let distributed = BigInt(0);
    let toDistribute = redeemerFee + this.stabilityPool.rewardLoss;
    for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
         const staker= this.stabilityPool.stakers[i];
         const share = (((redeemerFee * staker.stabilityPool.stake * BigInt(1e18))  / (totalStake)) / BigInt(1e18));
         console.log("Distributing owner fee ", i, staker.id, this.stabilityPool.totalStake, "Fee", redeemerFee, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
         await staker.distributeSbdRewards(share);
         distributed += share;
     }
     this.stabilityPool.totalRewards.sbd += distributed;
     this.stabilityPool.rewardLoss = toDistribute - distributed;
  }


  async distributeCollateralGainsToStabilityPoolStakers(collateral, check) {
    let totalStake = this.stabilityPool.totalStake;
    let distributed = BigInt(0);
    for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
        const staker= this.stabilityPool.stakers[i];
         const share = (((collateral * staker.stabilityPool.stake * BigInt(1e18))  / (totalStake)) / BigInt(1e18));
         console.log("Distributing collateral from redemption / liquidation", i,  staker.id, this.stabilityPool.totalStake, "Fee", collateral, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
         await staker.distributeCollateralGain(share, check);
         distributed += share;
     }
     this.stabilityPool.totalRewards.eth += distributed;
  }

  async distributeShieldingFee(fee) {
     let totalStake = this.stabilityPool.totalStake;
     let proportion = BigInt(9000);
     if (this.sbrStaking.totalStake == BigInt(0)) {
        proportion = BigInt(10000);
     }
     let toDistribute = fee + this.stabilityPool.rewardLoss;
     let distributed = BigInt(0);
     console.log(await this.contracts.stabilityPool.totalStakedRaw(), totalStake);
     console.log("Distributing shielding fee ", fee, totalStake, proportion);
     for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
        const staker= this.stabilityPool.stakers[i];
         const share = (((toDistribute * staker.stabilityPool.stake * proportion * BigInt(1e18))  / (totalStake)) / BigInt(1e18) / BigInt(10000));
         console.log("Distributing shielding fee ", i, staker.id, this.stabilityPool.totalStake, "Fee", fee, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
         await staker.distributeSbdRewards(share);
         distributed += share;
     }
     let sbrTotalStake = this.sbrStaking.totalStake;
     let distributedToSbrStakers = BigInt(0);
     for (let i = 0; i< this.sbrStaking.stakers.length ; i++) {
         const staker = this.sbrStaking.stakers[i];
         const share = (toDistribute * staker.stake * BigInt(1000))  / (sbrTotalStake * BigInt(10000));
         await staker.distributeSbrStakingRewards(share);
         distributedToSbrStakers += share;
     }
     if (this.stabilityPool.totalStake > BigInt(0)) {
        this.stabilityPool.rewardLoss = toDistribute - distributed - distributedToSbrStakers;
        return BigInt(0);
     }
     this.stabilityPool.totalRewards.sbd += distributed;
     this.sbrStaking.totalRewards.sbd += distributedToSbrStakers;
     return fee - distributed - distributedToSbrStakers; // return refund
  }

  async distributeCollateralGains(collateral) {

  }

  async distributeLiquidationFee() {

  }

  async distributeRedemptionFee() {

  }

  async validateDebtAndCollateral() {
    let totalCollateral = BigInt(0);
    let totalDebt = BigInt(0);

    for (const borrowerId of Object.keys(this.borrowers)) {
        //console.log("Checking..", borrowerId);
        const borrower = this.borrowers[borrowerId];
        totalCollateral += borrower.safe.collateral;
        totalDebt += borrower.safe.debt;
    }
    expect(totalCollateral).to.be.closeTo(await this.contracts.stableBaseCDP.totalCollateral(), totalPrecision, "Total collateral mismatch");
    expect(totalDebt).to.be.closeTo(await this.contracts.stableBaseCDP.totalDebt(), totalPrecision, "Total debt mismatch");
    //expect(totalDebt).to.equal(await this.contracts.sbdToken.totalSupply(), "Total debt mismatch");
  }

  async validateTotalSupply() {
    let sbdTokens = BigInt(0);
    let sbrTokens = BigInt(0);
    for (const actor of this.actors) {
        sbdTokens += actor.sbdBalance;
        sbdTokens += actor.stabilityPool.unclaimedRewards.sbd;
        //sbdTokens += actor.sbrStaking.unclaimedRewards.sbd;
        sbrTokens += actor.sbrBalance;
        sbrTokens += actor.stabilityPool.unclaimedRewards.sbr;
    }
    sbdTokens += this.market.sbdBalance;
    sbrTokens += this.market.sbrBalance;
    sbdTokens += this.stabilityPool.totalStake;
    sbdTokens += this.stabilityPool.rewardLoss;
    sbdTokens += this.stabilityPool.stakeLoss;
    //sbdTokens += this.stabilityPool.totalRewards.sbd;

    console.log(sbdTokens);
    console.log(await this.contracts.sbdToken.totalSupply());
    expect(await this.contracts.sbdToken.balanceOf(this.contracts.stableBaseCDP.target)).to.equal(BigInt(0), "SBD token mismatch");
    expect(sbdTokens).to.be.closeTo(await this.contracts.sbdToken.totalSupply(), totalPrecision, "Total SBD tokens mismatch");
    //expect(sbrTokens).to.be.closeTo(await this.contracts.sbrToken.totalSupply(), ethers.parseEther("0.0000000000001"), "Total SBR tokens mismatch");
  }

  async validateStabilityPool() {
    let totalStake = BigInt(0);
    let totalRewards = {
        sbd: BigInt(0),
        eth: BigInt(0),
        sbr: BigInt(0)
    }
    for (const staker of this.stabilityPool.stakers) {
        const user = await this.contracts.stabilityPool.getUser(staker.account.address);
        expect(user.stake).to.be.closeTo(staker.stabilityPool.stake, totalPrecision);
        totalStake += staker.stabilityPool.stake;
        totalRewards.sbd += staker.stabilityPool.unclaimedRewards.sbd;
        totalRewards.eth += staker.stabilityPool.unclaimedRewards.eth;
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(staker.account.address);
        expect(pendingRewards[0]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
        expect(pendingRewards[1]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
    }
    expect(totalStake).to.be.closeTo(await this.contracts.stabilityPool.totalStakedRaw(), totalPrecision, "Stability pool stake mismatch");
    expect(totalRewards.sbd + totalStake + this.stabilityPool.rewardLoss + this.stabilityPool.stakeLoss).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.contracts.stabilityPool.target), ethers.parseUnits("0.000001", 18), "Stability pool SBD balance mismatch");
    expect(totalRewards.eth).to.be.closeTo(await ethers.provider.getBalance(this.contracts.stabilityPool.target), totalPrecision, "Stability pool ETH balance mismatch");
  }

  async printState() {
     // Print state
     const contractState = await takeContractSnapshots(this.contracts);
     const safeIds = Object.keys(this.borrowers).map(k => this.borrowers[k].safeId);
     const safeSnapshots = await takeSafeSnapshots(this.contracts, safeIds);
     console.log("Contract state: ", contractState);
     console.log("Safe snapshots: ", safeSnapshots);
     console.log("Redemption QUeue: ", contractState.stableBaseCDP.redemptionQueue.all);
     console.log("Liquidation Queue: ", contractState.stableBaseCDP.liquidationQueue.all);
     await this.market.printState();
  }

  async getTransaction(txHash) {
    try {
        const transaction = await ethers.provider.getTransaction(txHash);

        if (!transaction) {
            console.log("Transaction not found!");
            return;
        }

        // Decode input data
        const parsedData = this.contracts.stableBaseCDP.interface.parseTransaction({
            data: transaction.data,
            value: transaction.value,
        });
        console.log(parsedData);
    } catch (error) {
        console.error("Error fetching transaction:", error);
    }
  }


  async getTxAndEventsThatRemovedFromQueue(safeId) {
    const filter = this.contracts.stableBaseCDP.filters.SafeRemovedFromRedemptionQueue(safeId);
    const events = await this.contracts.stableBaseCDP.queryFilter(filter);
    events.forEach(async(event) => {
        console.log("Transaction hash:", event.transactionHash);
        await this.getTransaction(event.transactionHash);
    });

  }

  async validateSafes() {
    let totalCollateral = BigInt(0);
    let totalDebt = BigInt(0);
    const safesOrderedForRedemption = await takeODLLSnapshot(this.contracts.redemptionQueue);
    const safesOrderedForLiquidation = await takeODLLSnapshot(this.contracts.liquidationQueue);
    const liquidationSafes = {};
    const redemptionSafes = {};
    let current = await this.contracts.redemptionQueue.getHead();
    let prevNode;
    let prev;
    do {
        const currentNode = await this.contracts.redemptionQueue.getNode(current);
        redemptionSafes[current] = currentNode;
        if (prevNode) {
            expect(prevNode.value).to.be.lessThanOrEqual(currentNode.value, "Redemption queue order mismatch");
            expect(prevNode.next).to.equal(current);
            expect(currentNode.prev).to.equal(prev);
        }
        prevNode = currentNode;
        prev = current;
        current = currentNode.next;
    } while (current != BigInt(0));
    current = await this.contracts.liquidationQueue.getHead();
    prevNode = null;
    prev = null;
    do {
        const currentNode = await this.contracts.liquidationQueue.getNode(current);
        liquidationSafes[current] = currentNode;
        if (prevNode) {
            expect(prevNode.value).to.be.lessThanOrEqual(currentNode.value, "Redemption queue order mismatch");
            expect(prevNode.next).to.equal(current);
            expect(currentNode.prev).to.equal(prev);
        }
        prevNode = currentNode;
        prev = current;
        current = currentNode.next;
    } while (current != BigInt(0));
    let keysNotFound = 0;
    for (const borrowerId of Object.keys(this.borrowers)) {
        const borrower = this.borrowers[borrowerId];
        if (borrower.safe.debt > BigInt(0)) {
            try {
                expect(redemptionSafes[BigInt(borrower.safeId)]).to.not.be.undefined;
                expect(liquidationSafes[BigInt(borrower.safeId)]).to.not.be.undefined;
            } catch (ex) {
                console.log("Safe not found in redemption / liquidation queue ", borrower.safeId, BigInt(borrower.safeId));
                console.log("Redemption queue: ", redemptionSafes[BigInt(borrower.safeId)]);
                console.log("Liquidation queue: ", liquidationSafes[BigInt(borrower.safeId)]);
                console.log("Safe: ", borrower.safe);
                console.log("Safe in contract: ", await this.contracts.stableBaseCDP.safes(borrower.safeId));
                await this.getTxAndEventsThatRemovedFromQueue(BigInt(borrower.safeId));
                keysNotFound++;
            }
        }
        totalCollateral += borrower.safe.collateral;
        totalDebt += borrower.safe.debt;
        const safe = await this.contracts.stableBaseCDP.safes(borrower.safeId);
        expect(safe.collateralAmount).to.equal(borrower.safe.collateral, "Collateral mismatch");
        expect(safe.borrowedAmount).to.equal(borrower.safe.debt, "Debt mismatch");
    }
    if (keysNotFound > 0) {
        console.log("Total keys not found in liquidation / redemption queue.", keysNotFound);
        throw "Some keys not found in liquidation / redemption queue";
    }
    
    expect(totalCollateral).to.equal(await this.contracts.stableBaseCDP.totalCollateral(), "Total collateral mismatch");
    expect(totalDebt).to.equal(await this.contracts.stableBaseCDP.totalDebt(), "Total debt mismatch");
  }

  // To adjust for precision loss in naive calculations during simulations
  async syncStates() {
      // reset borrower states
      for (const borrowerId of Object.keys(this.borrowers)) {
          const borrower = this.borrowers[borrowerId];
          borrower.sbdBalance = await this.contracts.sbdToken.balanceOf(borrower.account.address);
          const safe = await this.contracts.stableBaseCDP.safes(borrower.safeId);
          borrower.safe  = {
              collateral: safe.collateralAmount,
              debt:     safe.borrowedAmount
          };
          const pendingIncrease = await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(borrower.safeId);
          borrower.safe.pending = {
              collateral: pendingIncrease[1],
              debt: pendingIncrease[0]
          }
      }
      for (const actor of this.actors) {
        actor.sbdBalance = await this.contracts.sbdToken.balanceOf(actor.account.address);
        actor.sbrBalance = await this.contracts.sbrToken.balanceOf(actor.account.address);
    }
    for (const staker of this.stabilityPool.stakers) {
          const user = await this.contracts.stabilityPool.getUser(staker.account.address);
          const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(staker.account.address);
          staker.sbdBalance = await this.contracts.sbdToken.balanceOf(staker.account.address);
          staker.stabilityPool = {
              stake: user.stake,
              unclaimedRewards: {
                  sbd: pendingRewards[0],
                  eth: pendingRewards[1],
                  sbr: pendingRewards[2]
              }
          }
      }
      this.stabilityPool.totalStake = await this.contracts.stabilityPool.totalStakedRaw();
      this.market.sbdBalance = await this.contracts.sbdToken.balanceOf(this.market.account.address);
      this.stabilityPool.rewardLoss = BigInt(0);
      this.stabilityPool.stakeLoss = BigInt(0);
  }

  async step(id) {
    try {
    //this.checkForLiquidation(collateralPrice);
        await this.validateDebtAndCollateral();
        await this.validateTotalSupply();
        await this.validateStabilityPool();
        await this.validateSafes();
        
       // if ((id + 1) % 20 == 0) {
        //  await this.syncStates();
        //}
        
    } catch (ex) {
        //console.log(this.stabilityPool);
        await this.printState();
        throw ex;
    }
  }
}

async function deployContracts() {
    // Get the deployer's wallet address
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
  
    // Display the deployer's balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", balance);
  
    const SBDToken = await ethers.getContractFactory("SBDToken");
      const sbdToken = await SBDToken.deploy();
      await sbdToken.waitForDeployment();
      console.log("Deployed SBDToken to:", sbdToken.target);
    
      const SBRToken = await ethers.getContractFactory("SBRToken");
      const sbrToken = await SBRToken.deploy();
      await sbrToken.waitForDeployment();
      console.log("Deployed SBRToken to:", sbrToken.target);
  
      const StabilityPool = await ethers.getContractFactory("StabilityPool");
      const stabilityPool = await StabilityPool.deploy(true);
      await stabilityPool.waitForDeployment();
      console.log("Deployed StabilityPool to:", stabilityPool.target);
      
      const PriceOracle = await ethers.getContractFactory("MockPriceOracle");
      const priceOracle = await PriceOracle.deploy();
      await priceOracle.waitForDeployment();
      console.log("Deployed PriceOracle to:", priceOracle.target);
  
      const StableBaseCDPFactory = await ethers.getContractFactory("StableBaseCDP");
      const stableBaseCDP = await StableBaseCDPFactory.deploy();
      await stableBaseCDP.waitForDeployment();
      console.log("Deployed StableBaseCDP to:", stableBaseCDP.target);
  
      const SBRStaking = await ethers.getContractFactory("SBRStaking");
      const sbrStaking = await SBRStaking.deploy(true);
      await sbrStaking.waitForDeployment();
      console.log("Deployed SBRStaking to:", sbrStaking.target);
  
      const OrderedDoublyLinkedList = await ethers.getContractFactory("OrderedDoublyLinkedList");
      const redemptionQueue = await OrderedDoublyLinkedList.deploy();
      await redemptionQueue.waitForDeployment();
      console.log("Deployed LiquidationQueue to:", redemptionQueue.target);
  
      
  
      const liquidationQueue = await OrderedDoublyLinkedList.deploy();
      await liquidationQueue.waitForDeployment();
      console.log("Deployed RedemptionQueue to:", liquidationQueue.target);
  
  
  
      console.log("Setting addresses...");
      console.log("Setting StableBase address to SBDToken...");
      let tx= await sbdToken.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StabilityPool address to SBRToken...");
      tx = await sbrToken.setAddresses(stabilityPool.target);
      await tx.wait();
      console.log("Setting SBDToken, StableBaseCDP, and SBRToken addresses to StabilityPool...");
      tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, sbrToken.target);
      await tx.wait();
      console.log("Setting SBRToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
      tx = await sbrStaking.setAddresses(sbrToken.target, sbdToken.target, stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StableBaseCDP address to RedemptionQueue...");
      tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting StableBaseCDP address to LiquidationQueue...");
      tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
      await tx.wait();
      console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
      tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, sbrStaking.target, liquidationQueue.target, redemptionQueue.target);
      await tx.wait();
  
      return {
          sbdToken,
          sbrToken,
          stabilityPool,
          priceOracle,
          stableBaseCDP,
          sbrStaking,
          redemptionQueue,
          liquidationQueue
      }
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      // Generate a random index between 0 and i
      const j = Math.floor(Math.random() * (i + 1));
  
      // Swap elements array[i] and array[j]
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  

async function main() {

    const [deployer, marketAccount, ...addrs] = await ethers.getSigners();

    const env = new Environment();

    const contracts = await deployContracts();
    //console.log(contracts);

    // Initialize the Market agent
    const market = new Market(marketAccount, marketAccount.balance, contracts);
    env.addAgent(market);

    const tracker = new OfflineProtocolTracker(contracts, market, []);
    env.addAgent(tracker);

    // Initialize CDP agents with random collateral and debt values
    /*
    for (let i = 0; i < 10; i++) {
    const collateral = Math.random() * 100 + 10; // Collateral between 10 and 110
    const debt = Math.random() * 50 + 10; // Debt between 10 and 60
    const cdp = new CDP();
    env.addAgent(cdp);
    }
    */

    let addressIndex = 0;
    for (let i = 0; i < numBorrowers; i++) {
        const borrower = new Borrower(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        borrower.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(borrower);
        addressIndex++;
    }
    for (let i = 0; i < numBots; i++) {
        const bot = new Bot(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        bot.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(bot);
        addressIndex++;
    }
    for (let i = 0; i < numThirdpartyStablecoinHolders; i++) {
        const thirdpartyStablecoinHolder = new ThirdpartyStablecoinHolder(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        thirdpartyStablecoinHolder.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(thirdpartyStablecoinHolder);
        addressIndex++;
    }

    // Update each CDP based on the new collateral price
    const actors = env.getAgents()
    .filter(agent => agent instanceof Actor).map((agent) => agent);
    console.log(actors);
    tracker.actors = actors;

    // Main simulation loop
    for (let i = 0; i < numSimulations; i++) {
        console.log(`--- Simulation Step ${i + 1} ---`);
        
        // Get the updated collateral price from the market
       await market.step();

       let shuffled = shuffleArray(actors);
        
        for (const actor of shuffled) {
           await actor.step();
        }
        
        console.log(); // Blank line for readability between steps
        await tracker.step(i);
    }
    console.log("Simulation completed without errors");

    console.log("SBD total supply: ", await contracts.sbdToken.totalSupply());
    console.log("Total fee paid:", tracker.stabilityPool.totalRewards.sbd);
}

console.log(process.argv);
describe("Simulation", function() {
    it("Should run the simulation without errors", async function() {
        this.timeout(1000000);
        await main();
        /*
    .then(() => process.exit(0))
    .catch(error => {
        for (let i = 0;i<10;i++){
            console.log((Math.floor(getRandomInRange(0.1, 0.8) * 1000)));
        }
        console.error(error);
        process.exit(1);
    });*/
});
});
