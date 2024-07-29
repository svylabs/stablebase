                                            StableBase: Stablecoin Issuing Protocol with alternate stability mechanics.
                                                            Sridhar G<sg@svylabs.com>

# Abstract
One of the important functions of a reserve bank in Traditional Finance is price stability. This is achieved through multiple policy tools, the primary one being controlling interest rates. There are other lesser known policy tools- like Repo rate, Reserve Ratio, etc. These tools aid in contracting and expanding the supply of money in the economy. In the cryptocurrency world, the primary tool used to control money supply for stablecoin protocols are the interest rate and the collateral requirements(which is usually fixed for a given collateral). There has not been much innovations since then. In this paper, we introduce StableBase, a new stablecoin protocol with 0% interest rates, but achieve the same effect of contracting and expanding the money supply during different market conditions through two new policy tools, namely user defined stability rate, and user defined reserve ratio and how they play together to achieve price parity with the pegged currency.

# Introduction
Most existing stablecoin issuing protocols(eg: MakerDAO, CurveUSD) use interest rate as a mechanism to incentivse and disincentivise borrowing. Liquity Protocol is currently the only protocol that offers interest free loans, but it suffers from capital efficiency and also fails to adapt to different market conditions, especially seen during high interest rate period, further the incentive structure to pay fee revenue to token holders as opposed to liquidity providers has had negative impact on the protocol as can be seen from the reduced circulation of the stablecoin. To improve on this, Liquity Protocol proposed launching v2 of the protocol with user defined interest rate(February 2024)[1] after our team had proposed user defined origination fee back in December 2023[2]. This leaves a hole in interest free loans space as Liquity v1 is not suitable in all market conditions. In this paper, we discuss how we have evolved our original proposal of user defined origination fee into two new policy tools for CDP stablecoins- namely, user defined stability rate(origination fee is renamed to stability rate) and user defined reserve ratio(borrowing from reserve ratio in TradFi). Using these two tools, we also come up with robust stability mechanics and predictable redemptions for the StableBase protocol, at the same time the users enjoy maximum flexibility and predictability with their loans.

# Collateral Debt Position
Collateral Debt Position mechanism is the most popular mechanism used to create stablecoin protocols. Users can deposit collateral and borrow stablecoins based on the value of the collateral, provided the collateral sufficiently backs the debt at all times until the loan is closed. If the collateral drops in value beyond a threshold(usually 110% and varaible for different collateral types used based on the risk levels), a liquidation event is triggered that allows a liquidator to pay back the loan to get the underlying collateral for a discounted price(related to market value).

In addition to Liquidation, some protocols(like Liquity Protocol) also support redemption, where anyone can redeem the stablecoins for the underlying collateral at the face value(i.e 1 stablecoin = 1 USD worth of collateral). 

These two mechanisms enable the price stability of the stablecoin. Different protocols innovate on how they enable Liquidation and Redemption. 

In addition to Liquidation and Redemption, most protocols also collect fees in the form of interest rates- that is paid to savings pool(under different names) where users stake stablecoins in return for fees proportional to their stake in the pool. This also has an effect on controlling the supply of money.

# StableBase
In this paper, we introduce StableBase protocol, using the Collateral Debt Position mechanism with Liquidation and Redemption, and 0% interest rates. In place of Interest Rates, we introduce two new policy tools and describe how they play together to contribute to robust stability mechanism.

## Policy Tools
1. **Stability Rate** Stability Rate is defined by the user(any value from 0-100% depending on market conditions). This is the rate that users pay as one time fee when opening a CDP position.
2. **Reserve Ratio** This rate is also fixed by the user when opening a CDP. By setting this, the user agrees to lock a percentage of borrowed stablecoin in the reserve pool.

The protocol mandates a borrowing user to set **StabilityRate** and optionally a Reserve Ratio. For those users that set a reserve ratio, stability rate will not be effected. However all users needs to set Stability Rate as the protocol calculates a **Target Stability Rate** from all user inputs.

These rates directly determine the circulation of stablecoins and hence the price stability, thus, redemptions are effected based on these parameters.

## Redemption Mechanism
Redemption is an operation in the protocol, where users can reedem 1 stablecoin for the equivalent of 1 USD worth of underlying collateral. The protocol has to decide on the priority for redeeming open CDPs. This is where the *Stability Rate* and *Reserve Ratio* gets important.

1. **StabilityRate** - User that paid the lowest stability rate will be the first to get redeemed.
2. **Reserve Ratio** - If redemptions cannot happen based on (1), a user that sets the lowest Reserve Ratio will be redeemed.

Some users might also prefer more predictable redemptions, for these users the protocol offers Redemption Protection. We need to define **Target Stability Rate** in order to understand Redemption Protection.

**Target Stability Rate**: All borrowing users set a stability rate, and a stake weighted stability rate is calculated from among the reserve pool depositors, this will be the target stability rate.

### Redemption Protection
Due to the nature of the stablecoin mechanics and redemptions, a user has to actively manage his CDP, by increasing or decreasing the stability rate and reserve ratio. This may not be possible for all users as some users want predictability in redemptions. For these users, the protocol offers Redemption Protection mechanism. 

A user, at the time of opening the CDP can pay **StabilityRate** equal to **Target Stability Rate** - which would protect the user from redemptions for one year. If the user pays less stability rate, the protection offered would be pro rata(subject to a minimum of 0.25% or 1 month whichever is maximum). For example: Let's say the target stability rate calculated by the protocol is 3.6%, and the user chooses to pay 1.2%, then the user will be protected for 4 months from redemptions. If the user pays only 0.2%, there will not be any redemption protection for the user. Users can purchase/renew redemption protection at any time.

Thus taking into account the redemption protection, the following happens during a redemption.

1. Check if there are any expired redemption protection, redeem these first.
2. Users with the Lowest Stability Rate get redeemed next
3. Followed by stake weighted Stability Rate set by reserve pool.

The net effect of this is that the Stability Rate should increase or decrease with market conditions, in addition to reserve ratio requirements, effectively expanding and contracting the supply of the stablecoins depending on market conditions.

## Savings Pool
In addition to reserve pool, there will be a savings pool where any SBD holder can park their stablecoin savings in return for accrued fees from the protocol.

## Fee Collection and Distribution
All the fees that are collected from users paying Stability Rate at the time of opening the CDP or renewing redemption protection is paid to

1. Reserve pool depositors in proportion to their stake.
2. Savings Pool depositors in proportion to their stake.

The fee is distributed in the following manner:
1. Fees paid by Redemption Protected CDPs will be distributed to Reserve Pool(75%) and Savings Pool(25%).
2. Fees paid by Unprotected CDPs will be distributed to Savings Pool(75%) and Reserve Pool(25%).

The fee distribution structure encourages *reserve pool stakers* to set an optimal **target stability rate** to maximize their fee revenue.

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

# Available Collateral
ETH, StakedETH(stETH) and WrappedBTC(WBTC) will be the only collateral supported by the protocol.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# User Experience 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

# Conclusion
StableBase represents a significant remodelling of existing CDP based protocols, with better stability mechanism through the introduction of a user-defined Cash Reserve Ratio and crowd governed target Stability Rate, along with a better incentive structure through the introduction of yield bearing reserve pool, and by providing a reliable medium of exchange with low(user defined) rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.