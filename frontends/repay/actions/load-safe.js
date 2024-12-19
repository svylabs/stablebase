async function loadSafe(data, mcLib) {
    let safeId = data.safeId;
    if (!safeId && mcLib.context.connectedAddress) {
        safeId = mcLib.web3.utils.sha3(mcLib.context.connectedAddress);
    }
    if (safeId) {
        //console.log(document.cookie);
        //console.log(localStorage.getItem('safeId'));
        console.log('Loading Safe:', safeId);
        const safe = await mcLib.contracts.StableBaseCDP.methods.safes(safeId).call();
        const safeOwner = await mcLib.contracts.StableBaseCDP.methods.ownerOf(safeId).call();
        const balance = await mcLib.web3.eth.getBalance(mcLib.context.connectedAddress);
        const price = BigInt(await mcLib.contracts.PriceOracle.methods.lastGoodPrice().call());
        const collateralValue = (safe.collateralAmount * price) / BigInt(10 ** 18);
        const collateralRatio = ((collateralValue * BigInt(10000)) / safe.borrowedAmount) / BigInt(100);
        console.log('Safe:', safe, 'Owner:', safeOwner, 'Balance:', balance, mcLib.context.connectedAddress);
        if (safeOwner.toLowerCase() !== mcLib.context.connectedAddress.toLowerCase() && safe.collateralAmount > BigInt(0)) {
            console.error('Need to generate a new SafeId as the safe is already owned by someone');
            return null;
        }
        return {
            safeId: safeId,
            safe: safe,
            totalDebt: {
                value: safe.borrowedAmount,
                formatted: mcLib.web3.utils.fromWei(safe.borrowedAmount.toString(), 'ether'),
                symbol: "DFID"
            },
            totalCollateral: {
                value: safe.collateralAmount,
                formatted: mcLib.web3.utils.fromWei(safe.collateralAmount.toString(), 'ether'),
                symbol: mcLib.context.chainId === 1 ? "ETH" : "cBTC"
            },
            collateralValue: collateralValue,
            collateralRatio: collateralRatio,
            nativeTokenBalance: balance,
            closeSafeBtn: true
        }
    } else {
        return {

        };
    }
}


loadSafe(data, mcLib);