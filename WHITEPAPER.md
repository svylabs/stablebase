                                               StableBase: A Base layer Stablecoin protocol.
                                                        Sridhar G<sg@svylabs.com>

# Abstract
Most stablecoin protocols in the market today are optimized for yield incentives for stablecoin and token holders, making stablecoin borrowing costs prohibitive for many real-world use cases and the interest rates by itself is not sustainable for a CDP protocol in the long run. In this whitepaper, we introduce StableBase, a base layer stablecoin protocol built in Solidity using Collateral Debt Position(CDP) mechanism. The protocol aims to provide a base layer stablecoin with 0% interest rate and user governed stability fees, allowing higher layer protocols to offer yield opportunities and enable utility of stablecoins across various consumer use cases. This paper outlines the underlying technology, stability mechanisms, issuance and redemption processes, along with unique features and governance structure. StableBase protocol issues a USD-pegged stablecoin named SBD, also known as StableBase Dollar.

# Introduction
The mainstream adoption of cryptocurrencies as mediums of exchange has been hindered by their volatility, prompting the emergence of stablecoins to meet market demand. However, most stablecoins today, excluding fiat-backed ones, are unsuitable for real-world use cases due to high interest rates and origination fees. The yield mania has attracted users, mainly speculators, leveraging stablecoins for speculative purposes. To make decentralized stablecoins attractive in broader contexts, we propose a layered approach, with a base layer being open, low cost, and decentralized, while higher layers innovate on incentives, accessibility, and other parameters. This paper presents the design for such a base layer stablecoin protocol.

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
3. Reserve Pool that has the lowest reserve ratio will be redeemed if 1 & 2 doesn't exist.

# Unique Features
StableBase offers several unique features:

1. 0% interest rate
2. Introduction of user governed Target stability rate.
3. Introduction of redemption protection through target Stability rate.
4. Introduction of user defined Cash Reserve Ratio to alter and shrink supply. 
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

# Risks
While the unique features present exciting opportunities, there are associated risks. The complexity of the CRR mechanism, stability rate and redemption process may challenge users, and robust risk management protocols are essential to mitigate potential manipulation.

## User Experience 
The complexity of the CRR mechanism and the redemption process may present challenges for users, especially those unfamiliar with DeFi/TradFi concepts. Ensuring a smooth and intuitive user experience will be essential for adoption.

## Risk Management
While the CRR mechanism, stability rate and Redemption Protection adds flexibility, it also introduces potential risks, such as manipulation. Thus, robust risk management protocols and monitoring mechanisms will be crucial to mitigate these risks by those that open a Safe with stablebase, thus the protocol mainly caters to the sophisticated players in the ecosystem, while higher layers of the protocol would allow for usage by regular users.

# Conclusion
StableBase represents a significant remodelling of existing CDP based protocols, with better stability mechanism through the introduction of a user-defined Cash Reserve Ratio and crowd governed target Stability Rate, along with a better incentive structure through the introduction of yield bearing reserve pool, and by providing a reliable medium of exchange with low(user defined) rates, StableBase aims to accelerate the adoption of digital currencies in the global economy.