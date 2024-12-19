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
        console.log('Safe:', safe, 'Owner:', safeOwner, 'Balance:', balance, mcLib.context.connectedAddress);
        if (safeOwner.toLowerCase() !== mcLib.context.connectedAddress.toLowerCase() && safe.collateralAmount > BigInt(0)) {
            console.error('Need to generate a new SafeId as the safe is already owned by someone');
            return null;
        }
        const flow  = {};
        let maxBorrowAmount = BigInt(0);
        if (safeOwner.toLowerCase() == mcLib.context.connectedAddress.toLowerCase() && safe.collateralAmount > BigInt(0)) {
            const collateralValue = BigInt(safe.collateralAmount) * price / BigInt(1e18);
            maxBorrowAmount = (collateralValue * BigInt(10000)) / BigInt(11000) - safe.borrowedAmount;
            if (maxBorrowAmount > BigInt(0)) {
                flow.borrowBtn = true;
                flow.borrowDescription = true;
                flow.borrow = {
                    ...data.borrow,
                    maxToAmount: maxBorrowAmount.toString()
                };
                flow.collateralValue = collateralValue;
            }
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
            nativeTokenBalance: balance,
            ...flow
        }
    } else {
        return {

        };
    }
}


loadSafe(data, mcLib);