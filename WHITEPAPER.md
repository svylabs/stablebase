# Title:
StableBase: A Base layer Stablecoin protocol.

# Abstract:
Most stablecoin protocols in market today are optimized for yield incentives for stablecoin holders and token holders of the respective projects, thus making stablecoin borrowing cost prohibitive for most realworld usecases. In this whitepaper, we introduce StableBase, a base layer stablecoin protocol built on the Ethereum blockchain using Collateral Debt Position. StableBase aims to provide a base layer stablecoin with 0% interest and origination fee, and enable higher layer protocols to provide yield opportunities and enable the utility of stablecoins in different usecases for consumers. This paper outlines the underlying technology, stability mechanism, use cases, issuance and redemption processes, along with unique features and governance structure. StableBase protocol issues USD pegged stablecoin named SBD a.k.a Stable Dollar.

# Introduction
The volatility of cryptocurrencies has hindered their mainstream adoption as mediums of exchange and several stablecoins have popped up to address the market demand. The most successful being DAI and fiat-backed stablecoins. However, most stablecoins in use today, barring the fiat-backed stablecoins are not suitable for real world usecases, mainly because of prohibitive interest rates / origination fees for many real world usecases. Nevertheless, the yield mania has attracted users - mainly the speculators, and stablecoins have found utility as a leveraging mechanism and other speculative usecases. To make decentralized stablecoins attractive in wide circumstances, we have identified 6 basic principles, namely
1. Low cost: Interest rate trending towards 0%
2. Scalability: Available using wide collateral options.
3. Accessibility: Stablecoin should be accessible to many different types of borrowers.
4. Stability: Ability to maintain peg with minimal governance
5. Incentives: Right incentives for stakeholders or none at all.
6. Decentralization.

These principles and also data from the market have lead us to conclude it will be very difficult to achieve all of these at once by any one stablecoin protocol and that we need a layered approach for the development and usage of stablecoins, with the base layer being open, free to use, decentralized, while higher layers can innovate on incentives(rates and yield), accessibility and other parameters. In this paper, we propose a design for such a base layer protocol for stablecoins.

# Technology
StableBase is built on the Ethereum blockchain, benefiting from its smart contract capabilities, security, and widespread adoption within the decentralized finance (DeFi) ecosystem.

# Borrowing and Withdrawal
StableBase utilizes a CDP mechanism, requiring users to overcollateralize their loans by at least 110%. Users create a Safe, where they deposit their collateral and the protocol issues SBD token. By opening a Safe with StableBase, the user not just borrows SBD coins at 0% rate, but also accepts the Liquidation and Redemption risks involved and thus agrees to actively take part in the stability of the protocol.

Withdrawal is facilitated through repayment of the borrowed SBD back to the protocol.

# Stability Mechanism
There are two direct mechanisms addressing the stability of the stablecoin and the protocol, namely **Liquidation** and **Redemption**, which are common across several protocols and we introduce a third, an indirect mechanism that deal with stability, namely: **Cash Reserve Ratio**. Each of these is discussed below.

## Liquidation
Liquidation occurs if the value of the collateral falls below 110% of the borrowed amount, ensuring stability. Stability Pool that appears in other protocols is intentionally kept outside of the protocol, allowing anyone with stablecoins to liquidate other's CDP position.

Liquidators pay 100.5% of the SBD borrowed by the Safe to withdraw the underlying collateral worth about roughly 110%. The 0.5% fee is paid to the Reserve Pool described below, netting the difference as profit.

## Redemption
Any user can redeem the stablecoins for the underlying collateral and the protocol would issue 1 USD worth of collateral for 1 SBD redeemed.

## Cash Reserve Ratio(CRR) and Reserve Pool
Cash Reserve Ratio in TradFi is a rate set by the Fed/Central banks, that tells what percentage of cash deposits should be held as reserve by the banks. In our protocol, we make use of a modified defintion of CRR. In our protocol, we are introducing a user defined Cash Reserve Ratio rather than it being set by the protocol. 

At the time of borrowing, a user can specify Cash reserve ratio(CRR)- which we define as the perentage of borrowed stablecoin value that will be held with the StableBase protocol in a Reserve Pool, and returned back to the user when the user wants to close the loan position, or at any time the user wants to withdraw some reserves.

### Utility
This instrument allows the protocol to autonomously control the supply of coins depending on the market condition. This is different from interest rate or origination fee as it is fully withdrawable by the user.

### Redemption Mechanism
The CRR selected by the user will also determine the order of redemption, if and when the redemption happens. The lowest CRR Safes are the first to be redeemed, and the Safe that is redeemed will also forfeit CRR reserves of an equivalent amount of SBD redeemed, which will be distributed to the rest of the reserves at stake. This mechanism prevents the CRR being too high nor too low. Thus redemptions, just like Liquidations are heavily penalised in StableBase protocol.

### Incentives
1. A fee of 0.5% is charged during Liquidation, and will be distributed to the proportionally in the Reserve Pool.
2. During redemption, a fee of an equivalent amount of the SBD redeemed, upto a maximum value equal to the reserve deposit amount is withheld from the Safe that is being redeemed and distributed to other depositors in proportion to their stake.

# Unique Features
StableBase offers several unique features:

1. 0% interest rate and 0% origination fee(a first in the market).
2. Introduction of user-defined Cash Reserve Ratio that help shrink or expand the supply of stablecoin depending on market conditions.
3. Redemption happens from the Safe with the lowest CRR.
4. A Base layer stablecoin protocol, that allows higher layer protocols utilizing stablebase to innovate on yield and rates.
5. Liquidation and Redemption fee incentives for CRR depositors.

As long as a Safe does not get liquidated or redeemed, the Safe enjoys a 0% rate, naturally providing an incentive for better managed Safes, and ensuring price stability of the stablecoin.

# Use Cases
StableBase Dollar(SBD) serves as a reliable medium of exchange for various real-world transactions, including cross-border payments, remittances, e-commerce transactions, and decentralized finance (DeFi) activities. In addition, it allows layer 1 protocols emerge that utilize the SBD stablecoin to facilitate Supply Chain and Trade Finance, due to our offering a base rate of 0% rate in the market for any term.

Just like how commercial banks cater to a wide userbase in the traditional world, we expect new protocols and financial companies borrow SBD at 0% rate from the protocol and offer loans to customers either modelling DeFi protocols (like Aave), or through their own compliant mechanisms, offering better yields for SBD in the higher layers.

# Stability Assurance
The redemption and liquidation mechanisms maintain the stability of StableBase (SBD), ensuring its value remains close to 1 USD, while Cash Reserve Ratio helps shrink and expand the supply of stablecoin further aiding in stabilising the peg.

# Governance
Governance of StableBase is determined by users' stake in the Reserve Pool. The deposited reserves are used for governance decisions, mainly addition of new collateral types.

# Tokenomics
As a purely decentralized stablecoin, StableBase (SBD) does not offer any additional tokens apart from the stablecoin itself.

# Risks
While the design and introduction of unique features sound exciting, there are risks associated with the protocol. 

## User Experience: 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

## Risk Management: 
While the CRR mechanism adds flexibility, it also introduces potential risks, such as manipulation and heavy penalization for redemption. Thus, robust risk management protocols and monitoring mechanisms will be crucial to mitigate these risks by those that open a Safe with stablebase, thus the protocol mainly caters to the sophisticated players in the ecosystem, while higher layers of the protocol would allow for usage by regular users who want predictable rates.

# Conclusion
StableBase represents a significant advancement in stablecoin mechanics, offering stability, efficiency, user-driven governance and the introduction of user defined Cash Reserve Ratio. By providing a reliable medium of exchange for real-world transactions, and with low rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.