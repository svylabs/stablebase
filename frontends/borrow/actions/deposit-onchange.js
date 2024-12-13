/*
  Fetch the total balance of the default token selected
*/
const estimate = async (data, mcLib) => {
    const depositAmount = data.borrow["fromAmount"];
    console.log("On change: estimate: ", data, depositAmount);
    if (depositAmount) {
      const formattedAmount = mcLib.web3.utils.toWei(depositAmount, 'ether');
      const borrowAmount = BigInt(formattedAmount) * data.collateralPrice / BigInt(1e18);
      return {
          borrow: {
              ...data.borrow,
              maxToAmount: borrowAmount.toString()
          }
      }
    } else {
      return {};
    }
  };
  
  estimate(data, mcLib);