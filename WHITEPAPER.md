                           StableBase: A novel stablecoin protocol with enhanced borrowing experience
                                    Sridhar G<sg@svylabs.com>, Gopalakrishnan G<gopal.g@gov.in>
                        (SVY Labs,Netherlands), (PGPPM-IIM Bangalore, Civil Servant, Government of India)

# Abstract

One of the important functions of reserve bank in traditional finance is price stability. This is achieved through multiple policy tools, the primary one being controlling interest rates. There are other lesser known policy tools- like Repo rate, Reserve Ratio, etc. These tools aid in contracting and expanding the supply of money in the economy. In the cryptocurrency world, the primary tool used to control money supply for stablecoin protocols are the interest rate and the collateral requirements(which is usually fixed for a given collateral). In this paper, we introduce StableBase, a novel stablecoin protocol based on CDP mechanism, that achieves price stability during different market conditions through two new policy tools, namely pre-paid **Shielding rate**, and user-set **Reserve Ratio** and how they play together to achieve price parity with the pegged currency and in the process enhancing the borrowing experience by offering flexibility and predictability for users.

# Introduction

Most existing stablecoin issuing protocols(eg: MakerDAO, CurveUSD) use interest rate as a mechanism to incentivse and disincentivise borrowing. Liquity Protocol is currently the only protocol that offers interest free loans, but it suffers from capital efficiency and also fails to adapt to different market conditions, especially seen during high interest rate period, further the incentive structure to pay fee revenue to token holders as opposed to liquidity providers has had negative impact on the protocol as can be seen from the reduced circulation of the stablecoin. To improve on this, Liquity Protocol proposed launching v2 of their protocol with user defined interest rate(February 2024)[1] after our team had proposed user defined origination fee back in December 2023[2]. However, interest rates and yield are not the only determining factors when it comes to improving the demand for stablecoins. The borrowing costs have to make sense for a range of user profiles. This cannot be achieved only through adaptible interest rates.

Interest free loans by Liquity protocol were a step in the right direction, but it was an incomplete protocol that failed to adapt to market conditions. In this paper, we discuss a new protocol with 0% interest rate, and how we have evolved our original proposal of user defined origination fee into two new policy tools for CDP stablecoins- namely, user-set shielding rate and user-set reserve ratio(borrowing from reserve ratio in TradFi). Using these two tools, we also come up with robust stability mechanics and predictable redemptions for the StableBase protocol, at the same time the users enjoy maximum flexibility and predictability with their loans.

# Collateral Debt Position

Collateral Debt Position mechanism is the most popular mechanism used to create stablecoin protocols. Users can deposit collateral and borrow stablecoins based on the value of the collateral, provided the collateral sufficiently backs the debt at all times until the loan is closed. If the collateral drops in value beyond a threshold(usually 110% and varaible for different collateral types used based on the risk levels), a liquidation event is triggered that allows a liquidator to pay back the loan to get the underlying collateral for a discounted price(related to market value).

In addition to Liquidation, some protocols(like Liquity Protocol) also support redemption, where anyone can redeem the stablecoins for the underlying collateral at the face value(i.e 1 stablecoin = 1 USD worth of collateral).

These two mechanisms enable the price stability of the stablecoin. Different protocols innovate on how they enable Liquidation and Redemption.

In addition to Liquidation and Redemption, most protocols also collect fees in the form of interest rates- that is paid to savings pool(under different names) where users stake stablecoins in return for fees proportional to their stake in the pool. This also has an effect on controlling the supply of money.

# StableBase

In this paper, we introduce the StableBase protocol, using the Collateral Debt Position mechanism with Liquidation, Redemption, and 0% interest rates. In place of interest rates, we introduce two new policy tools and describe how they play together to contribute to robust stability of the protocol.

## Policy Tools

1. **Shielding Rate** Shielding Rate is the pre-paid fee that users pay to protect their CDP from redemptions. Users can choose to pay whatever fee(between 0-100%) is convenient for them. Redemption protection will be activated pro-rata based on the shielding rate paid and the **target shielding rate** at the time of opening the CDP.
2. **Reserve Ratio** This rate is also fixed by the user when opening a CDP. By setting this, the user agrees to lock a percentage of borrowed stablecoin in the reserve pool.

The protocol mandates a borrowing user to set either **Shielding Rate** or **Reserve Ratio**.

**Target shielding rate**: All reserve pool depositors set a target shielding rate, and a stake weighted target shielding rate is calculated from among the reserve pool depositors, this will be the target shielding rate.

These rates directly determine the circulation of stablecoins and hence the price stability, thus, redemptions are effected based on these parameters.

## Liquidation

The protocol supports the following two liquidation modes.

### Protocol Liquidation

If the collateral value falls below 108%, a protocol liquidation can be triggered. The protocol would distribute the collateral of a CDP to existing borrowers.

### Third Party Liquidation

A third-party, for example: a Stability Pool or third-party user can trigger liquidation. In this case, the underlying collateral of the CDP would be returned to the user that liquidated. Third party liquidations can be triggered when the value of the collateral falls below 110%.

## Redemption

Redemption is another mechanism to ensure the stability of the protocol that can be triggered by users at any time. Users can reedem 1 stablecoin for the equivalent of 1 USD worth of underlying collateral. The protocol decides on the priority for redeeming open CDPs. This is where the _shielding rate_ and _Reserve Ratio_ set by users become important, as these directly affect the value of the stablecoin if they are too low or high.

1. **Expired Shielded CDPs**: Check if there are any expired Shielded CDPs, redeem these first.
2. **Reserve Ratio** - The protocol targets reserve ratios set by the users to be closer, within a range of 1%. If the difference is more, the CDP that is at a greater distance from the reference stake weighted reserve ratio will be the first to get redeemed, until the difference is again close to 1%.
3. **Target Shielding Rate** - The protocol targets Shielding Rate to be within a range of 1%. If the difference is more, the CDP that is at a greater distance from the reference stake weighted target shielding rate will be the one to get redeemed, if redemption cannot happen through (1, 2). The target shielding rate is only set by reserve pool depositors.
4. **Reserve Ratio** - If redemption cannot happen through both (1, 2, 3), lowest reserve ratio CDPs would be redeemed again, even if the difference is within 1%.
5. **Target Shielding Rate** - If redemptions cannot happen through (1, 2, 3, 4), CDPs that set the lowest target shielding rate would be redeemed again.

### Shielded CDPs

Due to the nature of the stablecoin mechanics and redemptions, a user has to actively manage their CDP by increasing or decreasing the target shielding rate and/or reserve ratio. This may not be possible for all users, as some users want predictability in redemptions. For these users, the protocol offers Redemption protection mechanism through shielding rate.

A user, at the time of opening the CDP can pay **Shielding Rate** equal to **Target shielding rate** - which would protect the user from redemptions for one year. If the user pays less shielding rate, the protection offered would be on a pro rata basis. For example: Let's say the target shielding rate calculated by the protocol is 3.6%, and the user chooses to pay 1.2%, then the user will be protected for 4 months from redemptions. If the user pays only 0.2%, the CDP will be protected for roughly 20 days.

The protocol has an option to renew protection by paying a shielding rate again.

## Liquidity Pool

In addition to reserve pool, there will be a Liquidity Pool where any SBD holder can park their stablecoin savings in return for accrued fees from the protocol. The funds from Liquidity Pool will be used for the following

1. Enable borrowing of Stablecoins without minting at preset terms.
2. Enable Liquidations of bad debt.

The stakers in the pool gain benefit from

1. Accrued fees from borrowing.
2. Liquidation gains.
3. Liquidation and Redemption fees paid.

## Fee Collection and Distribution

All the fees that are collected from users paying shielding rate at the time of opening the CDP or renewing redemption protection is paid to

1. Reserve pool depositors in proportion to their stake.
2. Savings Pool depositors in proportion to their stake.

The fee is distributed in the following manner:

1. Fees paid by Redemption Protected CDPs will be distributed to Reserve Pool.
2. All fee paid by borrowings from Liquidity Pool goes to the Liquidity pool stakers.
3. All redemption fee goes to Liquidity Pool stakers.
4. Liquidation fee goes to the user that triggered Liquidation.

## Price Oracle

StableBase also needs price oracle to get the latest price of the collateral asset, just like any other CDP protocol. StableBase plans to use Chainlink as the price oracle for various collateral assets.

## Unique Features

To summarize, StableBase offers several unique features:

1. 0% interest rate
2. Introduction of user-set reserve ratio as a way to contract and expand money supply.
3. Introduction of pre-paid shielding rate to allow for flexible borrowing terms.
4. Introduction of redemption protection for better UX for regular users.
5. Yield for Reserve Pool and Savings Pool depositors.
6. Experimental stability mechanics that caters to both advanced(traders, hedge funds, market makers, institutions, etc.) and regular borrowers(salaried).

# User Profiles

There are three kinds of user profiles with StableBase.

1. **Borrower that pays shielding rate**
   - _Risk Level_: Low Risk(only Liquidation risk, redemptions are protected for the time period according to chosen shielding rate)
   - _Reward_: Lowest Risk
   - _Skill Level_: Low
   - _Target User Profile_: (Normal salaried crypto users that wants to borrow and repay at set intervals, those looking for predictable loan terms).
2. **Borrower that doesn't pay shielding rate, but takes part in stability through reserve ratio**
   - _Risk Level_: High Risk(those that deviate from reference reserve ratio significantly), Moderate Risk(Lowest Reserve Ratio).
   - _Reward_: Share of Fee revenue, 0% shielding rate
   - _Skill Level_: Advanced, needs to monitor reserve ratio and adjust periodically to avoid redemptions, set shielding rate to maximize fee revenue for given market conditions.
   - _Target User Profile_: (Institutions, Hedge funds, Market makers, those looking to generate yield on their assets)
3. **Holder: Acquired stablecoins through trade**
   - _Risk Level_: Low(Only risk is that the stablecoin goes off peg).
   - _Reward_: Share of Fee revenue through Savings Pool.
   - _Skill Level_: Low
   - _Target User Profile_: (Anyone that wants to use stablecoin for transactions / hold it)

Users can choose how they want to use the protocol based on their risk tolerance and their requirements.

# Available Collateral

ETH, StakedETH(stETH) and WrappedBTC(WBTC) will be the only collateral supported by the protocol.

# Tokenomics

As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# Conclusion

StableBase represents a significant remodelling of existing CDP based protocols, with new stability mechanics, where users benefit from 0% interest rate, coupled with user-set Reserve Ratio and user-set shielding rate, along with a better incentive structure through the introduction of yield bearing reserve pool.
