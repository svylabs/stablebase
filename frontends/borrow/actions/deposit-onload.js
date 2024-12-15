/*
  Fetch the total balance of the default token selected
*/
const fetchTotalBalance = async (data, mcLib) => {
  if (!mcLib.context.connectedAddress) {
      return {};
  }
  const balance = await mcLib.web3.eth.getBalance(mcLib.context.connectedAddress);
   return {
      borrow: {
          ...data.borrow,
          maxFromAmount: balance.toString()
      }
   }
};

fetchTotalBalance(data, mcLib);