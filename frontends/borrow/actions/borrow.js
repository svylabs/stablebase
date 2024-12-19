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

async function borrow() {
    if (data.safeId) {  
        const borrowAmount = data.borrow.toAmount;
        const borrowAmountInWei = mcLib.web3.utils.toWei(borrowAmount, 'ether');
        const safeId = data.safeId;
        const shieldingRate = BigInt("" + parseInt(parseFloat(data.shieldingRate) * 100));
        const safesForRedemption = await mcLib.contracts.RedemptionQueue.methods.getNodes(BigInt(0), BigInt(50)).call();
        const safesForLiquidation = await mcLib.contracts.LiquidationQueue.methods.getNodes(BigInt(0), BigInt(50)).call();
        let weight = shieldingRate;
        if (data.safe) {
            weight += data.safe.weight;
        } else if (safesForRedemption.value > 0) {
            weight += safesForRedemption[0].value;
        }
        console.log("Weight: ", weight);
        const nearestSafeInRedemptionQueue = getNearestSafeInQueue(weight, safesForRedemption);
        const ratio = (BigInt(borrowAmountInWei) * BigInt(10 ** 18)) / data.collateralValue;
        console.log("Ratio: ", ratio, borrowAmountInWei, nearestSafeInRedemptionQueue);
        const nearestSafeInLiquidationQueue = getNearestSafeInQueue(ratio, safesForLiquidation);
        console.log("Nearest safe in liquidation queue: ", nearestSafeInLiquidationQueue);
        const gasEstimate = await mcLib.contracts.StableBaseCDP.methods.borrow(safeId, borrowAmountInWei, shieldingRate, nearestSafeInLiquidationQueue, nearestSafeInRedemptionQueue).estimateGas({ from: mcLib.context.connectedAddress });
        console.log("Borrow amount: ", borrowAmount, "Shielding rate: ", shieldingRate, "Nearest safe in redemption queue: ", nearestSafeInRedemptionQueue, "Nearest safe in liquidation queue: ", nearestSafeInLiquidationQueue, "Gas estimate: ", gasEstimate);
        const tx = mcLib.contracts.StableBaseCDP.methods.borrow(safeId, borrowAmountInWei, shieldingRate, nearestSafeInLiquidationQueue, nearestSafeInRedemptionQueue);
        const txReceipt = await tx.send({ from: mcLib.context.connectedAddress, gas: gasEstimate });
        return {
            borrowBtn: false,
            borrowDescription: false,
            borrowTxLink: txReceipt.transactionHash
        }
    }
}

borrow();