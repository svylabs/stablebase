                                       StableBase: Pay-as-you-go stablecoin protocol, without ongoing interest rates.
                                          Sridhar<sg@svylabs.com>, Gopalakrishnan<gopalakrishnan.g@gov.in>

# Abstract

This whitepaper presents a decentralized, market-driven stablecoin protocol that employs a pay-as-you-go model to maintain price stability while offering users efficient collateral management. Built on Collateralized Debt Positions (CDPs) without interest rates or origination fees, the protocol introduces innovative redemption mechanism for stability, while utilizing similar liquidation mechanism as existing protocols. Users can dynamically protect their positions through market-driven fees, aligning incentives and enhancing system stability. A Stability Pool and a token incentive program further encourage participation and robustness.

# Introduction

Stablecoins have become a cornerstone of the decentralized finance (DeFi) ecosystem, providing a bridge between volatile cryptocurrencies and stable assets. However, existing models often involve complexities like interest rates and fees, which can deter user adoption. This whitepaper introduces a decentralized, market-driven stablecoin protocol that simplifies the stablecoin model through a pay-as-you-go approach, ensuring security and stability while offering users flexibility in collateral management.

The protocol leverages Collateralized Debt Positions (CDPs) without imposing interest rates or origination fees. It features robust liquidation and redemption mechanisms, allowing users to dynamically protect their positions by paying market-driven fees. A Stability Pool and a token incentive program further enhance system robustness and encourage active participation.

# Background

As the DeFi space evolves, there is a growing demand for stablecoin solutions that are both user-friendly and resilient. Traditional models often require users to navigate complex fee structures and interest rates, which can hinder widespread adoption. By introducing a market-driven, pay-as-you-go model, this protocol aims to provide a more accessible and flexible stablecoin system.

# Mechanism Overview

## Collateralized Debt Positions (CDPs)

Users can lock Ethereum (ETH) as collateral to generate stablecoins (SBD) through CDPs. The amount of stablecoins minted is based on the value of the collateral and the desired collateralization ratio.

**Collateralization Ratio:** Users must maintain a minimum collateralization ratio of 110%.

**No Interest or Fees:** Users are not charged ongoing interest or origination fees when creating a CDP.

# Key Features

## No Interest Rates

The protocol does not impose any ongoing interest rates on borrowed stablecoins. Users can hold their positions indefinitely without accruing additional debt over time.

## No Origination Fees

There are no fees charged when opening a CDP. This encourages users to participate without the burden of upfront costs.

While there are no ongoing fees or upfront fees charged, stability of the stablecoin depends on the fee paid by users, otherwise users run the risk of redemption.

# Liquidation Mechanism

## Collateral Ratio Threshold

**Liquidation Trigger:** If a CDP's collateralization ratio falls below 110%, it becomes eligible for liquidation.

## Stability Pool Intervention

- **First Line of Defense**: The protocol first checks the Stability Pool for available funds to cover the undercollateralized debt.
- **Stability Pool Role**: Users stake their stablecoins in the Stability Pool to earn rewards and support the system's stability.

## Debt and Collateral Redistribution

- **Secondary Mechanism**: If the Stability Pool lacks sufficient funds, the protocol redistributes the debt and collateral of the liquidated CDP among existing CDPs.
- **Proportional Distribution**: Redistribution is based on the collateral each CDP holds, ensuring a fair and balanced adjustment.

# Redemption Process

## Redemption Queue

- **Mechanism Overview:** Redemptions are processed through a queue, where CDPs are ordered based on their collateralization ratios and fees paid.
- **Impact on CDPs:** Lower-collateralized CDPs are redeemed first unless users take protective measures.

## Market-Driven Pay-As-You-Go Model

- **Dynamic Protection:** Users can protect their CDPs from redemption by paying a top-up fee, a percentage of their borrowed amount.
- **Market-Driven Fees:** The fee is determined by market conditions, allowing users to pay as they go to maintain their preferred level of protection.
- **Fairness to New Borrowers:** When a new borrower opens a CDP, their fee paid percentage is set to the minimum fee paid percentage among all existing CDPs, ensuring fairness in the redemption queue.

## Protection Against Redemptions

- **Top-up Fee:** CDP owners can pay additional fees over time to improve their position in the redemption queue.
- **Priority Adjustment:** Paying the top-up fee moves the user up in the redemption queue, making their CDP less likely to be redeemed.

## Fee Distribution

- **Allocation to Stability Pool:** Fees collected from top-up payments and redemptions are distributed to Stability Pool stakers.
- **Incentive Alignment:** This mechanism incentivizes users to contribute to the Stability Pool, enhancing overall system stability.

# Stability Pool

## Staking Rewards

- **Stablecoin Staking**: Users can stake their stablecoins (SBD) in the Stability Pool.
- **Reward Structure**: Stakers receive 90% of the fees collected from users topping up to protect themselves.
- **Collateral Gains**: Users also gain collateral at discounted price compared to market rate from liquidations.

# Token Incentives

- **Additional Rewards:** Users earn protocol-native tokens (SBR) as incentives.
- **Duration:** Token incentives are available for one year from the protocol's launch.

# Token Incentive Program

## Distribution Schedule

- **No Premine**: Tokens are distributed without any initial premining.
- **Rate**: 1 SBR token is minted per second over 365 days.
- **Proportional Allocation**: Tokens are distributed to Stability Pool stakers in proportion to their stake.

## Staking SBR Tokens

- **Secondary Staking**: SBR tokens can be staked in a dedicated contract.
- **Additional Rewards**: Stakers receive 10% of the fees collected from redemptions and liquidations.

# Supported Collateral

- **Exclusive Asset:** The protocol exclusively supports Ethereum (ETH) as collateral.
- **Rationale:** ETH's liquidity and market acceptance make it a robust choice for collateralization.

# Conclusion

This stablecoin protocol offers a simplified and efficient approach to decentralized stablecoin issuance and management. By employing a market-driven, pay-as-you-go model, it provides users with flexibility in protecting their positions according to their individual needs and market conditions. The elimination of interest rates and origination fees lowers barriers to entry, making the system more accessible. The innovativeredemption mechanism, supported by the Stability Pool for liquidations and a robust token incentive program, ensure system stability and encourage active participation. This alignment of incentives fosters a resilient ecosystem that benefits all stakeholders.
