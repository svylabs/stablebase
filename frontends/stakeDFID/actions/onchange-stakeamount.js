async function calculateUpdatedStake() {
    const value = data.stakeAmount;
    if (value === "") {
        return {
            additionalStake: BigInt(0),
            updatedStake: data.totalStaked.value
        }
    }
    const additionalStake =  BigInt(mcLib.web3.utils.toWei(value, 'ether'));
    return {
        additionalStake: additionalStake,
        updatedStake: {
            value: data.totalStaked.value + additionalStake,
            formatted: mcLib.web3.utils.fromWei(data.totalStaked.value + additionalStake, 'ether')
        },
        approveBtn: true,
        stakeDescription: true,
    }
}

calculateUpdatedStake();