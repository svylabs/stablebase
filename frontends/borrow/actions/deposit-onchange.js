/*
  Fetch the total balance of the default token selected
*/
const estimate = async (data, mcLib) => {
    const depositAmount = data.borrow["fromAmount"];
    console.log("On change: estimate: ", data, depositAmount);
    const borrowAmount = data.borrow.toAmount;
    if (depositAmount) {
      const formattedAmount = mcLib.web3.utils.toWei(depositAmount, 'ether');
      const collateralValue = BigInt(formattedAmount) * data.collateralPrice / BigInt(1e18);
      const maxBorrowAmount = (collateralValue * BigInt(10000)) / BigInt(11000);
      return {
          borrow: {
              ...data.borrow,
              maxToAmount: maxBorrowAmount.toString()
          },
          collateralValue: collateralValue
      }
    } else {
      return {};
    }
  };
  
  estimate(data, mcLib);