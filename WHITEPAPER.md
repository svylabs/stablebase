                                            StableBase: Stablecoin Issuing Protocol with alternate stability mechanics.
                                                            Sridhar G<sg@svylabs.com>

# Abstract
One of the important functions of a reserve bank in Traditional Finance is price stability. This is achieved through multiple policy tools, the primary one being controlling interest rates. There are other lesser known policy tools- like Repo rate, Reserve Ratio, etc. These tools aid in contracting and expanding the supply of money in the economy. In the cryptocurrency world, the primary tool used to control money supply for stablecoin protocols are the interest rate, collateral requirements(which is usually fixed for a given collateral). There has not been much innovations since then. In this paper, we introduce StableBase, a new stablecoin protocol with 0% interest rates, but achieve the same effect of contracting and expanding the money supply during different market conditions through two new policy tools, namely user defined stability rate, and user defined reserve ratio and how they play together to achieve price parity with the pegged currency.

# Introduction
Most existing stablecoin issuing protocols(eg: MakerDAO, CurveUSD) use interest rates as a mechanism to incentivse and disincentivise borrowing. It has been implicitly assumed that interest rates are mandatory to ensure stability of a stablecoin protocol. However, interest rates are not desirable in a CDP mechanism that issues new stablecoins. Here is a base case example of why interest rates are flawed: Imagine, a user of a protocol that has interest rates of 10% P.A. that has borrowed 1000 stablecoins with 150% of collateral. At the end of 1 year, the user has to pay the protocol the borrowed amount + interest rate, and that equates to 1100 coins in our case, where the total circulation is only 1000. The user thus loses close to 10% of the collateral at the time of withdrawing. This simple example shows that, interest rates in a stablecoin issuing protocol needs more careful thinking and is not desirable in the long run in existing form. The only way these protocols can scale, is by adding new collateral types continuously or the price of the collateral keeps increasing constantly, thus new money can be created constantly. The real economy doesn't work this way. In our work, we have attempted to come up with alternate policy tools for CDP based stablecoin issuing protocols that can achieve the desired effect of price stability, without the interest rate. Price stability in this case means to have price parity with the pegged currency.

# Collateral Debt Position
Collateral Debt Position mechanism is the most popular mechanism used to create stablecoin protocols. Users can deposit collateral and borrow stablecoins based on the value of the collateral, provided the collateral sufficiently backs the debt at all times until the loan is closed. If the collateral drops in value beyond a threshold(usually 110% and varaible for different collateral types used based on the risk levels), a liquidation event is triggered that allows a liquidator to pay back the loan to get the underlying collateral for a discounted price(related to market value).

In addition to Liquidation, some protocols also support redemption, where anyone can redeem the stablecoins for the underlying collateral at the face value(i.e 1 stablecoin = 1 USD worth of collateral). 

These two mechanisms enable the price stability of the stablecoin. Different protocols innovate on how they enable Liquidation and Redemption. 

In addition to Liquidation and Redemption, most protocols also collect fees in the form of interest rates- that is paid to savings pool(under different names) where users stake stablecoins in return for fees proportional to their stake in the pool. This also has an effect on controlling the supply of money.

# Problems
There are a couple of problems in the existing protocols.
1. **Interest Rates:** As described in the introduction section, interest rate appears to be a non-scalable approach. The reason why interest rates work in traditional finance is because the reserve banks have the power to create new supply, which is not possible in a smart contract based approach, unless all conditions are known prior and coded into the contracts. 
2. **Savings Pool**: Is optional. The protocols does not enforce or have an optionally enforced mechanism. Thus the only way protocols control money supply is through increasing interest rates and associated fee revenue for stakers.
3. **Token**: Many protocols also have tokens that capture most of the fee revenue of the protocol, and leave less for those that supply liquidity.

# StableBase
In the StableBase protocol, we also use the Collateral Debt Position mechanism with Liquidation and Redemption, and 0% interest rates. In place of Interest Rates, we introduce two new policy tools and describe how they play together.

## Policy Tools
1. **Stability Rate** Stability Rate is defined by the user(any value from 0-100% depending on market conditions). This is the rate that users pay as fee when opening a CDP position.
2. **Reserve Ratio** This rate is also fixed by the user when opening a CDP. By setting this, the user agrees to lock a percentage of borrowed stablecoin in the reserve pool.

The protocol mandates a borrowing user to set **StabilityRate** and optionally a Reserve Ratio. For those users that set a reserve ratio, stability rate will not be effected.

Because, these rates directly determine the price stability, redemptions are effected based on the following.

## Redemption Mechanism
1. **StabilityRate** - User that paid the lowest stability rate will be the first to get redeemed.
2. **Reserve Ratio** - If redemptions cannot happen with Stability Rate alone, a user that sets the lowest Reserve Ratio will be redeemed first.

Some users might also prefer much more predictable redemptions, for these users the protocol offers Redemption Protection. Thus we define **Target Stability Rate** 

**Target Stability Rate**: All borrowing users set a stability rate, and a stake weighted stability rate is calculated from among the reserve pool depositors, this will be the target stability rate.

### Redemption Protection
As mentioned above, a user can pay a **StabilityRate** equal to *Target Stability Rate* - which would protect the user from redemptions for one year. If the user pays less stability rate, the protection offered would be pro rata(subject to a minimum of 0.25%). For example: Let's say the target stability rate is 3.6%, and the user pays 1.2%, then the user will be protected for 4 months from redemptions. If the user pays only 0.2%, there will not be any redemption protection for the user. Users can purchase/renew redemption protection at any time.

Thus taking into account the redemption protection, the following happens during a redemption.

1. Check if there are any expired redemption protection, redeem these first.
2. Users with Lowest Stability Rate get redeemed next
3. Followed by stake weighted Stability Rate set by reserve pool.

The net effect of this is that the Stability Rate should increase or decrease with market conditions, in addition to reserve ratio requirements.

## Fee Collection and Distribution
All the fees that are collected from users paying Stability Rate at the time of opening the CDP or renewing redemption protection is paid to reserve pool depositors in proportion to their stake.

## Price Oracle
StableBase also needs price oracle to get the latest price of the collateral asset, just like any other CDP protocol.

## Unique Features
To summarize, StableBase offers several unique features:

1. 0% interest rate
2. Introduction of user governed target stability rate.
3. Introduction of redemption protection through target Stability rate.
4. Introduction of user defined Reserve Ratio to expand and shrink supply. 
5. Introduction of a user defined stability rate, adjustable periodically to suit redemption tolerance levels.
6. Yield for Reserve Pool depositors.

## Governance
Governance of StableBase is determined by users' stake in the Reserve Pool. The governance actions include: 

1. Addition of new collateral types.
2. Dynamically effecting target stability rate.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# User Experience 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

# Conclusion
StableBase represents a significant remodelling of existing CDP based protocols, with better stability mechanism through the introduction of a user-defined Cash Reserve Ratio and crowd governed target Stability Rate, along with a better incentive structure through the introduction of yield bearing reserve pool, and by providing a reliable medium of exchange with low(user defined) rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.