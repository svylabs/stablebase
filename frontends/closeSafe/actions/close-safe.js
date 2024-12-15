async function closeSafe() {
    const safeId = data.safeId;
    const gasEstimate = await mcLib.contracts.StableBaseCDP.methods.closeSafe(safeId).estimateGas({ from: mcLib.context.connectedAddress });
    const tx = mcLib.contracts.StableBaseCDP.methods.closeSafe(safeId);
    const txReceipt = await tx.send({ from: mcLib.context.connectedAddress, gas: gasEstimate });
    console.log("Close Safe:", txReceipt);
    return {
        closeSafeBtn: false,
        closeSafeTxLink: txReceipt.transactionHash,
        borrowBtn: true,
        borrowDescription: true
    };
}

closeSafe(data, mcLib);