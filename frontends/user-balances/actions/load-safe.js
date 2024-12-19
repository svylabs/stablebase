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
        let safeOwner = "0x0";
        try {
            safeOwner = await mcLib.contracts.StableBaseCDP.methods.ownerOf(safeId).call();
        } catch (e) {
            console.error('Error getting safe owner:', e);
        }
        const balance = await mcLib.web3.eth.getBalance(mcLib.context.connectedAddress);
        let collateralRatio = "N/A";
        console.log('Safe:', safe, 'Owner:', safeOwner, 'Balance:', balance, mcLib.context.connectedAddress);
        if (safeOwner.toLowerCase() !== mcLib.context.connectedAddress.toLowerCase() && safe.collateralAmount > BigInt(0)) {
            console.error('Need to generate a new SafeId as the safe is already owned by someone');
            return null;
        }
        if (safe.borrowedAmount > BigInt(0)) {
            const collateralValue = (safe.collateralAmount * price) / BigInt(10 ** 18);
            collateralRatio = ((collateralValue * BigInt(10000)) / safe.borrowedAmount) / BigInt(100);
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
            collateralPriceFormatted: mcLib.web3.utils.fromWei(price.toString(), 'ether') + " USD",
            collateralPrice: price,
            collateralRatio: {
                value: collateralRatio,
            },
            nativeTokenBalance: balance
        }
    } else {
        return {

        };
    }
}


loadSafe(data, mcLib);