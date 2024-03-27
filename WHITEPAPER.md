# Title:
StableBase: A Base layer Stablecoin protocol.

# Abstract:
Most stablecoin protocols in the market today are optimized for yield incentives for stablecoin and token holders, making stablecoin borrowing costs prohibitive for many real-world use cases. In this whitepaper, we introduce StableBase, a base layer stablecoin protocol built on the Ethereum blockchain using Collateral Debt Position. StableBase aims to provide a base layer stablecoin with 0% interest and origination fees, allowing higher layer protocols to offer yield opportunities and enable the utility of stablecoins across various consumer use cases. This paper outlines the underlying technology, stability mechanisms, use cases, issuance and redemption processes, along with unique features and governance structure. StableBase protocol issues a USD-pegged stablecoin named SBD, also known as Stable Dollar.

# Introduction
The mainstream adoption of cryptocurrencies as mediums of exchange has been hindered by their volatility, prompting the emergence of stablecoins to meet market demand. However, most stablecoins today, excluding fiat-backed ones, are unsuitable for real-world use cases due to high interest rates and origination fees. The yield mania has attracted users, mainly speculators, leveraging stablecoins for speculative purposes. To make decentralized stablecoins attractive in broader contexts, we propose a layered approach, with a base layer being open, free to use, and decentralized, while higher layers innovate on incentives, accessibility, and other parameters. This paper presents the design for such a base layer stablecoin protocol.

# Technology
StableBase is built on the Ethereum blockchain, benefiting from its smart contract capabilities, security, and widespread adoption within the decentralized finance (DeFi) ecosystem.

# Borrowing and Withdrawal
StableBase utilizes a CDP mechanism, requiring users to overcollateralize their loans by at least 110%. Users create a Safe, where they deposit their collateral and the protocol issues SBD token. By opening a Safe with StableBase, the user borrows SBD coins at 0% interest rate, while also accepting the risks of Liquidation and Redemption, and actively contributing to the stability of the protocol.

Withdrawal is facilitated through repayment of the borrowed SBD back to the protocol.

## Base Stability Rate or Base Rate
Base Rate is initially set to 0%, and is dynamically updated based on average base rate set by users. For more details on this, check the governance.

## Interest Rates
Interest Rates are always set to 0%. This is to ensure the redemption process works smoothly in the long term.

# Stability Mechanism
The stability of the stablecoin and protocol is ensured through three mechanisms: Liquidation, Redemption, and the Cash Reserve Ratio (CRR).

## Liquidation
Liquidation occurs if the value of the collateral falls below 110% of the borrowed amount, ensuring stability.

Liquidators pay 100.5% of the borrowed SBD to withdraw the underlying collateral, with a 0.5% fee distributed to the Reserve Pool.

## Redemption
Users can redeem stablecoins for the underlying collateral at a 1:1 ratio, with fees equal to base rate charged to the redeemer and distributed to other depositors in the Reserve Pool.

## Cash Reserve Ratio(CRR) and Reserve Pool
In traditional finance (TradFi), the Cash Reserve Ratio (CRR) is a rate determined by central banks, specifying the percentage of cash deposits that banks are required to hold as reserves. In our protocol, we adopt a modified definition of the CRR.

The CRR, defined as the percentage of borrowed stablecoin value held in the Reserve Pool, can be specified by users at the time of borrowing. This mechanism empowers the protocol to autonomously manage the coin supply in response to market conditions.

### Redemption Mechanism
The CRR selected by the user will also determine the order of redemption, if and when the redemption happens. The lowest CRR Safes are the first to be redeemed. During redemption, a fee equivalent to base rate of the value redeemed will be charged to the redeemer.

# Unique Features
StableBase offers several unique features:

1. 0% interest rate and user governed origination fee(a first in the market).
2. Introduction of User-defined Cash Reserve Ratio(a first in the market).
3. Redemption from Safes with the lowest CRR.
4. A base layer protocol with 0% interest rate, enabling higher layer innovation in yield and rates.
5. Liquidation and Redemption fee incentives for CRR depositors.

As long as a Safe does not get liquidated or redeemed, the Safe enjoys a 0% rate, naturally providing an incentive for better managed Safes, and ensuring price stability.

# Use Cases
StableBase Dollar (SBD) serves as a reliable medium of exchange for various real-world transactions, including cross-border payments, remittances, e-commerce, and DeFi activities. It also enables layer 1 protocols to facilitate supply chain and trade finance, thanks to its 0% interest rate.

# Stability Assurance
The redemption and liquidation mechanisms maintain the stability of StableBase (SBD), ensuring its value remains close to 1 USD, while Cash Reserve Ratio helps shrink and expand the supply of stablecoin further aiding in stabilising the peg.

# Governance
Governance of StableBase is determined by users' stake in the Reserve Pool. The governance actions include: 

1. Addition of new collateral types.
2. Setting base rate.

## Dynamic Updation of Base Rate

The base rate is initially set to 0%. Any user can dynamically change the base rate(upto 0.5% at any one time) and the protocol calculates a stake weighted average of the base rate set by stakes in reserve pool and that becomes the effective 

1. Origination fee rate, when a new Safe is opened. 
2. Redemption fee rate, when a Safe is redeemed.
3. Liquidation fee rate, when a Safe is liquidated.

### Conditions to change the rate
1. User should have a stake in reserve pool
2. User can change the base rate only by upto a maximum of 0.5% at any time, once set - the rate cannot be changed by the user for 3 days.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# Risks
While the unique features present exciting opportunities, there are associated risks. The complexity of the CRR mechanism and redemption process may challenge users, and robust risk management protocols are essential to mitigate potential manipulation and penalization risks.

## User Experience: 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

## Risk Management: 
While the CRR mechanism adds flexibility, it also introduces potential risks, such as manipulation and heavy penalization for redemption. Thus, robust risk management protocols and monitoring mechanisms will be crucial to mitigate these risks by those that open a Safe with stablebase, thus the protocol mainly caters to the sophisticated players in the ecosystem, while higher layers of the protocol would allow for usage by regular users who want predictable rates.

# Conclusion
StableBase represents a significant advancement in stablecoin mechanics, offering stability, efficiency, user-driven governance, and the introduction of a user-defined Cash Reserve Ratio. By providing a reliable medium of exchange with low rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.
