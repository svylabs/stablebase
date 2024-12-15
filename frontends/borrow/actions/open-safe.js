async function openSafe() {
    const depositAmount = data.borrow.fromAmount;
    const depositAmountInWei = mcLib.web3.utils.toWei(depositAmount, 'ether');
    const safeId = data.safeId;
    const gasEstimate = await mcLib.contracts.StableBaseCDP.methods.openSafe(safeId, depositAmountInWei).estimateGas({ from: mcLib.context.connectedAddress, value: depositAmountInWei });
    const tx = mcLib.contracts.StableBaseCDP.methods.openSafe(safeId, depositAmountInWei);
    const txReceipt = await tx.send({ from: mcLib.context.connectedAddress, value: depositAmountInWei, gas: gasEstimate });
    console.log("Open Safe:", txReceipt);
    return {
        openSafeDescription: false,
        openSafeBtn: false,
        openSafeTxLink: tx.transactionHash,
        borrowBtn: true,
        borrowDescription: true
    };
}

openSafe();