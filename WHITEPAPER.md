                                            StableBase: Stablecoin Protocol with enhanced stability mechanics.
                                                            Sridhar G<sg@svylabs.com>

# Abstract
One of the important functions of a reserve bank in Traditional Finance is price stability. This is achieved through multiple policy tools, the primary one being controlling interest rates. There are other lesser known policy tools- like Repo rate, Reserve Ratio, etc. These tools aid in contracting and expanding the supply of money in the economy. In the cryptocurrency world, the primary tool used to control money supply for stablecoin protocols are the interest rate, collateral requirements(which is usually fixed for a given collateral). There has not been much innovations since then. In this paper, we introduce StableBase, a new stablecoin protocol with 0% interest rates, but achieve the same effect of contracting and expanding the money supply during different market conditions through two new policy tools, namely user defined stability rate, and user defined reserve ratio and how they play together to achieve price parity with the pegged currency.

# Introduction
Most existing stablecoin issuing protocols(eg: MakerDAO, CurveUSD) use interest rates as a mechanism to incentivse and disincentivise borrowing. It has been implicitly assumed that interest rates are mandatory to ensure stability of a stablecoin protocol. However, interest rates are not desirable in a CDP mechanism that issues new stablecoins. Here is a base case example of why interest rates are flawed: Imagine, a user of a protocol that has interest rates of 10% P.A. that has borrowed 1000 stablecoins with 150% of collateral. At the end of 1 year, the user has to pay the protocol the borrowed amount + interest rate, and that equates to 1100 coins in our case, where the total circulation is only 1000. The user thus loses close to 10% of the collateral at the time of withdrawing. This simple example shows that, interest rates in a stablecoin issuing protocol needs more careful thinking and is not desirable in the long run in existing form. The only way these protocols can scale, is by adding new collateral types continuously, thus new money is created constantly. Based on this assumption, we have attempted to come up with alternate policy tools for CDP based stablecoin issuing protocols that can achieve the desired effect of price stability. Price stability in this case means to have price parity with the pegged currency.

# Collateral Debt Position
Collateral Debt Position mechanism is the most popular mechanism used to create stablecoin protocols. Users can deposit collateral and borrow stablecoins based on the value of the collateral, provided the collateral sufficiently backs the debt at all times until the loan is closed. If the collateral drops in value beyond a threshold(usually 110% and varaible for different collateral types used based on the risk levels), a liquidation event is triggered that allows a liquidator to pay back the loan to get the underlying collateral for a discounted price(related to market value).

In addition to Liquidation, some protocols also support redemption, where anyone can redeem the stablecoins for the underlying collateral at the face value(i.e 1 stablecoin = 1 USD worth of collateral). 

These two mechanisms enable the price stability of the stablecoin. Different protocols innovate on how they enable Liquidation and Redemption. 

In addition to Liquidation and Redemption, most protocols also collect fees in the form of interest rates- that is paid to savings pool where users stake stablecoins in return for fees proportional to their stake in the pool. This also has an effect on controlling the supply of money.

# Problems
There are a couple of problems in the existing protocols.
1. **Interest Rates:** As described in the introduction section, interest rate appears to be a non-scalable approach. The reason why interest rates work in traditional finance is because the reserve banks have the power to create new supply, which is not possible in a smart contract based approach, unless all conditions are known prior and coded into the contracts. 
2. **Savings Pool**: Is optional. The protocols does not enforce or have an optionally enforced mechanism. Thus the only way protocols control money supply is through increasing interest rates and associated fee revenue for stakers.
3. **Token**: Many protocols also have tokens that capture most of the fee revenue of the protocol, and leave less for those that supply liquidity.

# StableBase
In the StableBase protocol, we also use the Collateral Debt Position mechanism with Liquidation, Redemption, and in addition we have made a conscious choice to have 0% interest rates and to achieve price stability, we are introducing new policy tools that are user defined, rather than algorithm or governance determined.

# Technology
StableBase is built using Solidity on the Ethereum blockchain, benefiting from its smart contract capabilities, security, and widespread adoption within the decentralized finance (DeFi) ecosystem. However, it is adaptable to any blockchain / smart contracting platform that has a reliable decentralized oracle. For our implementation on Ethereum, we use Chainlink as the oracle provider.

# Borrowing and Withdrawal
StableBase utilizes a CDP mechanism, requiring users to overcollateralize their loans by at least 110%. Users create a Safe, where they deposit their collateral and the protocol issues SBD tokens. Withdrawal is facilitated through repayment of the borrowed SBD back to the protocol.

# Stability Mechanism
The stability of the stablecoin and the protocol is ensured through Liquidation and Redemption mechanisms.

## Liquidation
Liquidation occurs if the value of the collateral falls below 110% of the borrowed amount, ensuring stability. There are two liquidation modes:

### Automatic Liquidation
When an automatic liquidation is triggered, the liquidated collateral is distributed among other CDP, and their debt is increased. The protocol also pays the user that triggered liquidation with a flat fee of 0.1%.

### Third party Liquidations
A third party, such as a user or a Liquidation Pool(out of scope for the protocol), can trigger liquidation by paying the debt, and the collateral minus the liquidation fee 0.5% will be returned to the liquidator.

## Redemption
Users can redeem stablecoins for the underlying collateral at a 1:1 ratio. This mechanism ensures that the stablecoin peg remains in a tight range, closer to the intended value.

StableBase protocol also mandates the users to take part in one of the redemption protection mechanisms- by paying a stability rate, or provide stability through user-defined Cash Reserve Ratio.

### Cash Reserve Ratio(CRR) and Reserve Pool
In traditional finance (TradFi), the Cash Reserve Ratio (CRR) is a rate determined by central banks, specifying the percentage of cash deposits that banks are required to hold as reserves. In our protocol, we adopt a modified definition of the CRR.

The CRR, defined as the percentage of borrowed stablecoin value held in the Reserve Pool, can be specified by users at the time of borrowing. This mechanism empowers the protocol to autonomously manage the coin supply in response to market conditions. The reserve pool depositors also have the ability to set a target stability rate.

### Target Stability Rate
Reserve Pool depositors should also provide a target stability rate they think is reasonable for the market conditions. A stake weighted reference target stability rate will be calculated by the protocol based on the stake of SBD tokens in the reserve pool.

### Stability Rate
Users can choose a stability rate to pay to the protocol, in return for redemption protection. If the user pays a stability rate equivalent to target stability rate, the protection will be applicable for 365 days. And if the user pays less, protection offered will be pro rata based on the stability rate(eg: If target stability rate is 3.6%, and user sets 1.2%, a redemption protection will be activated for the safe for 120 days(approximately)), subject to a minimum rate of 0.25%. If the user sets a fee below that, no protection is offered.

### Redemption Mechanism
Redemption process redeems Safes in the following order:
1. Available Safes to redeem based on the expiry of redemption protection.
2. Lowest stability rate paid Safes that doesn't have redemption protection gets redeemed next.
3. Reserve Pool that has the lowest reserve ratio will be redeemed if 1st and 2nd mechanisms are not possible.

# Unique Features
StableBase offers several unique features:

1. 0% interest rate
2. Introduction of user governed target stability rate.
3. Introduction of redemption protection through target Stability rate.
4. Introduction of user defined Cash Reserve Ratio to expand and shrink supply. 
5. Introduction of a user defined stability rate, adjustable periodically to suit redemption tolerance levels.
6. Yield for Reserve Pool depositors.

# Use Cases
StableBase Dollar (SBD) attempts to be a reliable medium of exchange for various real-world transactions, including cross-border payments, remittances, e-commerce, and DeFi activities. It also enables layer 1 borrowing protocols to facilitate higher yield for stablecoin holders, or offer lower cost in supply chain and trade finance, enable efficient and high yielding peer-to-peer lending protocol, thanks to its 0% interest rate.

# Stability Assurance
The redemption and liquidation mechanisms maintain the stability of StableBase (SBD), ensuring its value remains close to 1 USD, while Cash Reserve Ratio helps shrink and expand the supply of stablecoin further aiding in stabilising the peg. Stability rate provides direct yield to Reserve Pool depositors.

# Governance
Governance of StableBase is determined by users' stake in the Reserve Pool. The governance actions include: 

1. Addition of new collateral types.
2. Setting target stability rate.

## Addition of new collateral types
Any user can submit a proposal to add a new collateral type. The proposal consists of TokenAddress, PriceOracle, CollateralizationRatio, EffectiveDate. Voting runs onchain for 28 days and users who have a stake in the reserve pool can vote. At the end of the voting period, Total votes will be tallied and the proposal will be made effective if > 80% of the voters voted 'yes' for the proposal. Users cannot withdraw from reserve pool until after the voting, and new users(< 30 days) in the reserve pool will not be considered for voting.

## Dynamic Updation of Base Rate

The target stability rate is initially set to 0%. Any user can dynamically change the target fee and the protocol calculates a stake weighted average of the target stability rate set by stakes in reserve pool and that becomes the effective Target stability rate, when a new Safe is opened. 

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

## User Experience 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

# Conclusion
StableBase represents a significant remodelling of existing CDP based protocols, with better stability mechanism through the introduction of a user-defined Cash Reserve Ratio and crowd governed target Stability Rate, along with a better incentive structure through the introduction of yield bearing reserve pool, and by providing a reliable medium of exchange with low(user defined) rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.