async function loadDfireStake() {
    if (!mcLib.context.connectedAddress) {
        return {};
    }
    let stake = await mcLib.contracts.DFIREStaking.methods.stakes(mcLib.context.connectedAddress).call();
    const balance = await mcLib.contracts.DFIREToken.methods.balanceOf(mcLib.context.connectedAddress).call();
    //console.log('Stake:', user, 'Rewards:', rewards, 'Balance:', balance);
    return {
        stake: stake,
        totalDFIREStaked: {
            value: stake.stake,
            formatted: mcLib.web3.utils.fromWei(stake.stake.toString(), 'ether'),
        },
        totalDFIREBalance: {
           value: balance,
           formatted: mcLib.web3.utils.fromWei(balance.toString(), 'ether'),
        },
        /*
        pendingRewards: rewards,
        approveDescription: true,
        stakeDescription: true,
        */
    }
}

loadDfireStake();