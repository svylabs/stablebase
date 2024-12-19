
async function approveDFID() {
    const value = data.stakeAmount;
    if (value === "") {
        return {};
    }
    const additionalStake =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    console.log("Approve DFID: ", additionalStake, "Address: ", mcLib.contracts.StabilityPool);
    const estimatedGas = await mcLib.contracts.DFIDToken.methods.approve(mcLib.contracts.StabilityPool._address, additionalStake).estimateGas({ from: mcLib.context.connectedAddress });
    const approveTx = mcLib.contracts.DFIDToken.methods.approve(mcLib.contracts.StabilityPool._address, additionalStake);
    const stakeTxReceipt = await approveTx.send({ from: mcLib.context.connectedAddress, gas: estimatedGas });
    return {
        approveBtn: false,
        stakeBtn: true,
        approveTxLink: stakeTxReceipt.transactionHash
    }
}

approveDFID();