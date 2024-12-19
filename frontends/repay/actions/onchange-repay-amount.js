async function onChangeRepayAmount() {
    const value = data.repayAmount;
    if (value === "") {
        return {
            repayValue: BigInt(0)
        }
    }
    const repayValue =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    console.log("Repay amount: ", repayValue, data);
    let newCollateralRatio
    if (data.safe.borrowedAmount == repayValue) {
        newCollateralRatio = "N/A";
    } else {
       newCollateralRatio = ((data.collateralValue * BigInt(10000)) / (data.safe.borrowedAmount - repayValue)) / BigInt(100);
    }
    return {
        repayValue: repayValue,
        newCollateralRatio: newCollateralRatio
    }
}

onChangeRepayAmount();