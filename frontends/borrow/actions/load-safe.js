async function loadSafe(data, mcLib) {
    let safeId = data.safeId;
    if (!safeId && mcLib.context.connectedAddress) {
        safeId = mcLib.web3.utils.sha3(mcLib.context.connectedAddress);
    }
    if (safeId) {
        //console.log(document.cookie);
        //console.log(localStorage.getItem('safeId'));
        console.log('Loading Safe:', safeId);
        const price = BigInt(await mcLib.contracts.PriceOracle.methods.lastGoodPrice().call());
        const safe = await mcLib.contracts.StableBaseCDP.methods.safes(safeId).call();
        const safeOwner = await mcLib.contracts.StableBaseCDP.methods.ownerOf(safeId);
        const balance = await mcLib.web3.eth.getBalance(mcLib.context.connectedAddress);
        if (safeOwner !== mcLib.context.connectedAddress && safe.collateralAmount > BigInt(0)) {
            console.error('Need to generate a new SafeId as the safe is already owned by someone');
            return null;
        }
        return {
            safeId: safeId,
            safe: safe,
            totalDebt: safe.borrowedAmount,
            totalCollateral: safe.collateralAmount,
            collateralPriceFormatted: mcLib.web3.utils.fromWei(price.toString(), 'ether') + " USD",
            collateralPrice: price,
            nativeTokenBalance: balance
        }
    } else {
        return {

        };
    }
}


loadSafe(data, mcLib);