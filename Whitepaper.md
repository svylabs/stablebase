# Title:
StableBase: Base layer Stablecoin.

# Abstract:
Most stablecoin protocols in market today are optimized for yield incentives for stablecoin holders and token holders of the respective projects, thus making stablecoin cost prohibitive for most realworld usecases. In this whitepaper, we introduce StableBase, a base layer stablecoin project built on the Ethereum blockchain using Collateral Debt Position mechanism. StableBase aims to provide a base layer stablecoin with 0% interest and origination fee, and enable higher layer applications to provide better rates and enable utility of stablecoins in different usecases for consumers. This paper outlines the underlying technology, stability mechanism, use cases, issuance and redemption processes, along with unique features and governance structure.

# Introduction
The volatility of cryptocurrencies has hindered their mainstream adoption as mediums of exchange. However, most stablecoins in use today are not suitable for real world usecases, mainly because of prohibitive interest rates / origination fees. However, the yield mania has attracted several speculators and stablecoins have found a utility in leverage trading and speculative usecases. To make decentralized stablecoins attractive, we have identified 6 basic principles, namely
1. Low cost: Interest rate trending towards 0%
2. Scalability: Available using wide collateral options.
3. Accessible: Stablecoin should be accessible to many different types of borrowers.
4. Stability: With minimal governance
5. Incentives: Right incentives for stakeholders or none at all(in traditional sense).
6. Decentralization.
These principles have lead us to conclude it will be very difficult to achieve all of these at once by one stablecoin and that we need a layered approach for development of stablecoins, with the base layer being open, free to use, decentralized, while higher layers can innovate on incentives(rates and yield), how stablecoins are made to cater to various types of borrowers, etc.

# Technology
StableBase is built on the Ethereum blockchain, benefiting from its smart contract capabilities, security, and widespread adoption within the decentralized finance (DeFi) ecosystem.

# Stability Mechanism
StableBase utilizes a CDP mechanism, requiring users to overcollateralize their loans by at least 110%. Liquidation occurs if the value of the collateral falls below this threshold, ensuring stability.

# Use Cases
StableBase (SBD) serves as a reliable medium of exchange for various real-world transactions, including cross-border payments, remittances, e-commerce transactions, and decentralized finance (DeFi) activities.

# Issuance and Redemption
Users can borrow SBD by depositing collateral, which is subject to liquidation if its value drops below the required threshold. Redemption is facilitated through repayment of the loan or by redeeming the underlying collateral asset, ensuring stability.

6. Unique Features
StableBase offers several unique features:

0% interest and origination fee
Users determine a reserve rate, depositing a fraction of the borrowed amount as reserve. This reserve is used for governance and can be withdrawn by the user at any time.
Liquidation and redemption fees are charged at 0.5% and are paid to reserve depositors in proportion to their SBD stake.
Redemption prioritization is based on the lowest reserve percentage deposited chosen by the user.
7. Stability Assurance
The redemption and liquidation mechanisms maintain the stability of StableBase (SBD), ensuring its value remains close to 1 USD.

8. Governance
Governance of StableBase is determined by users' reserve deposits. The deposited reserves are used for governance decisions, rewarding liquidation and redemption fees, and can be withdrawn by users at any time.

9. Regulatory Compliance
As a purely decentralized stablecoin, StableBase (SBD) does not fall under traditional regulatory frameworks. However, it operates transparently within the Ethereum blockchain ecosystem.

10. Conclusion
StableBase represents a significant advancement in stablecoin technology, offering stability, efficiency, and user-driven governance. By providing a reliable medium of exchange for real-world transactions, StableBase aims to accelerate the adoption of digital currencies in the global economy.