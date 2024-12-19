async function calculateUpdatedStake() {
    const value = data.unstakeAmount;
    if (value === "") {
        return {
            unstakeValue: BigInt(0),
            updatedStake: data.totalStaked.value
        }
    }
    const unstakeValue =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    return {
        unstakeValue: unstakeValue,
        updatedStake: {
            value: data.totalStaked.value - unstakeValue,
            formatted: mcLib.web3.utils.fromWei(data.totalStaked.value - unstakeValue, 'ether')
        },
        unstakeBtn: (data.totalStaked.value >= unstakeValue),
        unstakeDescription: true,
    }
}

calculateUpdatedStake();