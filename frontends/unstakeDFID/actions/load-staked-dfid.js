async function loadStake() {
    if (!mcLib.context.connectedAddress) {
        return {};
    }
    let user = await mcLib.contracts.StabilityPool.methods.users(mcLib.context.connectedAddress).call();
    if (user.stake != BigInt(0)) {
        user = await mcLib.contracts.StabilityPool.methods.getUser(mcLib.context.connectedAddress).call();
    }
    let rewards = {};
    if (user.stake != BigInt(0)) {
        rewards = await mcLib.contracts.StabilityPool.methods.userPendingReward(mcLib.context.connectedAddress).call();
    }
    const balance = await mcLib.contracts.DFIDToken.methods.balanceOf(mcLib.context.connectedAddress).call();
    console.log('Stake:', user, 'Rewards:', rewards, 'Balance:', balance);
    return {
        stake: user,
        totalStaked: {
            value: user.stake,
            formatted: mcLib.web3.utils.fromWei(user.stake.toString(), 'ether'),
        },
        totalDFIDBalance: {
           value: balance,
           formatted: mcLib.web3.utils.fromWei(balance.toString(), 'ether'),
        },
        pendingRewards: rewards,
        unstakeDescription: true,
    }
}

loadStake();