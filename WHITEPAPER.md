                                     StableBase: A Stablecoin protocol for wide user profiles.
                                                        Sridhar G<sg@svylabs.com>

# Abstract
One of the important functions of reserve bank in Traditional Finance is price stability. This is achieved through multiple policy tools, the primary one being controlling interest rates. There are other lesser known policy tools- like Repo rate, Reserve Ratio, etc. These tools aid in contracting and expanding the supply of money in the economy. In the cryptocurrency world, the primary tool used to control money supply for stablecoin protocols are the interest rate and the collateral requirements(which is usually fixed for a given collateral). There has not been much innovations since then. In this paper, we introduce StableBase, a new stablecoin protocol with 0% interest rates, but achieve the same effect of price stability, and contracting and expanding the money supply during different market conditions through two new policy tools, namely user defined stability rate, and user defined reserve ratio and how they play together to achieve price parity with the pegged currency and in the process enhancing the borrowing experience for a range of user profiles(regular to advanced users).

# Introduction
Most existing stablecoin issuing protocols(eg: MakerDAO, CurveUSD) use interest rate as a mechanism to incentivse and disincentivise borrowing. Liquity Protocol is currently the only protocol that offers interest free loans, but it suffers from capital efficiency and also fails to adapt to different market conditions, especially seen during high interest rate period, further the incentive structure to pay fee revenue to token holders as opposed to liquidity providers has had negative impact on the protocol as can be seen from the reduced circulation of the stablecoin. To improve on this, Liquity Protocol proposed launching v2 of their protocol with user defined interest rate(February 2024)[1] after our team had proposed user defined origination fee back in December 2023[2]. However, interest rates and yield are not the only determining factors when it comes to improving the utility of stablecoins. The borrowing costs have to make sense for a range of user profiles. This cannot be achieved only through adaptible interest rates.

Interest free loans by Liquity protocol were a step in the right direction, but it was an incomplete protocol that failed to adapt to market conditions. In this paper, we discuss a new protocol with 0% interest rate, and how we have evolved our original proposal of user defined origination fee into two new policy tools for CDP stablecoins- namely, user defined stability rate(origination fee is renamed to stability rate) and user defined reserve ratio(borrowing from reserve ratio in TradFi). Using these two tools, we also come up with robust stability mechanics and predictable redemptions for the StableBase protocol, at the same time the users enjoy maximum flexibility and predictability with their loans.

# Collateral Debt Position
Collateral Debt Position mechanism is the most popular mechanism used to create stablecoin protocols. Users can deposit collateral and borrow stablecoins based on the value of the collateral, provided the collateral sufficiently backs the debt at all times until the loan is closed. If the collateral drops in value beyond a threshold(usually 110% and varaible for different collateral types used based on the risk levels), a liquidation event is triggered that allows a liquidator to pay back the loan to get the underlying collateral for a discounted price(related to market value).

In addition to Liquidation, some protocols(like Liquity Protocol) also support redemption, where anyone can redeem the stablecoins for the underlying collateral at the face value(i.e 1 stablecoin = 1 USD worth of collateral). 

These two mechanisms enable the price stability of the stablecoin. Different protocols innovate on how they enable Liquidation and Redemption. 

In addition to Liquidation and Redemption, most protocols also collect fees in the form of interest rates- that is paid to savings pool(under different names) where users stake stablecoins in return for fees proportional to their stake in the pool. This also has an effect on controlling the supply of money.

# StableBase
In this paper, we introduce the StableBase protocol, using the Collateral Debt Position mechanism with Liquidation, Redemption, and 0% interest rates. In place of interest rates, we introduce two new policy tools and describe how they play together to contribute to robust stability of the protocol.

## Policy Tools
1. **Stability Rate** Stability Rate is defined by the user(any value from 0-100% depending on market conditions). This is the rate that users pay as one time fee when opening a CDP position.
2. **Reserve Ratio** This rate is also fixed by the user when opening a CDP. By setting this, the user agrees to lock a percentage of borrowed stablecoin in the reserve pool.

The protocol mandates a borrowing user to set **StabilityRate** and optionally a **Reserve Ratio**. For those users that set a reserve ratio, stability rate will not be effected. However all users need to set Stability Rate as the protocol calculates a **Target Stability Rate** from all user inputs.

These rates directly determine the circulation of stablecoins and hence the price stability, thus, redemptions are effected based on these parameters.

## Liquidation
The protocol supports the following two liquidation modes.

### Protocol Liquidation
If the collateral value falls below 108%, a protocol liquidation can be triggered. The protocol would distribute the collateral of a CDP to existing borrowers.

### Third Party Liquidation
A third-party, for example: a Liquidation Pool(out of scope for the protocol) or third-party user can trigger liquidation. In this case, the underlying collateral of the CDP would be returned to the user that liquidated. Third party liquidations can be triggered when the value of the collateral falls below 110%.

## Redemption
Redemption is another mechanism to ensure the stability of the protocol that can be triggered by users at any time. Users can reedem 1 stablecoin for the equivalent of 1 USD worth of underlying collateral. The protocol decides on the priority for redeeming open CDPs. This is where the *Stability Rate* and *Reserve Ratio* set by users become important, as these directly affect the value of the stablecoin if they are too low or high.

1. **Reserve Ratio** - The protocol targets reserve ratios set by the users to be closer, within a range of 1%. If the difference is more, the CDP that is at a greater distance from the reference stake weighted reserve ratio will be the first to get redeemed, until the difference is again close to 1%.
2. **StabilityRate** - If redemption cannot happen through (1), user that paid the lowest stability rate will be redeemed.
3. **Reserve Ratio** - If redemption cannot happen through (2), lowest reserve ratio CDPs would be redeemed again, even if the difference is within 1%.

Some users might also prefer more predictable redemptions, for these users the protocol offers Redemption Protection. To understand redemption protection, we need to define **Target Stability Rate**

**Target Stability Rate**: All borrowing users set a stability rate, and a stake weighted stability rate is calculated from among the reserve pool depositors, this will be the target stability rate.

### Redemption Protection
Due to the nature of the stablecoin mechanics and redemptions, a user has to actively manage their CDP, by increasing or decreasing the stability rate and reserve ratio. This may not be possible for all users as some users want predictability in redemptions. For these users, the protocol offers Redemption Protection mechanism.

A user, at the time of opening the CDP can pay **StabilityRate** equal to **Target Stability Rate** - which would protect the user from redemptions for one year. If the user pays less stability rate, the protection offered would be pro rata(subject to a minimum of 0.25% or 1 month). For example: Let's say the target stability rate calculated by the protocol is 3.6%, and the user chooses to pay 1.2%, then the user will be protected for 4 months from redemptions. If the user pays only 0.2%, there will not be any redemption protection for the user. Users can purchase/renew redemption protection at any time.

Thus taking into account the redemption protection, the following happens during a redemption.

1. **Expired Redemption Protected CDP**: Check if there are any expired redemption protected CDPs, redeem these first.
2. **Reserve Ratio** - The protocol targets reserve ratios set by the users to be closer, within a range of 1%. If the difference is more, the CDP that is at a greater distance from the reference stake weighted reserve ratio will be the first to get redeemed, until the difference is again close to 1%.
3. **StabilityRate** - If redemption cannot happen through (1, 2), user that paid the lowest stability rate will be redeemed.
4. **Reserve Ratio** - Lowest reserve ratio CDPs would be targetted again in case redemptions through 1, 2, 3 are not possible

The net effect of this mechanism is that the Stability Rate should increase or decrease with market conditions, in addition to reserve ratio requirements, effectively expanding and contracting the supply of the stablecoins depending on market conditions there by stabilizing the peg.

## Savings Pool
In addition to reserve pool, there will be a savings pool where any SBD holder can park their stablecoin savings in return for accrued fees from the protocol.

## Fee Collection and Distribution
All the fees that are collected from users paying Stability Rate at the time of opening the CDP or renewing redemption protection is paid to

1. Reserve pool depositors in proportion to their stake.
2. Savings Pool depositors in proportion to their stake.

The fee is distributed in the following manner:
1. Fees paid by Redemption Protected CDPs will be distributed to Reserve Pool(75%) and Savings Pool(25%).
2. Fees paid by Unprotected CDPs will be distributed to Savings Pool(75%) and Reserve Pool(25%).

The fee distribution structure encourage the *reserve pool stakers* to set an optimal **target stability rate** to maximize their fee revenue for a given market condition.

## Price Oracle
StableBase also needs price oracle to get the latest price of the collateral asset, just like any other CDP protocol. StableBase plans to use Chainlink as the price oracle for various collateral assets.

## Unique Features
To summarize, StableBase offers several unique features:

1. 0% interest rate
2. Introduction of user defined reserve ratio as a way to contract and expand money supply.
3. Introduction of user defined stability rate to allow for flexible borrowing terms.
4. Introduction of redemption protection for better UX for regular users.
5. Yield for Reserve Pool and Savings Pool depositors.
6. Experimental stability mechanics that caters to both advanced(traders, hedge funds, market makers, institutions, etc.) and regular borrowers(salaried).

# User Profiles 
There are four kinds of user profiles with StableBase.

1. **Borrower: User that pays only stability rate**
   - *Risk Level*: High Risk(low stability rate), Moderate Risk(High stability rate).
   - *Reward*: Pays one time user-chosen stability fee depending on market conditions.
   - *Skill Level*: Advanced, needs to monitor rates and increase stability rate if needed based on market condition.
   - *Target User Profile*: (Active Traders, those looking for short term loans that can tolerate slight risk of redemption)
2. **Borrower: User that pays stability rate with redemption protection**
   - *Risk Level*: Low Risk(only Liquidation risk, redemptions are protected for the time period according to chosen stability rate)
   - *Reward*: Lowest Risk
   - *Skill Level*: Low
   - *Target User Profile*: (Normal salaried crypto users that wants to borrow and repay at set intervals, those looking for predictable loan terms).
3. **Borrower: User that doesn't pay any fee, but takes part in stability through reserve ratio**
   - *Risk Level*: High Risk(those that deviate from reference reserve ratio significantly), Moderate Risk(Lowest Reserve Ratio).
   - *Reward*: Share of Fee revenue, 0% stability rate
   - *Skill Level*: Advanced, needs to monitor reserve ratio and adjust periodically to avoid redemptions, set stability rate to maximize fee revenue for given market conditions.
   - *Target User Profile*: (Institutions, Hedge funds, Market makers, those looking to generate yield on their assets)
4. **Holder: Acquired stablecoins through trade**
   - *Risk Level*: Low(Only risk is that the stablecoin goes off peg).
   - *Reward*: Share of Fee revenue through Savings Pool.
   - *Skill Level*: Low
   - *Target User Profile*: (Anyone that wants to use stablecoin for transactions / hold it)

Users can choose how they want to use the protocol based on their risk tolerance and their requirements.

# Available Collateral
ETH, StakedETH(stETH) and WrappedBTC(WBTC) will be the only collateral supported by the protocol.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# Conclusion
StableBase represents a significant remodelling of existing CDP based protocols, with an experimental stability mechanism through the introduction of a 0% interest rate, coupled with user-defined Cash Reserve Ratio and user-defined Stability Rate, along with a better incentive structure through the introduction of yield bearing reserve pool.