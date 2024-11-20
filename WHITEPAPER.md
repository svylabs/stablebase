                                       StableBase: A Minimalist's Stablecoin Protocol with a Simple Pay-as-You-Go Model.
                                           Sridhar<sg@svylabs.com>, Gopalakrishnan<gopalakrishnan.g@gov.in>

# Abstract

This whitepaper presents StableBase, a minimalist's stablecoin protocol that employs a pay-as-you-go model to maintain price stability while offering users efficient collateral management. Built on Collateralized Debt Positions (CDPs) without interest rates or origination fees, the protocol introduces an innovative redemption mechanism for stability while utilizing a familiar liquidation mechanism. Users can dynamically protect their positions through market-driven pre-paid fees, aligning incentives and enhancing system stability. A Stability Pool and a token incentive program further encourage participation and robustness.

# Introduction

Stablecoins have become a cornerstone of the decentralized finance (DeFi) ecosystem, providing a bridge between volatile cryptocurrencies and stable assets. However, existing models often involve complexities like interest rates, origination fees, and multi-collateral systems, which can deter user adoption. StableBase introduces a minimalist's stablecoin protocol that simplifies the stablecoin model through a pay-as-you-go approach, ensuring security and stability while offering users flexibility in collateral management.

The protocol leverages Collateralized Debt Positions (CDPs) without imposing interest rates or origination fees. It features robust liquidation and redemption mechanisms, allowing users to dynamically protect their positions by paying market-driven fees when necessary. A Stability Pool and a token incentive program further enhance system robustness and encourage active participation.

# Background

As the DeFi space evolves, there is a growing demand for stablecoin solutions that are both user-friendly and resilient. Traditional models often require users to navigate complex fee structures and interest rates, which can hinder widespread adoption. By introducing a market-driven, pay-as-you-go model, this protocol aims to provide a more accessible and flexible stablecoin system.

# Mechanism Overview

## Collateralized Debt Positions (CDPs)

Users can lock Ethereum (ETH) as collateral to generate stablecoins (DFID) through CDPs. The amount of stablecoins minted is based on the value of the collateral and the desired collateralization ratio.

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

- **Mechanism Overview:** Redemptions are processed through a queue, where CDPs are ordered based on the weight of a CDP derived from the fee paid.
- **Impact on CDPs:** CDPs that has paid less fees as a percentage of their borrowing are redeemed first.

## Market-Driven Pay-As-You-Go Model

- **Dynamic Protection:** Users can protect their CDPs from redemption by paying a top-up fee, a percentage of their borrowed amount.
- **Market-Driven Fees:** The fee is determined by market conditions, allowing users to pay as they go to maintain their preferred level of protection.
- **Fairness to New Borrowers:** When a new borrower opens a CDP, the protocol doesn't start from '0' weight for this user, but rather starts at the minimum weight available in the system. This is to ensure fairness for new users.

## Weight calculation

### Borrower opens a new CDP position

Weight of the position is calculated as minimum weight in the system(or 0 if none exists), plus the shielding rate set by the borrower.

`weight = minWeightInSystem + shieldingRate`

### Borrower borrows more from the protocol

The protocol calculates a relative weight of the current position based on the minimum weight in the system:

`relativeWeight = (shieldingFee + weightedDiff) / (currentBorrowingAmount + newBorrowedAmount)`

where,

`shieldingFee = newShieldingRate * newBorrowedAmount`, both newShieldingRate and newBorrowedAmount are set by the users at the time of borrowing.

`weightedDiff = (currentWeight - minWeightInSystem) * currentBorrowingAmount`

and the new weight is calculated as below.

`weight = minWeightInSystem + relativeWeight`

## Protection Against Redemptions

- **Top-up Fee:** CDP owners can pay additional fees over time to improve their position in the redemption queue.
- **Priority Adjustment:** Paying the top-up fee moves the user up in the redemption queue, making their CDP less likely to be redeemed.

## Collateral Redemption Mechanism:

### Overview of Redemption Behavior:

- If a user's total fees paid are less than the REDEMPTION_BASE_FEE, the full collateral of the Safe (including unused collateral) can be redeemed, subject to the redemption amount, while the rest are returned back to the owner.
  **Reason:** Redemptions could be exploited as a slippage-free exchange at market price. If this is what the user wants to do, then they pay the protocol 0.15% on the redeemer side and 0.15% on the owner side. The fee structure may encourage such users, as well as providing fees to stability pool stakers.
- If a user's total fees paid are equal to or exceed the REDEMPTION_BASE_FEE, the collateral redemption is limited to the borrowed amount of the Safe.
  **Price Manipulation Consideration:** Price manipulation risks are inherent due to reliance on a price oracle, similar to the current redemption mechanism.

### Fee Calculation:

`REDEMPTION_BASE_FEE` is set to 0.15% by the protocol.

For users with fees paid < `REDEMPTION_BASE_FEE`:

- The redeemer pays a redemption fee calculated as `(feePaidPercentage + REDEMPTION_BASE_FEE)`
  Additionally:
- A fee is charged to the Safe's owner based on the redeemed collateral value:

  `ownerFee = (collateralValueRedeemed \* REDEMPTION_BASE_FEE) / 10000 - feePaid.`

For users with fees paid ≥ REDEMPTION_BASE_FEE:

- The fee is determined as the minimum of (`feePaidPercentage` + `REDEMPTION_BASE_FEE`) and `REDEMPTION_LIQUIDATION_FEE`.
- This fee is charged only to the redeemer.

The protocol tries to protect those who have paid fees by increasing the redemption fee upto `REDEMPTION_LIQUIDATION_FEE`(which is set to 0.75%). Thus, tolerating the peg getting lower upto 0.9925 beyond which redemptions may become profitable again.

### Redemption Fee Distribution:

All fees, both from the Safe owner and the redeemer, are allocated entirely to the Stability Pool stakers (100%).

## Fee Distribution

- **Allocation to Stability Pool:** Fees collected from top-up payments and redemptions are distributed to Stability Pool stakers.
- **Incentive Alignment:** This mechanism incentivizes users to contribute to the Stability Pool, enhancing overall system stability.

# Stability Pool

## Staking Rewards

- **Stablecoin Staking**: Users can stake their stablecoins (DFID) in the Stability Pool.
- **Reward Structure**: Stakers receive 90% of the fees collected from users topping up to protect themselves.
- **Collateral Gains**: Users also gain collateral at discounted price compared to market rate from liquidations.

# Token Incentives

- **Additional Rewards:** Users earn protocol-native tokens (DFIRE) as incentives.
- **Duration:** Token incentives are available for one year from the protocol's launch.

# Token Incentive Program

## Distribution Schedule

- **No Premine**: Tokens are distributed without any initial premining.
- **Rate**: 1 DFIRE token is minted per second over 365 days.
- **Proportional Allocation**: Tokens are distributed to Stability Pool stakers in proportion to their stake.

## Staking DFIRE Tokens

- **Secondary Staking**: DFIRE tokens can be staked in a dedicated contract.
- **Additional Rewards**: Stakers receive 10% of the fees collected from borrowers and 0.75% from redeemers.

# Supported Collateral

- **Exclusive Asset:** The protocol exclusively supports Bitcoin or other native assets of the blockchain(eg: ETH) as collateral.

# Highlights of StableBase Protocol

- **0% Interest Rate**: Users are not charged ongoing interest rates on borrowed stablecoins, allowing them to hold positions indefinitely without accruing additional debt over time.
- **0% Origination Fee**: There are no fees charged when opening a CDP, encouraging users to participate without the burden of upfront costs.
- **Pay-as-You-Go Model**: Users pay fees only when there is a need to protect their positions and jump the redemption queue, providing flexibility and cost efficiency.
- **Single Collateral:** The protocol exclusively supports a single collateral type, simplifying the system and reducing complexity.
- **Governance-Free:** StableBase operates without governance tokens or mechanisms, minimizing potential points of centralization and complexity.
- **90% of Fees to Stability Pool Stakers:** A majority of the fees collected from users are distributed to Stability Pool stakers, incentivizing system support.
- **10% of Fees to DFIRE Stakers:** A portion of the fees is allocated to DFIRE token stakers, encouraging long-term commitment.
- **DFIRE Token Issuance for 1 Year with 0 Initial Supply:** DFIRE tokens are issued over one year at the rate of 1 token per second, with zero initial supply, distributed proportionally based on users' stakes in stability pool.

# Conclusion

StableBase offers a simplified and efficient approach to decentralized stablecoin issuance and management. By employing a minimalist design and a market-driven, pay-as-you-go model, it provides users with flexibility in protecting their positions according to their individual needs and market conditions. The elimination of interest rates and origination fees lowers barriers to entry, making the system more accessible. The innovative redemption mechanism, supported by the Stability Pool for liquidations and a robust token incentive program, ensures system stability and encourages active participation. This alignment of incentives fosters a resilient ecosystem that benefits all stakeholders.
