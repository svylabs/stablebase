# Title:
StableBase: Base layer Stablecoin.

# Abstract:
Most stablecoin protocols in market today are optimized for yield incentives for stablecoin holders and token holders of the respective projects, thus making stablecoin cost prohibitive for most realworld usecases. In this whitepaper, we introduce StableBase, a base layer stablecoin project built on the Ethereum blockchain using Collateral Debt Position mechanism. StableBase aims to provide a base layer stablecoin with 0% interest and origination fee, and enable higher layer applications to provide better rates and enable utility of stablecoins in different usecases for consumers. This paper outlines the underlying technology, stability mechanism, use cases, issuance and redemption processes, along with unique features and governance structure. StableBase protocol issues USD pegged stablecoin named SBD

# Introduction
The volatility of cryptocurrencies has hindered their mainstream adoption as mediums of exchange and several stablecoins have popped up to address the market demand for stable cryptocurrencies. However, most stablecoins in use today are not suitable for real world usecases, mainly because of prohibitive interest rates / origination fees. Nevertheless, the yield mania has attracted several speculators and stablecoins have found a utility in leverage mechanisms and speculative usecases. To make decentralized stablecoins attractive in wide circumstances, we have identified 6 basic principles, namely
1. Low cost: Interest rate trending towards 0%
2. Scalability: Available using wide collateral options.
3. Accessible: Stablecoin should be accessible to many different types of borrowers.
4. Stability: With minimal governance
5. Incentives: Right incentives for stakeholders or none at all(in traditional sense).
6. Decentralization.

These principles and also data from the market have lead us to conclude it will be very difficult to achieve all of these at once by stablecoin protocol and that we need a layered approach for the development of stablecoins, with the base layer being open, free to use, decentralized, while higher layers can innovate on incentives(rates and yield) and accessibility.

# Technology
StableBase is built on the Ethereum blockchain, benefiting from its smart contract capabilities, security, and widespread adoption within the decentralized finance (DeFi) ecosystem.

# Borrowing and Withdrawal
StableBase utilizes a CDP mechanism, requiring users to overcollateralize their loans by at least 110%. Withdrawal is facilitated through repayment of the borrowed stablecoin back to the contract.

# Stability Mechanism
There are two direct mechanisms addressing the stability of the stablecoin and the protocol, namely **Liquidation** and **Redemption**, which are common across several protocols. A third mechanism, an indirect one - is what we call **Cash Reserve Ratio**

## Liquidation
Liquidation occurs if the value of the collateral falls below 110% of the borrowed amount, ensuring stability. Stability Pool that appears in other protocols is intentionally kept outside of the protocol, allowing anyone with stablecoins to liquidate other's CDP position.

## Redemption
Any user can redeem the stablecoins for the underlying collateral and the protocol would issue 1 USD worth of collateral for 1 SBD redeemed. However, the redemption happens in two steps instead of one. This would allow for MEV protection that we often see with other protocols.

## Cash Reserve Ratio
At the time of borrowing, a user can specify the Cash reserve ratio(CRR)- which we define as the perentage of borrowed stablecoin value that will be held with the StableBase protocol(This is similar to Cash Reserve Ratio used by Fed and other central banks). Cash Reserve Ratio in TradFi is set by the central banks, whereas in our protocol, this is user defined. The Cash Reserve will be allocated at borrow time and deposited into the StableBase contracts. This instrument allows protocol to autonomously control the supply of coins depending on the market condition. The Cash Reserve Ratio selected by the user will also determine the order of redemption, if and when a redemption happens. The Cash Reserve deposited in this manner is also fully withdrawable at any time by the user, which differs from other protocols that charge an origination fee or interest rate.

# Unique Features
StableBase offers several unique features:

1. 0% interest rate and origination fee forver(a first in the market).
2. Introduction of user-defined Cash Reserve Ratio that help contract and expand the supply of stablecoin depending on market conditions.
3. Redemption mechanism based on lowest Cash Reserve Ratio.
4. A Base layer stablecoin protocol, with 0% rates that allows higher layer protocols utilizing stablebase to innovate on yield and rates.
5. A fee of 0.5% is charged during Redemption and Liquidation, that will be rewarded to Cash Reserve depositors in proportion to their stake, encouraging users to deposit more percentage of their loans to reserves.
6. MEV protected redemptions.

# Use Cases
StableBase (SBD) serves as a reliable medium of exchange for various real-world transactions, including cross-border payments, remittances, e-commerce transactions, and decentralized finance (DeFi) activities. In addition, it allows layer 1 protocols emerge that utilize the SBD stablecoin to facilitate Supply Chain and Trade Finance, due to our offering of 0% rate in the market for any term.

# Stability Assurance
The redemption and liquidation mechanisms maintain the stability of StableBase (SBD), ensuring its value remains close to 1 USD, while Cash Reserve Ratio helps shrink and expand the supply of stablecoin further aiding in stabilising the peg.

# Governance
Governance of StableBase is determined by users' stake in Cash Reserve. The deposited reserves are used for governance decisions, mainly Addition of new collateral types. Any deposit holder can delegate to others.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# Conclusion
StableBase represents a significant advancement in stablecoin technology, offering stability, efficiency, and user-driven governance. By providing a reliable medium of exchange for real-world transactions, StableBase aims to accelerate the adoption of digital currencies in the global economy.