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
const numHackers = 2;

function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

const totalPrecision = ethers.parseEther("0.0001", 18);
const aggregatePrecision = ethers.parseEther("0.000001", 18);
const individualPrecision = ethers.parseEther("0.00000001", 18);

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      // Generate a random index between 0 and i
      const j = Math.floor(Math.random() * (i + 1));
  
      // Swap elements array[i] and array[j]
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }


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
        this.currentStep = 0;
    }
    async distributeCollateralGain(gain, check) {
        this.stabilityPool.unclaimedRewards.eth += gain;
        if (check) {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, totalPrecision);
            this.stabilityPool.unclaimedRewards.eth = pendingRewards[1];
        }
    }
    async claimCollateralGain() {
        this.ethBalance += this.stabilityPool.unclaimedRewards.eth;
        this.stabilityPool.unclaimedRewards.eth = BigInt(0);
    }
    async distributeSbdRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbd = this.stabilityPool.unclaimedRewards.sbd + reward;
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
        //this.consolelog(await this.contracts.stabilityPool.rewardLoss());
        //this.consolelog("Pending rewards ", pendingRewards[0], this.stabilityPool.unclaimedRewards.sbd);
        expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, totalPrecision);
        this.stabilityPool.unclaimedRewards.sbd = pendingRewards[0]; // resetting the value from the contract
    }

    async distributeSbdRewardsSBRStaking(reward) {
        this.sbrStaking.unclaimedRewards.sbd += reward;
        const pendingRewards = await this.contracts.sbrStaking.userPendingReward(this.account.address);
        expect(pendingRewards[0]).to.be.closeTo(this.sbrStaking.unclaimedRewards.sbd, totalPrecision);
        this.sbrStaking.unclaimedRewards.sbd = pendingRewards[0];
    }

    async distributeCollateralGainSBRStaking(gain) {
        this.sbrStaking.unclaimedRewards.eth += gain;
        const pendingRewards = await this.contracts.sbrStaking.userPendingReward(this.account.address);
        expect(pendingRewards[1]).to.be.closeTo(this.sbrStaking.unclaimedRewards.eth, totalPrecision);
        this.sbrStaking.unclaimedRewards.eth = pendingRewards[1];
    }

    async claimSbdRewards() {
        this.sbdBalance += this.stabilityPool.unclaimedRewards.sbd;
        this.stabilityPool.unclaimedRewards.sbd = BigInt(0);
    }
    async claimSbdRewardsSBRStaking() {
        this.sbdBalance += this.sbrStaking.unclaimedRewards.sbd;
        this.sbrStaking.unclaimedRewards.sbd = BigInt(0);
    }
    async claimCollateralGainSBRStaking() {
        this.ethBalance += this.sbrStaking.unclaimedRewards.eth;
        this.sbrStaking.unclaimedRewards.eth = BigInt(0);
    }

    async claimSbrRewards() {
        this.sbrBalance += this.stabilityPool.unclaimedRewards.sbr;
        //expect(this.sbrBalance).to.be.closeTo(await this.contracts.sbrToken.balanceOf(this.account.address), aggregatePrecision);
        this.stabilityPool.unclaimedRewards.sbr = BigInt(0);
    }

    async distributeSbrRewards(reward) {
        this.stabilityPool.unclaimedRewards.sbr += reward;
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
        expect(pendingRewards[2]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbr, aggregatePrecision);
        this.stabilityPool.unclaimedRewards.sbr = pendingRewards[2];
    }
    async buyETH() {
        const sbdToUse = (BigInt(Math.floor(getRandomInRange(0.1, 0.5) * 100)) * this.sbdBalance / BigInt(100));
        const collateralAmount = sbdToUse / this.market.collateralPrice;
        this.consolelog("Buying ETH ", collateralAmount, " with ", sbdToUse, " SBD");
        expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
        if (this.market.ethBalance > collateralAmount && this.sbdBalance > BigInt(0) && collateralAmount > BigInt(0)) {
            const sbdRequired = collateralAmount * this.market.collateralPrice;
                const tx = await this.contracts.sbdToken.connect(this.account).transfer(this.market.account.address, sbdRequired);
                await tx.wait();
                this.consolelog("Buying ETH ", collateralAmount, " with ", sbdRequired, " SBD");
                await this.market.buyETH(collateralAmount, sbdRequired, this);
                this.sbdBalance -= sbdRequired;
                this.ethBalance += collateralAmount;
        }
    }
    async buySBD() {
       const maxSbdToBuy = this.market.sbdBalance;
       let sbdToBuy = (BigInt(Math.floor(getRandomInRange(0.01, 0.05) * 100)) * maxSbdToBuy / BigInt(100));
       const collateralNeeded = sbdToBuy / this.market.collateralPrice;
       this.consolelog("Attemping to Buy SBD ", sbdToBuy, " with ", collateralNeeded, " collateral");
       if (this.ethBalance > collateralNeeded) {
           const tx = await this.account.sendTransaction({
            to: this.market.account.address,
            value: collateralNeeded // Send 1 ETH
          });
          sbdToBuy = collateralNeeded * this.market.collateralPrice;
          await tx.wait();
          this.consolelog("Buying SBD ", sbdToBuy, " with ", collateralNeeded, " collateral");
          await this.market.buySBD(collateralNeeded, sbdToBuy, this);
          this.sbdBalance += sbdToBuy;
          this.ethBalance -= collateralNeeded;
       }
    }
    async step(stepNum) {
        this.currentStep = stepNum;
        console.log(`[Step-${this.currentStep}] [${new Date().toISOString()}] [${this.actorType} - ${this.id}] executing step`);
        this.ethBalance = await this.account.provider.getBalance(this.account.address);
        try {
            await this._step();
        } catch (error) {
            this.consolelog(this.ethBalance, this.sbdBalance, this.sbrBalance);
            await this._printState();
            this.consolelog(this.stabilityPool);
            this.consolelog(await this.contracts.sbdToken.balanceOf(this.account.address));
            this.consolelog(await this.contracts.stabilityPool.getUser(this.account.address));
            await this.tracker.printState();
            throw error;
        }
    }

    async stakeSBD() {
        let stakeAmount = (((this.sbdBalance * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        this.consolelog("Staking SBD ", this.id, stakeAmount, this.sbdBalance);
        if (stakeAmount == BigInt(0) && Math.random() < 0.5) {
            stakeAmount = BigInt(1000);
            this.consolelog("Updating stake amount to ", stakeAmount);
        }
        if (stakeAmount > this.sbdBalance || stakeAmount == BigInt(0)) {
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stabilityPool.target, stakeAmount);
                await tx1.wait();
                const tx = await this.contracts.stabilityPool.connect(this.account).stake(stakeAmount);
                assert.fail("Stake SBD should have failed");
            } catch (error) {
                this.consolelog(error, "Stake SBD failed as expected");
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
                    this.consolelog(ex, "Stake SBD failed as expected");
                    //this.consolelog("Stake SBD failed as expected");
                }
            } else {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stabilityPool.target, stakeAmount);
                await tx1.wait();
                // Claim rewards beforehand
                const ethBalance = await this.account.provider.getBalance(this.account.address);
                const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
                this.consolelog("Pending rewards ", pendingRewards);
                const tx = await this.contracts.stabilityPool.connect(this.account).stake(stakeAmount);
                const detail = await tx.wait();
                const gas = detail.gasUsed * tx.gasPrice;
                this.sbdBalance = this.sbdBalance - stakeAmount;
                expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, totalPrecision);
                expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, totalPrecision);
                expect(ethBalance + pendingRewards[1] - gas).to.be.closeTo(await this.account.provider.getBalance(this.account.address), totalPrecision);
                this.stabilityPool.unclaimedRewards.sbr = pendingRewards[2];
                if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0) || pendingRewards[2] > BigInt(0)) {
                    await this.claimSbdRewards();
                    await this.claimCollateralGain();
                    await this.claimSbrRewards();
                }
                expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), totalPrecision);
                //expect(this.stabilityPool.stake + stakeAmount).to.equal(await this.contracts.stableBaseCDP.stabilityPoolStake());
                this.stabilityPool.stake += stakeAmount;
                const added = await this.tracker.addStabilityPoolStaker(this);
            }
            // Check SBD balance in contract
        }
    }

    async unstakeSBD() {
        let unstakeAmount = (((this.stabilityPool.stake * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        this.consolelog("Unstaking SBD ", this.id, unstakeAmount, this.stabilityPool.stake);
        if (unstakeAmount > this.stabilityPool.stake || unstakeAmount == BigInt(0)) {
            try {
                const tx = await this.contracts.stabilityPool.connect(this.account).unstake(unstakeAmount);
                assert.fail("Unstake SBD should have failed");
            } catch (error) {
                this.consolelog(error, "Unstake SBD failed as expected");
            }
        } else {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            this.consolelog("Claiming rewards, pending rewards, before unstaking..", pendingRewards, this.stabilityPool);
            const tx = await this.contracts.stabilityPool.connect(this.account).unstake(unstakeAmount);
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, totalPrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, totalPrecision);
            this.stabilityPool.unclaimedRewards.sbr = pendingRewards[2];
            if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0) || pendingRewards[2] > BigInt(0)) {
                await this.claimSbdRewards();
                await this.claimCollateralGain();
                await this.claimSbrRewards();
            }
            this.sbdBalance = this.sbdBalance + unstakeAmount;
            expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            expect(this.stabilityPool.stake - unstakeAmount).to.be.closeTo((await this.contracts.stabilityPool.getUser(this.account.address)).stake, aggregatePrecision);
            this.stabilityPool.stake -= unstakeAmount;
            await this.tracker.updateStabilityPoolStake(this);
        }
        // Check SBD balance in contract
    }

    async claimRewards() {
        this.consolelog("Claiming rewards ", this.id);
        if (this.stabilityPool.stake == BigInt(0)) {
            // No need to claim rewards
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, aggregatePrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, aggregatePrecision);
            this.consolelog("Claiming rewards, pending rewards: ", pendingRewards);
            const tx = await this.contracts.stabilityPool.connect(this.account).claim();
            const detail = await tx.wait();
            this.stabilityPool.unclaimedRewards.sbr = pendingRewards[2];
            if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0)) {
                await this.claimSbdRewards();
                await this.claimCollateralGain();
                await this.claimSbrRewards();
            }
        } else {
            const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address);
            this.consolelog("Claiming rewards, pending rewards: ", pendingRewards, this.stabilityPool);
            const tx = await this.contracts.stabilityPool.connect(this.account).claim();
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            //this.sbdBalance += pendingRewards[0];
            this.ethBalance += pendingRewards[1] - gas;
            expect(pendingRewards[0]).to.be.closeTo(this.stabilityPool.unclaimedRewards.sbd, totalPrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.stabilityPool.unclaimedRewards.eth, totalPrecision);
            this.stabilityPool.unclaimedRewards.sbr = pendingRewards[2];
            if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0) || pendingRewards[2] > BigInt(0)) {
                await this.claimSbdRewards();
                await this.claimCollateralGain();
                await this.claimSbrRewards();
            }
            expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), totalPrecision);
            //expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), totalPrecision);
        }
    }

    async stakeSBR() {
        this.sbrBalance = await this.contracts.sbrToken.balanceOf(this.account.address);
        let stakeAmount = (((this.sbrBalance * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        this.consolelog("Staking SBR ", this.id, stakeAmount, this.sbrBalance);
        if (stakeAmount == BigInt(0) && Math.random() < 0.5) {
            stakeAmount = BigInt(1000);
            this.consolelog("Updating stake amount to ", stakeAmount);
        }
        if (stakeAmount > this.sbrBalance || stakeAmount == BigInt(0)) {
            try {
                const tx1 = await this.contracts.sbrToken.connect(this.account).approve(this.contracts.sbrStaking.target, stakeAmount);
                await tx1.wait();
                const tx = await this.contracts.sbrStaking.connect(this.account).stake(stakeAmount);
                await tx.wait();
                assert.fail("Stake SBR should have failed");
            } catch (error) {
                this.consolelog(error, "Stake SBR failed as expected");
            }
        } else {
            if (Math.random < 0.3) {
                try {
                    const tx1 = await this.contracts.sbrToken.connect(this.account).approve(this.contracts.sbrStaking.target, BigInt(0));
                    await tx1.wait();
                    // Should fail because of insufficient allowance
                    const tx = await this.contracts.sbrStaking.connect(this.account).stake(stakeAmount);
                    await tx.wait();
                    assert.fail("Stake SBR should have failed");
                } catch (ex) {
                    //this.consolelog("Stake SBR failed as expected");
                }
            } else {
                const tx1 = await this.contracts.sbrToken.connect(this.account).approve(this.contracts.sbrStaking.target, stakeAmount);
                await tx1.wait();
                // Claim rewards beforehand
                const ethBalance = await this.account.provider.getBalance(this.account.address);
                const pendingRewards = await this.contracts.sbrStaking.userPendingReward(this.account.address);
                this.consolelog("Pending rewards ", pendingRewards);
                const tx = await this.contracts.sbrStaking.connect(this.account).stake(stakeAmount);
                const detail = await tx.wait();
                const gas = detail.gasUsed * tx.gasPrice;
                this.sbrBalance = this.sbrBalance - stakeAmount;
                this.sbrStaking.stake += stakeAmount;
                expect(pendingRewards[0]).to.be.closeTo(this.sbrStaking.unclaimedRewards.sbd, aggregatePrecision);
                expect(pendingRewards[1]).to.be.closeTo(this.sbrStaking.unclaimedRewards.eth, aggregatePrecision);
                if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0)) {
                    await this.claimSbdRewardsSBRStaking();
                    await this.claimCollateralGainSBRStaking();
                }    
                expect(this.sbrStaking.stake).equals((await this.contracts.sbrStaking.stakes(this.account.address)).stake);
                await this.tracker.updateSBRStake(this);
                this.consolelog("Successfully staked: ", stakeAmount);
            }
        }
    }

    consolelog(...args) {
        console.log(`[Step-${this.currentStep}]-[${new Date().toISOString()}] [${this.actorType} - ${this.id}]`, ...args);
    }

    async unstakeSBR() {
        let unstakeAmount = (((this.sbrStaking.stake * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000))/ BigInt(1e18)) * BigInt(1e18)) / BigInt(1000));
        this.consolelog("Unstaking SBR ", this.id, unstakeAmount, this.sbrStaking.stake);
        if (unstakeAmount > this.sbrStaking.stake || unstakeAmount == BigInt(0)) {
            try {
                const tx = await this.contracts.sbrStaking.connect(this.account).unstake(unstakeAmount);
                assert.fail("Unstake SBR should have failed");
            } catch (error) {
                this.consolelog(error, "Unstake SBR failed as expected");
            }
        } else {
            const pendingRewards = await this.contracts.sbrStaking.userPendingReward(this.account.address);
            const tx = await this.contracts.sbrStaking.connect(this.account).unstake(unstakeAmount);
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            expect(pendingRewards[0]).to.be.closeTo(this.sbrStaking.unclaimedRewards.sbd, aggregatePrecision);
            expect(pendingRewards[1]).to.be.closeTo(this.sbrStaking.unclaimedRewards.eth, aggregatePrecision);
            if (pendingRewards[0] > BigInt(0) || pendingRewards[1] > BigInt(0)) {
                await this.claimSbdRewardsSBRStaking();
                await this.claimCollateralGainSBRStaking();
            }
            this.sbrBalance = this.sbrBalance + unstakeAmount;
            this.sbrStaking.stake -= unstakeAmount;
            expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            expect(this.sbrStaking.stake).equals((await this.contracts.sbrStaking.stakes(this.account.address)).stake);
            await this.tracker.updateSBRStake(this);
        }
    }

    async sendSbdToMarket() {
        const totalBalance = await this.contracts.sbdToken.balanceOf(this.account.address);
        const tx = await this.contracts.sbdToken.connect(this.account).transfer(this.market.account.address, totalBalance);
        await tx.wait();
    }

    async tearDownStep1() {
        try {
            // Claim all rewards
            const tx1 = await this.contracts.stabilityPool.connect(this.account).claim();
            await tx1.wait();

            const tx2 = await this.contracts.sbrStaking.connect(this.account).claim();
            await tx2.wait();

            // Unstake all SBD
            const user = await this.contracts.stabilityPool.getUser(this.account.address);
            if (user.stake > BigInt(0)) {
                const tx3 = await this.contracts.stabilityPool.connect(this.account).unstake(user.stake);
                await tx3.wait();
            }

            // Send All SBD to market
            await this.sendSbdToMarket();
        } catch (e) {
            this._printState();
            this.tracker._printState();
            throw e;
        }
    }
}

class Hacker extends Actor {
    constructor(account, initialBalance, contracts, market, tracker, borrowers, actors) {
        super("Hacker", account, initialBalance, contracts, market, tracker);
        this.currentStep = 0;
        this.borrowers = [...borrowers];
        this.actors =[...actors];
    }
    async _step() {
        this.borrowers = shuffleArray(this.borrowers);
        this.actors = shuffleArray(this.actors);
        if (this.sbdBalance == BigInt(0) && Math.random() < 0.1) {
            await this.buySBD();
        }
        if (Math.random() < 0.01) {
            // borrow from an existing safe
            const borrower = this.borrowers[0];
            if (borrower.safe.collateral > BigInt(0)) {
                try {
                    this.consolelog("Borrowing as ", borrower.id, borrower.safeId);
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(borrower.safeId, BigInt(2000 * 10 ** 18), BigInt(10), BigInt(0), BigInt(0));
                    const detail = await tx.wait();
                } catch (e) {
                    this.consolelog("Failed as expected", e);
                    expect(e.message).to.contain.oneOf(["OwnableUnauthorizedAccount", "ERC721NonexistentToken", "Not the owner"]);
                    return;
                }
                assert.fail("Expected to fail");
            }   
        }
        if (Math.random() < 0.01) {
            // borrow from an existing safe
            const borrowers = this.borrowers.filter((b) =>(b.safe.borrowedAmount == BigInt(0) && b.safe.collateral > BigInt(0)));
            if (borrowers.length > 0) {
                const borrower = borrowers[0];
                try {
                    this.consolelog("Try to close a safe", borrower.id, borrower.safeId);
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).closeSafe(borrower.safeId);
                    const detail = await tx.wait();
                } catch (e) {
                    this.consolelog("Failed as expected", e);
                    expect(e.message).to.contain.oneOf(["ERC721NonexistentToken", "Not the owner"]);
                    return;
                }
                assert.fail("Expected to fail");
            }   
        }
        if (Math.random() < 0.01) {
            // Repay a loan
            const borrower = this.borrowers[0];
            this.consolelog("Repaying as ", borrower.id, borrower.safeId);
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(borrower.safeId, BigInt(2000 * 10 ** 18), BigInt(0));
                const detail = await tx.wait();
            } catch (e) {
                this.consolelog("Failed as expected", e);
                expect(e.message).to.contain.oneOf(["OwnableUnauthorizedAccount", "ERC721NonexistentToken", "Not the owner"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // Liquidate a safe
            const borrower = this.borrowers[0];
            try {
                this.consolelog("Attempting to withdraw collateral ", borrower.id, borrower.safeId);
                const toWithdraw = (BigInt(Math.floor(Math.random() * 10000)) * borrower.safe.collateral) / BigInt(10000);
                const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(borrower.safeId, toWithdraw, BigInt(0));
                const detail = await tx.wait();
            } catch (e) {
                this.consolelog("Failed as expected", e);
                expect(e.message).to.contain.oneOf(["OwnableUnauthorizedAccount", "ERC721NonexistentToken", "Not the owner"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // Liquidate a safe
            const borrower = this.borrowers[0];
            try {
                const collateralValue = (borrower.safe.collateral + borrower.safe.pending.collateral) * this.market.collateralPrice;
                if (collateralValue > ((borrower.safe.debt + borrower.safe.pending.debt) * BigInt(11000)) / BigInt(10000)) {
                    this.consolelog("Attempting to liquidate ", borrower.id, borrower.safeId, collateralValue, borrower.safe.debt, borrower.safe.pending.debt);
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).liquidateSafe(borrower.safeId);
                    const detail = await tx.wait();
                } else {
                    return;
                }
            } catch (e) {
                this.consolelog("Failed as expected", e);
                expect(e.message).to.contain.oneOf(["Can't liquidate yet", "Safe does not exist", "Cannot liquidate a Safe with no borrowed amount"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // TransferFrom DFID tokens on behalf of another person
            const actor = this.actors[0];
            try {
                this.consolelog("Attempting to transfer DFID tokens from ", actor.id, this.id);
                const tx = await this.contracts.sbdToken.connect(this.account).transferFrom(actor.account.address, this.account.address, BigInt(1 * 10 ** 18));
                const detail = await tx.wait();
            } catch (e) {
                this.consolelog("Failed as expected", e);
                expect(e.message).to.contain.oneOf(["ERC20InsufficientAllowance"]);
                return;
            }
            assert.fail("SBD TransferFrom Expected to fail");
        }
        if (Math.random() < 0.01) {
            // TransferFrom DFIRE tokens on behalf of another person
            const actor = this.actors[0];
            try {
                this.consolelog("Attempting to transfer DFIRE tokens from ", actor.id, this.id);
                const tx = await this.contracts.sbrToken.connect(this.account).transferFrom(actor.account.address, this.account.address, BigInt(1 * 10 ** 18));
                const detail = await tx.wait();
            } catch (e) {
                this.consolelog("Failed as expected", e);
                expect(e.message).to.contain.oneOf(["ERC20InsufficientAllowance"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // TransferFrom Safe from another user
            const borrower = this.borrowers[0];
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).transferFrom(borrower.account.address, this.account.address, borrower.safeId);
                const detail = await tx.wait();
            } catch (ex) {
                this.consolelog("Failed as expected", ex);
                expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount", "ERC721NonexistentToken", "ERC721InsufficientApproval"]);
                return;
            }
        } 
        if (Math.random() < 0.01) {
            // Mint new DFID / DFIRE tokens
            try {
                this.consolelog("Attempting to mint DFID tokens");
                const tx = await this.contracts.sbdToken.connect(this.account).mint(this.account.address, BigInt(1 * 10 ** 18));
                const detail = await tx.wait();
            } catch (ex) {
                this.consolelog("Failed as expected", ex);
                expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // Mint new DFID / DFIRE tokens
            try {
                this.consolelog("Attempting to mint DFIRE tokens");
                const tx = await this.contracts.sbrToken.connect(this.account).mint(this.account.address, BigInt(1 * 10 ** 18));
                const detail = await tx.wait();
            } catch (ex) {
                this.consolelog("Failed as expected", ex);
                expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // Burn DFID / DFIRE tokens
            if (this.sbdBalance > BigInt(0)) {
                try {
                    this.consolelog("Attempting to burn DFID tokens");
                    const tx = await this.contracts.sbdToken.connect(this.account).burn(this.account.address, BigInt(1 * 10 ** 18));
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
        }
        if (Math.random() < 0.01) {
            // Burn DFID / DFIRE tokens
            if (this.sbdBalance > BigInt(0)) {
                try {
                    this.consolelog("Attempting to burn DFID tokens");
                    const tx = await this.contracts.sbrToken.connect(this.account).burn(this.account.address, BigInt(1 * 10 ** 18));
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
        }
        if (Math.random() < 0.01) {
            // Transfer ownership of a safe
            const borrower = this.borrowers[0];
            try {
                this.consolelog("Attempting to transfer ownership of safe ", borrower.id, this.id);
                const tx = await this.contracts.stableBaseCDP.connect(this.account).approve(this.account.address, borrower.safeId);
                const detail = await tx.wait(); 
            } catch (ex) {
                this.consolelog("Failed as expected", ex);
                expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount", "ERC721NonexistentToken", "ERC721InvalidApprover"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.01) {
            // Call performLiquidation function in stability pool
            try {
                this.consolelog("Attempting to call performLiquidation");
                const tx = await this.contracts.stabilityPool.connect(this.account).performLiquidation(BigInt(10000), BigInt(10000), {value: BigInt(10000)});
                const detail = await tx.wait();
            } catch (ex) {
                this.consolelog("Failed as expected", ex);
                expect(ex.message).to.contain.oneOf(["Caller is not the debt contract"]);
                return;
            }
            assert.fail("Expected to fail");
        }
        if (Math.random() < 0.02) {
            // Call setAddresses function on different contracts
            if (Math.random() < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in stability pool");
                    const tx = await this.contracts.stabilityPool.connect(this.account).setAddresses(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in SBR staking");
                    const tx = await this.contracts.sbrStaking.connect(this.account).setAddresses(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in SBD token");
                    const tx = await this.contracts.sbdToken.connect(this.account).setAddresses(ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in SBR token");
                    const tx = await this.contracts.sbrToken.connect(this.account).setAddresses(ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in stablebase cdp");
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).setAddresses(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in redemption queue");
                    const tx = await this.contracts.redemptionQueue.connect(this.account).setAddresses(ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random < 0.1) {
                try {
                    this.consolelog("Attempting to call setAddresses in liquidation queue");
                    const tx = await this.contracts.liquidationQueue.connect(this.account).setAddresses(ethers.ZeroAddress);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
        }
        if (Math.random() < 0.01) {
            // Call setCanReceiveStakingRewards on stablebase cdp contracts
            if (Math.random() < 0.4) {
                try {
                    this.consolelog("Attempting to call setCanReceiveStakingRewards (stabilitypool) in stablebase cdp");
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).setCanStabilityPoolReceiveRewards(false);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["Only stability pool"]);
                    return;
                }
                assert.fail("Expected to fail");
            } else {
                try {
                    this.consolelog("Attempting to call setCanReceiveStakingRewards (sbrStaking) in stablebase cdp");
                    const tx = await this.contracts.stableBaseCDP.connect(this.account).setCanSBRStakingPoolReceiveRewards(true);
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["Only DFire Staking"]);
                    return;
                }
                assert.fail("Expected to fail");
            } 
        }
        if (Math.random() < 0.01) {
            // Call delete function in liquidation or redemption queue
            const queue = Math.random() < 0.5 ? this.contracts.liquidationQueue : this.contracts.redemptionQueue;
            if (Math.random() < 0.5) {
                try {
                    const head = await queue.getHead();
                    if (head != BigInt(0)) {
                        this.consolelog("Attempting to delete head from queue ", queue.address, head);
                        const tx = await queue.connect(this.account).remove(head);
                        const detail = await tx.wait();
                    } else {
                        return ;
                    }
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
            if (Math.random() < 0.5) {
                try {
                    this.consolelog("Attempting to insert data to queue ", queue.address, BigInt(1));
                    const tx = await queue.connect(this.account).upsert(BigInt(1), BigInt(1), BigInt(0));
                    const detail = await tx.wait();
                } catch (ex) {
                    this.consolelog("Failed as expected", ex);
                    expect(ex.message).to.contain.oneOf(["OwnableUnauthorizedAccount"]);
                    return;
                }
                assert.fail("Expected to fail");
            }
        }
    }
    async _printState() {
        this.consolelog("Printing state for hacker");
    }
}

class Borrower extends Actor {
    constructor(account, initialBalance, contracts, market, tracker) {
        super("Borrower", account, initialBalance, contracts, market, tracker);
        this.safeId = ethers.solidityPackedKeccak256(["address", "address"], [account.address, ethers.ZeroAddress]);
        this.safe = {
            collateral: BigInt(0),
            debt: BigInt(0),
            totalBorrowedAmount: BigInt(0),
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
        const safe = await this.contracts.stableBaseCDP.safes(this.safeId);
        if (result[0] > BigInt(0) || result[1] > BigInt(0)) {
            this.consolelog("Applying pending collateral and debt ", result[0], result[1]);
            const pendingDebtIncrease=  this.safe.pending.debt;
            const pendingCollateralIncrease = this.safe.pending.collateral;
            expect(pendingDebtIncrease).to.be.closeTo(result[0], aggregatePrecision);
            expect(pendingCollateralIncrease).to.be.closeTo(result[1], aggregatePrecision);
            this.safe.collateral = result[1] + safe.collateralAmount;
            this.safe.pending.collateral = BigInt(0);
            this.safe.debt = result[0] + safe.borrowedAmount;
            this.safe.pending.debt = BigInt(0);
            this.safe.totalBorrowedAmount = safe.totalBorrowedAmount + result[0];
            await this.tracker.increaseDebtAndCollateral(pendingDebtIncrease, pendingCollateralIncrease);
        }
        return this.safe;
    }

    async openSafe() {
        this.consolelog("Opening safe for ", this.safeId, this.id);
        ///this.consolelog("Account balance: ", this.account, );
        try {
            if ((await this.contracts.stableBaseCDP.ownerOf(this.safeId)) != ethers.ZeroAddress) {
                return;
            }
        } catch (err) {
            // For now do nothing
        }
        let collateralAmount = (((this.ethBalance / BigInt(1e18)) * BigInt(1e18)) * BigInt(Math.floor(getRandomInRange(0.001, 0.01) * 1000))) / BigInt(1000);
        this.consolelog("OPening safe with collateral ", collateralAmount);
        if (collateralAmount == BigInt(0)) { 
            collateralAmount = BigInt(1 * 10 ** 18);
        }
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
        this.consolelog("Borrowing  ", borrowAmount);
        let collateralValue = (this.safe.collateral + this.safe.pending.collateral) * this.market.collateralPrice;
        if (((this.safe.debt + borrowAmount + this.safe.pending.debt) * BigInt(11000)) > (collateralValue * BigInt(10000)) || (this.safe.pending.debt + this.safe.debt + borrowAmount) < await this.contracts.stableBaseCDP.MINIMUM_DEBT()) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, BigInt(0), BigInt(0));
                assert.fail("Borrow should have failed");
            } catch (error) {
                this.consolelog(error, "Borrow failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).borrow(this.safeId, borrowAmount, this.shieldingRate, this.tracker.getRandomSpot(), this.tracker.getRandomSpot());
            const detail = await tx.wait();
            this.safe.debt += borrowAmount;
            this.safe.totalBorrowedAmount += borrowAmount;
            const shieldingFee = (borrowAmount * this.shieldingRate) / BigInt(10000);
            this.sbdBalance = this.sbdBalance + borrowAmount - shieldingFee;
            const refund = await this.tracker.distributeShieldingFee(shieldingFee);
            this.sbdBalance += refund;
            this.consolelog("Borrowed ", borrowAmount, " shielding fee ", shieldingFee, this.shieldingRate," refund ", refund);
            //expect(this.sbdBalance).to.equal(await this.contracts.sbdToken.balanceOf(this.account.address));
            // Check fees refund, fee paid to stability pool, fee paid to SBR stakers, debt and collateral in contract
        }
    }

    async repay() {
        if (this.safe.debt === BigInt(0)) {
            return;
        }
        const repayAmount = (((this.safe.debt * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) ) / BigInt(1e18) ) * BigInt(1e18)) / BigInt(1000);
        this.consolelog("Repaying ", repayAmount);
        if (repayAmount > this.sbdBalance || ((this.safe.debt + this.safe.pending.debt - repayAmount) < await this.contracts.stableBaseCDP.MINIMUM_DEBT())) {
            // this should fail
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, this.tracker.getRandomSpot());
                const txDetail = await tx.wait();
                assert.fail(`Repay should have failed ${repayAmount} ${this.sbdBalance} ${this.safe.debt}`);
            } catch (error) {
                this.consolelog(error, "Repay failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, repayAmount);
                await tx1.wait();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, repayAmount, this.tracker.getRandomSpot());
            const detail = await tx.wait();
            this.safe.debt -= repayAmount;
            this.sbdBalance -= repayAmount;
            // Check debt and collateral in contract
        }
    }

    async setSafeClosed() {
        this.safe.collateral = BigInt(0);
        this.safe.debt = BigInt(0);
    }

    async withdrawCollateral() {
        const withdrawAmount = ((this.safe.collateral * BigInt(Math.floor(getRandomInRange(0.1, 1) * 1000)) / BigInt(1e18)) * BigInt(1e18)) / BigInt(1000);
        this.consolelog("Withdrawing collateral ", withdrawAmount);
        const collateralValue = (this.safe.collateral + this.safe.pending.collateral) * this.market.collateralPrice;
        const withdrawValue = withdrawAmount * this.market.collateralPrice;
        if ((this.safe.collateral == BigInt(0)) || (collateralValue  - withdrawValue) < (((this.safe.debt + this.safe.pending.debt) * BigInt(11000)) / BigInt(10000))) {
            // this should fail
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, this.tracker.getRandomSpot());
                const detail = await tx.wait();
                assert.fail("Withdraw should have failed");
            } catch (error) {
                this.consolelog(error, "Withdraw failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const collateralValue = this.safe.collateral * this.market.collateralPrice;
            const withdrawValue = withdrawAmount * this.market.collateralPrice;
            if ((collateralValue - withdrawValue) < (this.safe.debt * BigInt(1100) / BigInt(1000))) {
                this.consolelog("Can't withdraw collateral at this time");
                return ;
            }
            const tx = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, withdrawAmount, this.tracker.getRandomSpot());
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            this.safe.collateral -= withdrawAmount;
            expect(this.ethBalance + withdrawAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
            // Check collateral in contract
        }
    }

    async addCollateral() {
        this.ethBalance = await this.account.provider.getBalance(this.account.address);
        const addAmount = ((this.ethBalance * BigInt(Math.floor(getRandomInRange(0.1, 0.9) * 1000)) / BigInt(1e18)) * BigInt(1e18)) / BigInt(1000);
        this.consolelog("Adding collateral ", addAmount);
        if (addAmount >= this.ethBalance) {
            console.log("Not enough balance to add collateral");
            return;
        }
        if (this.safe.collateral == BigInt(0)) {
            try {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).addCollateral(this.safeId, addAmount, this.tracker.getRandomSpot(), { value: addAmount });
                assert.fail("Add collateral should have failed");
            } catch (ex) {
                this.consolelog(ex, "Add collateral failed as expected");
            }
        } else {
            await this.activatePendingCollateralAndDebt();
            const tx = await this.contracts.stableBaseCDP.connect(this.account).addCollateral(this.safeId, addAmount, this.tracker.getRandomSpot(), { value: addAmount });
            const detail = await tx.wait();
            const gas = detail.gasUsed * tx.gasPrice;
            this.safe.collateral += addAmount;
            expect(this.ethBalance - addAmount - gas).to.equal(await this.account.provider.getBalance(this.account.address));
            expect(this.safe.collateral).to.be.closeTo((await this.contracts.stableBaseCDP.safes(this.safeId)).collateralAmount, aggregatePrecision);
        }
        // Check collateral in
    }

    async topupFee() {
        let topupFee = (this.safe.debt * this.shieldingRate) / BigInt(10000);
        this.consolelog("Paying topup fee ", topupFee, this.safe.debt, this.sbdBalance, this.shieldingRate);
        if (this.safe.collateral == BigInt(0) || this.sbdBalance < topupFee || topupFee == BigInt(0)) {
            try {
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, topupFee);
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, this.tracker.getRandomSpot());
                assert.fail("Topup fee should have failed");
            } catch (error) {
                this.consolelog(error, "Topup fee failed as expected");
            }
        } else {
            try {
                const tx1= await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, BigInt(0));
                await tx1.wait();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, this.tracker.getRandomSpot());
                assert.fail("This should have failed");
            } catch (ex) {
                await this.activatePendingCollateralAndDebt();
                topupFee = (this.safe.debt * this.shieldingRate) / BigInt(10000);
                this.consolelog("Paying topup fee ", topupFee, this.safe.debt, this.sbdBalance, this.shieldingRate);
                if (topupFee > this.sbdBalance) {
                    this.consolelog("Adjusting position in the safe instead of paying topup fee at this point.");
                    const tx1 = await this.contracts.stableBaseCDP.connect(this.account).adjustPosition(this.safeId, this.tracker.getRandomSpot());
                    await tx1.wait();
                    return;
                }
                //expect(this.safe.debt).to.equal((await this.contracts.stableBaseCDP.safes(this.safeId)).borrowedAmount);
                const tx1= await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, topupFee);
                await tx1.wait();
                await this.tracker.verifyStakerPendingRewards();
                const tx = await this.contracts.stableBaseCDP.connect(this.account).feeTopup(this.safeId, this.shieldingRate, this.tracker.getRandomSpot());
                const detail = await tx.wait();
                const refund = await this.tracker.distributeShieldingFee(topupFee);
                this.consolelog("Paid topup fee ", topupFee, refund);
                this.sbdBalance = this.sbdBalance - topupFee + refund;
                expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
            }
            // Check debt in contract
        }
    }

    async tearDownStep2() {
        try {
            console.log("Tearing down ", this.safeId, this.account.address);
            let safe = await this.contracts.stableBaseCDP.safes(this.safeId);
            if (safe.collateralAmount > BigInt(0)) {
                const tx = await this.contracts.stableBaseCDP.connect(this.account).adjustPosition(this.safeId, BigInt(0));
                await tx.wait();
            } 
            safe = await this.contracts.stableBaseCDP.safes(this.safeId);
            console.log("Safe: ", safe);
            if (safe.collateralAmount > BigInt(0) && safe.borrowedAmount > BigInt(0)) {
                // acquire SBD needed to repay the loan
                const paid = await this.market.getSBD(this, safe.borrowedAmount);
                // Repay the loan
                const tx1=await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, paid);
                await tx1.wait();
                console.log("Repaying ", safe.borrowedAmount, paid);
                try {
                    const tx2 = await this.contracts.stableBaseCDP.connect(this.account).repay(this.safeId, paid, this.tracker.getRandomSpot());
                    await tx2.wait();
                    console.log("Repaying done");
                    const coll = (paid) / this.market.collateralPrice;
                    const tx3 = await this.contracts.stableBaseCDP.connect(this.account).withdrawCollateral(this.safeId, coll, this.tracker.getRandomSpot());
                    await tx3.wait();
                    console.log("Withdraw collateral done");
                    const tx4= await this.contracts.stableBaseCDP.connect(this.account).closeSafe(this.safeId);
                    await tx4.wait();
                    console.log("Safe closed");
                } catch (ex1) {
                    // This should fail for only one last safe.
                    this.consolelog("Failed: ", ex1);
                }
            } else {
                // Do nothing
            }
        } catch (ex) {
            this._printState();
            this.tracker.printState();
            throw ex;
        }
        
        // Withdraw all remaining collateral
    }

    async _printState() {
        this.consolelog("Borrower state ", this.safeId, this.safe);
        this.consolelog("Safe: ", await this.contracts.stableBaseCDP.safes(this.safeId));
        this.consolelog("Safe pending collateral and debt: ", await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(this.safeId));
        this.consolelog("Stability Pool State: ", this.stabilityPool);
        this.consolelog("Stability Pool state for user: ", await this.contracts.stabilityPool.getUser(this.account.address));
        this.consolelog("Stability Pool Reward State: ", await this.contracts.stabilityPool.userPendingRewardAndCollateral(this.account.address));
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
        if (Math.random() < 0.03) {
            await this.stakeSBR();
            return;
        }
        if (Math.random() < 0.03) {
            await this.unstakeSBR();
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
        if (collateralValue < ((safe.borrowedAmount * BigInt(11000)) / BigInt(10000))) {
            // liquidate
            this.consolelog("Attempting to liquidate ", safeId);
            const updatedSafe = await this.tracker.activatePendingCollateralAndDebt(safeId);
            const safeBeforeLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
            this.consolelog("Safe before liquidation: ", safeBeforeLiquidation);
            this.consolelog("Total debt/collateral", await this.contracts.stableBaseCDP.totalDebt(), await this.contracts.stableBaseCDP.totalCollateral(), this.tracker.totalDebt, this.tracker.totalCollateral);
            const tx = await this.contracts.stableBaseCDP.connect(this.account).liquidate();
            const txDetail = await tx.wait();
            const gas = txDetail.gasUsed * tx.gasPrice;
            let gasCompensation = BigInt(0);
            txDetail.logs.forEach(log => {
                //this.consolelog("Log: ", log);
                try {
                    const event = this.contracts.stableBaseCDP.interface.parseLog(log);
                    //this.consolelog("Event: ", event);
                    if (event.name == "LiquidationGasCompensationPaid") {
                            this.consolelog("Gas compensation for liquidation: ", event.args.feePaid, event.args.gasCompensated, txDetail.gasUsed, tx.gasPrice, txDetail.gasUsed * tx.gasPrice);
                            gasCompensation = event.args.feePaid;
                    }
                    if (event.name == 'SafeUpdated') {
                         this.consolelog("Safe updated: ", event.args);
                         expect(event.args.collateralAmount).to.be.closeTo(updatedSafe.collateral, aggregatePrecision);
                         expect(event.args.debtAmount).to.be.closeTo(updatedSafe.debt, aggregatePrecision);
                    }
                } catch (ex) {
                }
            });
            // Check debt and collateral in contract
            // Adjust stakes, rewards, etc.
            const safeAfterLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
            expect(safeAfterLiquidation.borrowedAmount).to.equal(BigInt(0));
            expect(safeAfterLiquidation.collateralAmount).to.equal(BigInt(0));
            //safe.borrowedAmount = updatedSafe.debt;
            //safe.collateralAmount = updatedSafe.collateral;
            const safeCopy = {
                collateralAmount: updatedSafe.collateral,
                borrowedAmount: updatedSafe.debt,
                feePaid: safe.feePaid,
                weight: safe.weight,
                totalBorrowedAmount: updatedSafe.totalBorrowedAmount
            };
            this.consolelog("Updated Safe:", safeCopy, safe);
            const liquidationFee = safeCopy.collateralAmount * (await this.contracts.stableBaseCDP.REDEMPTION_LIQUIDATION_FEE()) / BigInt(10000);
            const refund = await this.tracker.liquidate(safeCopy, safeId, liquidationFee, gasCompensation);
            //this.ethBalance += refund;
            //expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), ethers.parseUnits("0.1", 18));

        } else if (Math.random() < 0.05) {
            this.consolelog("Attempting to liquidate ", safeId);
            try {
                const safeBeforeLiquidation = await this.contracts.stableBaseCDP.safes(safeId);
                this.consolelog("Safe before liquidation: ", safeBeforeLiquidation);
                const tx = await this.contracts.stableBaseCDP.connect(this.account).liquidate();
                const txDetail = await tx.wait();
                assert.fail("Liquidation should have failed");
            } catch (ex) {
                this.consolelog(ex, "Liquidation failed as expected");
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
            const updatedSafe = await this.tracker.activatePendingCollateralAndDebt(safeId);
            //this.consolelog("Redeeming safe: ", safeId);
            const safe = await this.contracts.stableBaseCDP.safes(safeId);
            const safeCopy = {
                collateralAmount: updatedSafe.collateral,
                borrowedAmount: updatedSafe.debt,
                feePaid: safe.feePaid,
                weight: safe.weight,
                totalBorrowedAmount: updatedSafe.totalBorrowedAmount
            };

            //this.consolelog("Safe: ", safeCopy);
            const collateralValue = safe.collateralAmount * this.market.collateralPrice;
            const borrowedAmount = safe.borrowedAmount;
            const feePaid = safe.feePaid;
            const collateralPrice = await this.contracts.priceOracle.fetchPrice();
            const result = await this.contracts.stableBaseCDP.calculateRedemptionAmountsAndFee(safeCopy, amountToRedeem, collateralPrice);
            //this.consolelog("Redeem result: ", result);
            expect(this.validateRedeemParams(safe, result, amountToRedeem, this.market.collateralPrice)).to.be.true;
            redeemedSafes.push({
                safeId,
                safe: safeCopy,
                params: result
            });
            const safeNode = await this.contracts.redemptionQueue.getNode(safeId);
            safeId = safeNode.next;
            amountToRedeem = amountToRedeem - (result[2] + result[3]);
            this.consolelog("Collateral to redeem, Amount to redeem, amount redeemed from safe, refunded", result[1], amountToRedeem, result[2], result[3]);
        } while (amountToRedeem > BigInt(0));
        this.consolelog("RedeemedSafes: ", redeemedSafes);
        return redeemedSafes;
    }

    async redeem() {

        if (this.market.sbdPrice < BigInt(9900) && await this.contracts.stableBaseCDP.PROTOCOL_MODE() != BigInt(0)) {
            const redeemAmount = this.sbdBalance / BigInt(2);
            this.consolelog(this.market.sbdPrice, "Redeeming ", redeemAmount);
            // Redeem half of the available SBD
            if (this.sbdBalance > BigInt(0)) {
                // Calculate expected collateral return, fees, etc.
                const ethBal = await this.account.provider.getBalance(this.account.address);
                this.ethBalance = ethBal;
                let redeemedSafes;
                try {
                    redeemedSafes = await this.getRedeemedSafes(redeemAmount);
                } catch (ex) {
                    this.consolelog("Unable to redeem because of insufficient collateral requirements", ex);
                    return ;
                }
                const tx1 = await this.contracts.sbdToken.connect(this.account).approve(this.contracts.stableBaseCDP.target, redeemAmount);
                let detail = await tx1.wait();
                let gasUsed = detail.gasUsed * tx1.gasPrice;
                const tx = await this.contracts.stableBaseCDP.connect(this.account).redeem(redeemAmount, BigInt(0));
                detail = await tx.wait();
                try {
                    let redeemerFee = BigInt(0);
                    let ownerFee = BigInt(0);
                    detail.logs.forEach(log => {
                        try {
                            const event = this.contracts.stableBaseCDP.interface.parseLog(log);
                            this.consolelog("Event: ", event.name, event.args);
                            if (event.name == 'RedeemerFeePaid') {
                                redeemerFee += event.args.feePaid;
                            }
                            if (event.name == 'OwnerFeePaid') {
                                ownerFee += event.args.feePaid;
                            }
                        } catch (ex) {
                            // Do nothing
                        }
                    });
                    gasUsed += detail.gasUsed * tx.gasPrice;
                    this.sbdBalance -= redeemAmount;
                    // adding total collateral redeemed
                    this.ethBalance += redeemedSafes.reduce((acc, safe) => acc + safe.params[1], BigInt(0));
                    // - tx fees
                    this.ethBalance -= gasUsed;
                    // - redemption fees paid
                    this.ethBalance -= redeemedSafes.reduce((acc, safe) => acc + safe.params[5], BigInt(0));
                    expect(this.sbdBalance).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.account.address), aggregatePrecision);
                    expect(this.ethBalance).to.be.closeTo(await this.account.provider.getBalance(this.account.address), ethers.parseEther("0.1"));
                    await this.tracker.updateRedeemedSafes(redeemedSafes, redeemerFee, ownerFee);
                } catch (ex) {
                    detail.logs.forEach(log => {
                        try {
                            const event = this.contracts.stableBaseCDP.interface.parseLog(log);
                            this.consolelog("Event: ", event.name, event.args);
                        } catch (ex) {
                            // Do nothing
                        }
                    });
                    throw ex;
                }
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
      this.currentStep = 0;
      this.consolelog("Market initial balance: ", this.ethBalance);
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

    async getSBD(caller, sbdAmount) {
        const balance = await this.contracts.sbdToken.balanceOf(this.account.address);
        if (balance > sbdAmount) {
            const tx = await this.contracts.sbdToken.connect(this.account).transfer(caller.account.address, sbdAmount);
            await tx.wait();
            return sbdAmount;
        } else if (balance > BigInt(0)) {
            const tx = await this.contracts.sbdToken.connect(this.account).transfer(caller.account.address, balance);
            this.consolelog(`Insufficient SBD balance ${balance} ${sbdAmount} in the market`);
            return balance;
        } else {
            this.consolelog(`Insufficient SBD balance ${balance} ${sbdAmount} in the market`);
            return BigInt(0);
        }
    }

    async fluctuateCollateralPrice(factor) {
        const f = Math.floor(factor * 1000);
        const rand = (Math.floor(getRandomInRange(0, 2 * factor) * 1000));
        this.consolelog("Fluctuating collateral price ", factor, f, rand);
        this.collateralPrice = (this.collateralPrice * BigInt((1000 - f) + rand)) / BigInt(1000); // ±2% fluctuation
        this.sbdPrice = (this.sbdPrice * BigInt((BigInt(1000) + BigInt(f) / BigInt(8)) - BigInt(rand) / BigInt(8))) / BigInt(1000); // ±2% fluctuation
    }

    consolelog(...args) {
        console.log(`[Step-${this.currentStep}]-[${new Date().toISOString()}] [${this.actorType} - ${this.id}]`, ...args);
    }
  
    async step(stepNum) {
        this.currentStep = stepNum;
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
        this.consolelog("Collateral price: ", this.collateralPrice);
        this.consolelog("SBD price: ", this.sbdPrice);
       //await this.fluctuateCollateralPrice();
       const tx = await this.contracts.priceOracle.setPrice(this.collateralPrice);
    await tx.wait();
       
    }

     async printState() {
        this.consolelog("Market state: ", this.ethBalance, this.collateralPrice, this.sbdPrice);
     }
  }

// A tracker agent to compute and verify the protocol's state offline, used to ensure protocol works as expected
class OfflineProtocolTracker extends Agent {
  constructor(contracts, market, actors, borrowerList) {
    super();
    this.contracts = contracts;
    this.actors = actors;
    this.borrowers = {};
    this.borrowerList = borrowerList;
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
        rewardLoss: BigInt(0),
        ethLoss: BigInt(0),
        totalRewards: {
            sbd: BigInt(0),
            eth: BigInt(0)
        }
    }
    this.safeMapping = {};
    this.currentStep = 0;
  }

  async addBorrower(borrowerAgent) {
    this.borrowers[borrowerAgent.id] = borrowerAgent;
    this.safeMapping[BigInt(borrowerAgent.safeId)] = borrowerAgent;
  }

  async removeBorrower(borrowerAgent) {
    delete this.borrowers[borrowerAgent.id];
    delete this.safeMapping[BigInt(borrowerAgent.safeId)];
  }

  async updateSBRStake(staker) {
     if (staker.sbrStaking.stake == BigInt(0)) {
        this.sbrStaking.stakers = this.sbrStaking.stakers.filter(s => s != staker);
     } else if (staker.sbrStaking.stake > BigInt(0) && this.sbrStaking.stakers.filter(s => s.id == staker.id).length == 0) {
        this.sbrStaking.stakers.push(staker);
     }
     this.sbrStaking.totalStake = this.sbrStaking.stakers.reduce((acc, s) => acc + s.sbrStaking.stake, BigInt(0));
  }

  async activatePendingCollateralAndDebt(safeId) {
    const borrower = this.safeMapping[BigInt(safeId)];
    return await borrower.activatePendingCollateralAndDebt();
  }

  async addStabilityPoolStaker(staker) {
    if (this.stabilityPool.stakers.filter(s => s.id == staker.id).length == 0) {
        this.stabilityPool.stakers.push(staker);
    }
    this.stabilityPool.totalStake = this.stabilityPool.stakers.reduce((acc, s) => acc + s.stabilityPool.stake, BigInt(0));
  }

  async updateStabilityPoolStake(staker) {
    if (staker.stabilityPool.stake == BigInt(0)) {
        this.stabilityPool.stakers = this.stabilityPool.stakers.filter(s => s.id != staker.id);
    }
    this.stabilityPool.totalStake = this.stabilityPool.stakers.reduce((acc, s) => acc + s.stabilityPool.stake, BigInt(0));
  }

  async increaseDebtAndCollateral(debt, collateral) {
    this.totalCollateral += collateral;
    this.totalDebt += debt;
  }

  async liquidate(safe, safeId, liquidationFee, gasCompensated) { 
     const borrowAmount = safe.borrowedAmount;
     const collateralAmount = safe.collateralAmount;
     const fee = liquidationFee;
     this.totalCollateral -= collateralAmount;
     this.totalDebt -= borrowAmount;
     let refund = BigInt(0);
     if (this.stabilityPool.totalStake >= borrowAmount) {
        const checkState = this.sbrStaking.totalStake > BigInt(0) ? true : false;
        await this.distributeCollateralGainsToStabilityPoolStakers(collateralAmount - fee, "liquidation-collateral", checkState);
        const totalStake = this.stabilityPool.totalStake;
        const scalingFactor =  ((totalStake - borrowAmount) * BigInt(1e27)) / totalStake;
        let totalStakeAfterLiquidation = BigInt(0);
        for (const staker of this.stabilityPool.stakers) {
            staker.stabilityPool.stake = (staker.stabilityPool.stake * scalingFactor) / BigInt(1e27);
            totalStakeAfterLiquidation += staker.stabilityPool.stake;
        }
        this.stabilityPool.totalStake -= borrowAmount;
        this.stabilityPool.stakeLoss += (this.stabilityPool.totalStake - totalStakeAfterLiquidation);
        if (this.sbrStaking.totalStake > BigInt(0) && liquidationFee > gasCompensated) {
            await this.distributeCollateralGainsToSBRStakers(liquidationFee -  gasCompensated);
            //return BigInt(0);
        } else if (this.stabilityPool.totalStake > BigInt(0) && liquidationFee > gasCompensated) {
            await this.distributeCollateralGainsToStabilityPoolStakers(liquidationFee - gasCompensated, "liquidation-fee", true);
            //return BigInt(0);
            //refund = 
        } else {
           // return liquidationFee;
           refund = liquidationFee;
        }
        await this.cleanupBorrower(safeId);
     } else {
        await this.cleanupBorrower(safeId);
        const totalCollateral = Object.keys(this.borrowers).reduce((acc, id) => acc + this.borrowers[id].safe.collateral, BigInt(0));
        const totalCollateralInContract = await this.contracts.stableBaseCDP.totalCollateral();
        expect(totalCollateral).to.be.closeTo(totalCollateralInContract, totalPrecision);
        await this.distributeDebtAndCollateralToExistingBorrowers(borrowAmount, collateralAmount - fee, totalCollateralInContract);
        if (this.sbrStaking.totalStake > BigInt(0) && fee > gasCompensated) {
            await this.distributeCollateralGainsToSBRStakers(fee - gasCompensated);
            //return BigInt(0);
        } else if (this.stabilityPool.totalStake > BigInt(0) && liquidationFee > gasCompensated) {
            await this.distributeCollateralGainsToStabilityPoolStakers(liquidationFee - gasCompensated, "liquidation-fee", true);
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
     return refund;
  }

  async distributeCollateralGainsToSBRStakers(collateral) {
    let totalStake = this.sbrStaking.totalStake;
    let distributed = BigInt(0);
    for (let i = 0; i< this.sbrStaking.stakers.length ; i++) {
         const staker= this.sbrStaking.stakers[i];
         const share = (((collateral * staker.sbrStaking.stake * BigInt(1e18))  / (totalStake)) / BigInt(1e18));
         this.consolelog("Distributing collateral gains to SBR staker ", i, staker.id, this.sbrStaking.totalStake, "Collateral", collateral, "share: ", share, "stake", staker.sbrStaking.stake, "fee share", ((staker.sbrStaking.stake * BigInt(10000)) / totalStake));
         await staker.distributeCollateralGainSBRStaking(share);
         distributed += share;
     }
     this.sbrStaking.ethLoss = collateral - distributed;
     this.sbrStaking.totalRewards.eth += distributed;
  }

  async distributeDebtAndCollateralToExistingBorrowers(debt, collateral, totalCollateral) {
     this.consolelog("Distributing debt and collateral to existing borrowers ", debt, collateral, totalCollateral);
     let distributedDebt = BigInt(0);
     let distributedCollateral = BigInt(0);
     for (const borrowerId of Object.keys(this.borrowers)) {
        const borrower = this.borrowers[borrowerId];
        const share = ((collateral * borrower.safe.collateral * BigInt(1e18)) / totalCollateral);
        borrower.safe.pending.collateral += share / BigInt(1e18);
        borrower.safe.pending.debt += ((debt * share) / collateral) / BigInt(1e18);
        const pendingIncrease = await this.contracts.stableBaseCDP.getInactiveDebtAndCollateral(borrower.safeId);
        this.consolelog("Distributing debt and collateral to borrower ", borrower.id, share / BigInt(1e18), borrower.safe.pending.collateral, borrower.safe.pending.debt);
        distributedDebt += ((debt * share) / collateral) / BigInt(1e18);
        distributedCollateral += (share / BigInt(1e18));
        expect(pendingIncrease[0]).to.be.closeTo(borrower.safe.pending.debt, totalPrecision);
        expect(pendingIncrease[1]).to.be.closeTo(borrower.safe.pending.collateral, totalPrecision);
     }
     expect(distributedDebt).to.be.closeTo(debt, totalPrecision);
     expect(distributedCollateral).to.be.closeTo(collateral, totalPrecision);
  }

  async cleanupBorrower(safeId) {
    let borrower = this.safeMapping[safeId];
    if (borrower === undefined) {
        borrower = this.safeMapping[BigInt(safeId)];
        if (borrower === undefined) {
            assert.fail(`Borrower not found for safe ${safeId}`);
        }
    }
    await borrower.setSafeClosed();
    await this.removeBorrower(borrower);
  }

  async removeBorrower(borrower) {
    delete this.borrowers[borrower.id];
    delete this.safeMapping[BigInt(borrower.safeId)];
  }



  async updateRedeemedSafes(redeemedSafes, _totalRedeemerFee, _totalOwnerFee) {
    let totalOwnerFee = BigInt(0);
    let totalRedeemerFee = BigInt(0);
    for (const safe of redeemedSafes) {
        const collateralToRedeem = safe.params[1];
        const debtToRedeem = safe.params[2];
        const toRefund = safe.params[3];
        const ownerFee = safe.params[4];
        const redeemerFee = safe.params[5];
        totalOwnerFee += ownerFee;
        totalRedeemerFee += redeemerFee;
        this.totalCollateral -= collateralToRedeem;
        this.totalDebt -= debtToRedeem;
        //this.consolelog(this.safeMapping, safe.safeId);
        const borrower = this.safeMapping[safe.safeId];
        borrower.safe.collateral -= collateralToRedeem;
        borrower.safe.debt -= debtToRedeem;
        borrower.sbdBalance += (toRefund - ownerFee);
    }
    // Update the redemption / liquidation queue.
    if (this.stabilityPool.totalStake > BigInt(0)) {
        if (totalOwnerFee > BigInt(0)) {
            // distribute sbd
            await this.distributeRedemptionFeeToStabilityPoolStakers(_totalOwnerFee);
        }
        if (totalRedeemerFee > BigInt(0)) {
            // distribute fee paid in collateral 
            await this.distributeCollateralGainsToStabilityPoolStakers(_totalRedeemerFee, "redemption", true);
        }
    }
    this.consolelog("Total owner fee, total redeemer fee ", totalOwnerFee, _totalOwnerFee, totalRedeemerFee, _totalRedeemerFee);
    // Check fee distribution
  }

  async verifyStakerPendingRewards() {
    for (const staker of this.stabilityPool.stakers) {
        const user = await this.contracts.stabilityPool.getUser(staker.account.address);
        expect(user.stake).to.be.closeTo(staker.stabilityPool.stake, aggregatePrecision);
        //this.consolelog("Verifying rewards for ", staker.id, staker.account.address);
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(staker.account.address);
        this.consolelog("Pending rewards ", pendingRewards[0], staker.stabilityPool.unclaimedRewards.sbd);
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
         this.consolelog("Distributing owner fee ", i, staker.id, this.stabilityPool.totalStake, "Fee", redeemerFee, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
         await staker.distributeSbdRewards(share);
         distributed += share;
     }
     this.stabilityPool.totalRewards.sbd += distributed;
     this.stabilityPool.rewardLoss = toDistribute - distributed;
  }


  async distributeCollateralGainsToStabilityPoolStakers(collateral, tp, check) {
    let totalStake = this.stabilityPool.totalStake;
    let distributed = BigInt(0);
    this.consolelog("Distributing collateral gains to stability pool stakers ", collateral, totalStake);
    for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
        const staker= this.stabilityPool.stakers[i];
         const share = (((collateral * staker.stabilityPool.stake * BigInt(1e18))  / (totalStake)) / BigInt(1e18));
         this.consolelog(`Distributing collateral from ${tp}`, i,  staker.id, this.stabilityPool.totalStake, "Fee", collateral, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
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
     let toDistribute = ((fee * proportion) / BigInt(10000) + this.stabilityPool.rewardLoss);
     let distributed = BigInt(0);
     this.consolelog(await this.contracts.stabilityPool.totalStakedRaw(), totalStake);
     this.consolelog("Distributing shielding fee ", fee, toDistribute, totalStake, proportion);
     for (let i = 0; i< this.stabilityPool.stakers.length ; i++) {
        const staker= this.stabilityPool.stakers[i];
         const share = ((((toDistribute * staker.stabilityPool.stake * BigInt(1e18))  / (totalStake)) / BigInt(1e18)));
         this.consolelog("Distributing shielding fee ", i, staker.id, this.stabilityPool.totalStake, "Fee", fee, "share: ", share, "stake", staker.stabilityPool.stake, "fee share", ((staker.stabilityPool.stake * BigInt(10000)) / totalStake));
         await staker.distributeSbdRewards(share);
         distributed += share;
     }
     this.stabilityPool.totalRewards.sbd += distributed;
     let sbrTotalStake = this.sbrStaking.totalStake;
     let toDistributeSbrStakers = ((fee * BigInt(1000)) / BigInt(10000));
     let distributedToSbrStakers = BigInt(0);
     this.consolelog("Distributing shielding fee to SBR Stakers ", fee, toDistributeSbrStakers, sbrTotalStake, "10%");
     for (let i = 0; i< this.sbrStaking.stakers.length ; i++) {
         const staker = this.sbrStaking.stakers[i];
         const share = (((toDistributeSbrStakers * staker.sbrStaking.stake * BigInt(1e18))  / (sbrTotalStake)) / BigInt(1e18));
         this.consolelog("Distributing shielding fee to SBR staker ", i, staker.id, this.sbrStaking.totalStake, "Fee", fee, "share: ", share, "stake", staker.sbrStaking.stake, "fee share", ((staker.sbrStaking.stake * BigInt(10000)) / sbrTotalStake));
         await staker.distributeSbdRewardsSBRStaking(share);
         distributedToSbrStakers += share;
     }
     this.sbrStaking.totalRewards.sbd += distributedToSbrStakers;
     if (this.stabilityPool.totalStake > BigInt(0)) {
        this.stabilityPool.rewardLoss = toDistribute - distributed;
        return BigInt(0);
     }
     return fee - distributed - distributedToSbrStakers; // return refund
  }

  getRandomSpot() {
      const randomId = Math.floor(Math.random() * 10000) % this.borrowerList.length;
      return this.borrowerList[randomId];
  }

  async validateDebtAndCollateral() {
    let totalCollateral = BigInt(0);
    let totalDebt = BigInt(0);

    for (const borrowerId of Object.keys(this.borrowers)) {
        //this.consolelog("Checking..", borrowerId);
        const borrower = this.borrowers[borrowerId];
        const safe = await this.contracts.stableBaseCDP.safes(borrower.safeId);
        totalCollateral += safe.collateralAmount;
        totalDebt += safe.borrowedAmount;
    }
    expect(totalCollateral).to.be.closeTo(await this.contracts.stableBaseCDP.totalCollateral(), totalPrecision, "Total collateral mismatch");
    expect(totalDebt).to.be.closeTo(await this.contracts.stableBaseCDP.totalDebt(), totalPrecision, "Total debt mismatch");
    //expect(totalDebt).to.equal(await this.contracts.sbdToken.totalSupply(), "Total debt mismatch");
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
        totalStake += user.stake;
        staker.stabilityPool.stake = user.stake;
        const pendingRewards = await this.contracts.stabilityPool.userPendingRewardAndCollateral(staker.account.address);
        totalRewards.sbd += pendingRewards[0];
        totalRewards.eth += pendingRewards[1];
        expect(pendingRewards[0]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.sbd, totalPrecision);
        expect(pendingRewards[1]).to.be.closeTo(staker.stabilityPool.unclaimedRewards.eth, totalPrecision);
    }
    this.stabilityPool.totalStake = totalStake;
    expect(totalStake).to.be.closeTo(await this.contracts.stabilityPool.totalStakedRaw(), totalPrecision, "Stability pool stake mismatch");
    expect(totalRewards.sbd + totalStake + this.stabilityPool.rewardLoss + this.stabilityPool.stakeLoss).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.contracts.stabilityPool.target), totalPrecision, "Stability pool SBD balance mismatch");
    expect(totalRewards.eth).to.be.closeTo(await ethers.provider.getBalance(this.contracts.stabilityPool.target), totalPrecision, "Stability pool ETH balance mismatch");
  }

  async printState() {
     // Print state
     const contractState = await takeContractSnapshots(this.contracts);
     const safeIds = Object.keys(this.borrowers).map(k => this.borrowers[k].safeId);
     const safeSnapshots = await takeSafeSnapshots(this.contracts, safeIds);
     this.consolelog("Contract state: ", contractState);
     this.consolelog("Safe snapshots: ", safeSnapshots);
     this.consolelog("Redemption QUeue: ", contractState.stableBaseCDP.redemptionQueue.all);
     this.consolelog("Liquidation Queue: ", contractState.stableBaseCDP.liquidationQueue.all);
     await this.market.printState();
  }

  async getTransaction(txHash) {
    try {
        const transaction = await ethers.provider.getTransaction(txHash);

        if (!transaction) {
            this.consolelog("Transaction not found!");
            return;
        }

        // Decode input data
        const parsedData = this.contracts.stableBaseCDP.interface.parseTransaction({
            data: transaction.data,
            value: transaction.value,
        });
        this.consolelog(parsedData);
    } catch (error) {
        console.error("Error fetching transaction:", error);
    }
  }


  async getTxAndEventsThatRemovedFromQueue(safeId) {
    const filter = this.contracts.stableBaseCDP.filters.SafeRemovedFromRedemptionQueue(safeId);
    const events = await this.contracts.stableBaseCDP.queryFilter(filter);
    events.forEach(async(event) => {
        this.consolelog("Transaction hash:", event.transactionHash);
        await this.getTransaction(event.transactionHash);
    });

  }

  async validateSBRStaking() {
    let totalStake = BigInt(0);
    let totalRewards = {
        sbd: BigInt(0),
        eth: BigInt(0)
    }
    for (const staker of this.sbrStaking.stakers) {
        const user = await this.contracts.sbrStaking.stakes(staker.account.address);
        expect(user.stake).to.be.closeTo(staker.sbrStaking.stake, totalPrecision);
        totalStake += staker.sbrStaking.stake;
        totalRewards.sbd += staker.sbrStaking.unclaimedRewards.sbd;
        totalRewards.eth += staker.sbrStaking.unclaimedRewards.eth;
        const pendingRewards = await this.contracts.sbrStaking.userPendingReward(staker.account.address);
        expect(pendingRewards[0]).to.be.closeTo(staker.sbrStaking.unclaimedRewards.sbd, aggregatePrecision);
        expect(pendingRewards[1]).to.be.closeTo(staker.sbrStaking.unclaimedRewards.eth, aggregatePrecision);
    }
    expect(totalStake).to.be.closeTo(await this.contracts.sbrStaking.totalStake(), totalPrecision, "SBR staking stake mismatch");
    expect(totalStake).to.be.closeTo(await this.contracts.sbrToken.balanceOf(this.contracts.sbrStaking.target), totalPrecision, "SBR staking SBR balance mismatch");
    expect(totalRewards.sbd).to.be.closeTo(await this.contracts.sbdToken.balanceOf(this.contracts.sbrStaking.target), ethers.parseUnits("0.000001", 18), "SBR staking SBD balance mismatch");
    expect(totalRewards.eth).to.be.closeTo(await ethers.provider.getBalance(this.contracts.sbrStaking.target), totalPrecision, "SBR staking ETH balance mismatch");
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
        if (borrower.safe.debt > BigInt(100)) {
            try {
                expect(redemptionSafes[BigInt(borrower.safeId)]).to.not.be.undefined;
                expect(liquidationSafes[BigInt(borrower.safeId)]).to.not.be.undefined;
            } catch (ex) {
                this.consolelog("Safe not found in redemption / liquidation queue ", borrower.safeId, BigInt(borrower.safeId));
                this.consolelog("Redemption queue: ", redemptionSafes[BigInt(borrower.safeId)]);
                this.consolelog("Liquidation queue: ", liquidationSafes[BigInt(borrower.safeId)]);
                this.consolelog("Safe: ", borrower.safe);
                this.consolelog("Safe in contract: ", await this.contracts.stableBaseCDP.safes(borrower.safeId));
                await this.getTxAndEventsThatRemovedFromQueue(BigInt(borrower.safeId));
                keysNotFound++;
            }
        }
        //totalCollateral += borrower.safe.collateral;
        //totalDebt += borrower.safe.debt;
        const safe = await this.contracts.stableBaseCDP.safes(borrower.safeId);
        expect(safe.collateralAmount).to.be.closeTo(borrower.safe.collateral, aggregatePrecision, "Collateral mismatch");
        expect(safe.borrowedAmount).to.be.closeTo(borrower.safe.debt, aggregatePrecision, "Debt mismatch");
    }
    if (keysNotFound > 0) {
        this.consolelog("Total keys not found in liquidation / redemption queue.", keysNotFound);
        throw "Some keys not found in liquidation / redemption queue";
    }
    
    //expect(totalCollateral).to.be.closeTo(await this.contracts.stableBaseCDP.totalCollateral(), totalPrecision, "Total collateral mismatch");
    //expect(totalDebt).to.be.closeTo(await this.contracts.stableBaseCDP.totalDebt(), totalPrecision, "Total debt mismatch");
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

  consolelog(...args) {
     console.log(`[Step-${this.currentStep}]-[${new Date().toISOString()}] [Tracker - ${this.id}]`, ...args);
  }

  async step(id) {
    this.currentStep = id;
    try {
    //this.checkForLiquidation(collateralPrice);
        await this.validateDebtAndCollateral();
        //await this.validateTotalSupply();
        await this.validateStabilityPool();
        await this.validateSafes();
        await this.validateSBRStaking();
        
       // if ((id + 1) % 20 == 0) {
        //  await this.syncStates();
        //}
        
    } catch (ex) {
        //this.consolelog(this.stabilityPool);
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

  const SBDToken = await ethers.getContractFactory("DFIDToken");
    const sbdToken = await SBDToken.deploy();
    await sbdToken.waitForDeployment();
    console.log("Deployed SBDToken to:", sbdToken.target);
  
    const DFIREToken = await ethers.getContractFactory("DFIREToken");
    const dfireToken = await DFIREToken.deploy();
    await dfireToken.waitForDeployment();
    console.log("Deployed DFIREToken to:", dfireToken.target);

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

    const DFIREStaking = await ethers.getContractFactory("DFIREStaking");
    const dfireStaking = await DFIREStaking.deploy(true);
    await dfireStaking.waitForDeployment();
    console.log("Deployed DFIRStaking to:", dfireStaking.target);

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
    console.log("Setting StabilityPool address to DFIRToken...");
    tx = await dfireToken.setAddresses(stabilityPool.target);
    await tx.wait();
    console.log("Setting SBDToken, StableBaseCDP, and DFIRToken addresses to StabilityPool...");
    tx = await stabilityPool.setAddresses(sbdToken.target, stableBaseCDP.target, dfireToken.target);
    await tx.wait();
    console.log("Setting DFIRToken, SBDToken, and StableBaseCDP addresses to SBRStaking...");
    tx = await dfireStaking.setAddresses(dfireToken.target, sbdToken.target, stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to RedemptionQueue...");
    tx = await redemptionQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting StableBaseCDP address to LiquidationQueue...");
    tx = await liquidationQueue.setAddresses(stableBaseCDP.target);
    await tx.wait();
    console.log("Setting SBDToken, PriceOracle, StabilityPool, SBRStaking, LiquidationQueue, and RedemptionQueue addresses to StableBaseCDP...");
    tx = await stableBaseCDP.setAddresses(sbdToken.target, priceOracle.target, stabilityPool.target, dfireStaking.target, liquidationQueue.target, redemptionQueue.target);
    await tx.wait();

    return {
        sbdToken,
        sbrToken: dfireToken,
        stabilityPool,
        priceOracle,
        stableBaseCDP,
        sbrStaking: dfireStaking,
        redemptionQueue,
        liquidationQueue
    };
  }
  

async function main() {

    const [deployer, marketAccount, ...addrs] = await ethers.getSigners();

    const env = new Environment();

    const contracts = await deployContracts();
    console.log(contracts);
    const startTime = time.latest();

    // Initialize the Market agent
    const market = new Market(marketAccount, marketAccount.balance, contracts);
    env.addAgent(market);

    const tracker = new OfflineProtocolTracker(contracts, market, [], []);
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
    const safeIds = [];
    for (let i = 0; i < numBorrowers; i++) {
        const borrower = new Borrower(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker);
        borrower.ethBalance = await addrs[addressIndex].provider.getBalance(addrs[addressIndex].address);
        env.addAgent(borrower);
        safeIds.push(borrower.safeId);
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
    tracker.borrowerList = safeIds;

    // Update each CDP based on the new collateral price
    const actors = env.getAgents()
    .filter(agent => agent instanceof Actor).map((agent) => agent);
    console.log(actors);
    tracker.actors = actors;

    const borrowers = env.getAgents().filter(agent => agent instanceof Borrower).map((agent) => agent);

    const hackers = [];

    for (let i=0;i<numHackers;i++) {
        const hacker = new Hacker(addrs[addressIndex], addrs[addressIndex].balance, contracts, market, tracker, borrowers, actors);
        env.addAgent(hacker);
        hackers.push(hacker);
        addressIndex++;
    }

    // Main simulation loop
    for (let i = 0; i < numSimulations; i++) {
        console.log(`--- Simulation Step ${i + 1} ---`);
        market.currentStep = i;
        tracker.currentStep = i;
        
        // Get the updated collateral price from the market
       await market.step(i);

       let shuffled = shuffleArray(actors);
        
        for (const actor of shuffled) {
           await actor.step(i);
        }
        for (const hacker of hackers) {
            await hacker.step(i);    
        }
        
        console.log(); // Blank line for readability between steps
        await tracker.step(i);
        time.increase(3 * (86400 + 86400 / 2)); // Increase time by 1.5 days at each run.
    }

    
    console.log("Tearing down agents...");
    let totalBorrowersTearedDown = 0;
    for (const actor of actors) {
        await actor.tearDownStep1();
    }
    const endTime = time.latest();
    console.log("Simulation duration: ", (endTime - startTime) / 86400, " days");
    console.log(await contracts.sbrToken.totalSupply());
    expect(await contracts.sbrToken.totalSupply()).to.be.closeTo(ethers.parseEther("31536000", 18), totalPrecision);

    console.log("State before teardown");
    tracker.printState();

    for (const borrower of borrowers) {
        console.log("Tearing down borrower ", totalBorrowersTearedDown++, borrower.id);
        await borrower.tearDownStep2();
    }



    console.log("Simulation completed without errors");

    console.log("SBD total supply: ", await contracts.sbdToken.totalSupply());
    console.log("Total collateral in contract: ", await contracts.stableBaseCDP.totalCollateral());
    console.log("Total debt in contract: ", await contracts.stableBaseCDP.totalDebt());
    console.log("Total fee paid:", tracker.stabilityPool.totalRewards.sbd);
    await tracker.printState();
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
