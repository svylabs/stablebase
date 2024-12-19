
async function stakeDFID() {
    const value = data.unstakeAmount;
    if (value === "") {
        return {};
    }
    const unstakeValue =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    const estimatedGas = await mcLib.contracts.StabilityPool.methods.unstake(unstakeValue).estimateGas({ from: mcLib.context.connectedAddress });
    const unstakeTx = mcLib.contracts.StabilityPool.methods.unstake(unstakeValue);
    const unstakeTxReceipt = await unstakeTx.send({ from: mcLib.context.connectedAddress, gas: estimatedGas });
    return {
        unstakeBtn: false,
        unstakeDescription: false,
        unstakeTxLink: unstakeTxReceipt.transactionHash
    }
}

stakeDFID();