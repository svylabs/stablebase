
async function stakeDFID() {
    const value = data.stakeAmount;
    if (value === "") {
        return {};
    }
    const additionalStake =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    const estimatedGas = await mcLib.contracts.StabilityPool.methods.stake(additionalStake).estimateGas({ from: mcLib.context.connectedAddress });
    const stakeTx = mcLib.contracts.StabilityPool.methods.stake(additionalStake);
    const stakeTxReceipt = await stakeTx.send({ from: mcLib.context.connectedAddress, gas: estimatedGas });
    return {
        stakeBtn: false,
        stakeDescription: false,
        stakeTxLink: stakeTxReceipt.transactionHash
    }
}

stakeDFID();