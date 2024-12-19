function getNearestSafeInQueue(value, nodes) {
    console.log("Nodes ", nodes.n.length, nodes);
    if (nodes.n.length === 0) {
        return BigInt(0);
    } else {
        for (let i = 0; i < nodes.n.length; i++) {
            console.log("Iteration: ", i, value);
            if (value >= nodes.n[i].value) {
                if (i > 0) {
                    return nodes.n[i-1].next;
                } else {
                    return BigInt(0);
                }
            }
        }
    }
}

async function repay() {
    const safeId = data.safeId;
    const repayAmount = data.repayValue;
    const nodes = await mcLib.contracts.LiquidationQueue.methods.getNodes(BigInt(0), BigInt(50)).call();
    const newRatio = ((data.safe.borrowedAmount - repayAmount) * BigInt(10 ** 18)) / data.safe.collateralAmount;
    const nearestSafeInLiquidationQueue = getNearestSafeInQueue(newRatio, nodes);
    const gasEstimate = await mcLib.contracts.StableBaseCDP.methods.repay(safeId, repayAmount, nearestSafeInLiquidationQueue).estimateGas({ from: mcLib.context.connectedAddress });
    console.log("Repay amount: ", repayAmount, "Nearest safe in liquidation queue: ", nearestSafeInLiquidationQueue, "Gas estimate: ", gasEstimate);
    const tx = mcLib.contracts.StableBaseCDP.methods.repay(safeId, repayAmount, nearestSafeInLiquidationQueue);
    const txReceipt = await tx.send({ from: mcLib.context.connectedAddress, gas: gasEstimate });
    console.log("Repay:", txReceipt);
    return {
        repayBtn: false,
        repayTxLink: txReceipt.transactionHash,
        //borrowBtn: true,
        //borrowDescription: true
    };
}

repay();