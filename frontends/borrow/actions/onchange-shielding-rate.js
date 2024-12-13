async function calculateFeeAndBorrowAmount() {
    // Fetch the total borrow amount
    const borrowAmount = BigInt(mcLib.web3.utils.toWei(data.borrow.toAmount, 'ether'));
    console.log("Borrow amount: ", borrowAmount, data);
    if (data.shieldingRate && borrowAmount) {
        // Get the shielding rate
        const shieldingRate = BigInt("" + parseInt(parseFloat(data.shieldingRate) * 100));
        console.log("Shielding rate: ", shieldingRate, borrowAmount);
        // calculate fee
        const fee = (borrowAmount * shieldingRate) / BigInt(10000);
        // calculate borrow amount
        const borrowAmountAfterFee = borrowAmount - fee;
        return {
            shieldingFee: {
                value: fee,
                formatted: mcLib.web3.utils.fromWei(fee.toString(), 'ether')
            },
            borrowAmount: {
                value: borrowAmountAfterFee,
                formatted: mcLib.web3.utils.fromWei(borrowAmountAfterFee.toString(), 'ether')
            },
            openSafeDescription: true,
            openSafeBtn: true
        }
    } else {
        return {};
    }
}
calculateFeeAndBorrowAmount();