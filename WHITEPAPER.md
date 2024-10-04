                        StableBase: A Novel Stablecoin Protocol with Enhanced Borrowing Experience
                           (Sridhar<sg@svylabs.com>, Gopalakrishnan<gopalakrishnan.g@gov.in>)

## Abstract

In traditional finance, central banks maintain price stability through various monetary policy tools, such as interest rates, repo rates, and reserve ratios. These mechanisms control the supply of money, ensuring economic stability. In the cryptocurrency world, stablecoin protocols rely on similar principles, primarily using interest rates and collateral requirements to regulate money supply.

In this paper, we introduce **StableBase**, a stablecoin protocol based on the **Collateralized Debt Position (CDP)** mechanism. StableBase innovates on price stability by incorporating two novel tools: a **pre-paid Shielding Rate** and a **user-defined Reserve Ratio**. These mechanisms work together to achieve price parity with the pegged currency while providing users with flexibility and predictability in their borrowing experience. We explore how these policy tools enhance the stability of the protocol across different market conditions and offer a more dynamic borrowing environment compared to existing stablecoin protocols.

---

## Introduction

The stablecoin market has evolved rapidly since the launch of **MakerDAO's SAI**, and later **DAI**, which pioneered the use of Collateralized Debt Positions (CDPs). Various stablecoin protocols such as **Curve USD** and **Liquity USD** have since emerged, each innovating within the CDP space. Most of these protocols employ traditional interest rates where borrowers pay ongoing fees, but exceptions like **Liquity v1** introduced a one-time origination fee to remove interest payments. However, despite its innovation, Liquity v1 struggled with market adaptability due to a weaker incentive structure, prompting the development of Liquity v2, which introduces user-defined interest rates to better align market conditions with protocol stability.

StableBase offers a fundamentally different approach by shifting from the traditional postpaid interest system to a **prepaid model**, where users pay upfront to protect their collateral over a specific period. Central to this system are **Rate Governors**, key actors responsible for setting the Shielding Rates and Reserve Ratios that ensure system stability. This paper details how these parameters interact to maintain the stability of StableBase, while enhancing user predictability and flexibility, and discusses how the protocol adjusts to various market conditions while offering yield opportunities for stablecoin holders.

---

## Collateralized Debt Position (CDP) Mechanism

CDPs are a widely used mechanism in stablecoin protocols. Users deposit collateral and can borrow stablecoins against it, provided the collateral sufficiently backs the debt. The collateral must remain above a predefined threshold (typically around 110%, though this varies depending on the asset's risk profile) to avoid liquidation. If the collateral value falls below this threshold, a liquidation event is triggered, allowing third parties to repay the loan and receive the underlying collateral at a discounted rate.

Along with liquidation, some protocols, such as **Liquity Protocol**, allow **redemptions**, where users can redeem stablecoins for the equivalent value of the underlying collateral (e.g., 1 stablecoin = $1 of collateral). Liquidation and redemption mechanisms are critical for ensuring stablecoin price stability, and different protocols employ unique approaches to these functions. Many protocols also charge ongoing fees in the form of interest rates, distributing the collected fees to participants who stake stablecoins in savings pools.

---

## StableBase Overview

StableBase introduces a novel twist to the CDP mechanism by incorporating **0% interest rates** and replacing traditional interest payments with two new policy tools: the **Shielding Rate** and the **Reserve Ratio**. These tools contribute to the protocol's price stability while offering users more flexible borrowing terms.

### Policy Tools

1. **Shielding Rate**: This is a prepaid fee that users pay to shield their CDP from redemption. The rate can vary between 0% and 100%, depending on the user’s preference, and redemption protection is activated on a **pro-rata basis** according to the paid shielding rate and the **target shielding rate** at the time the CDP is opened.

2. **Reserve Ratio**: This is set by the user at the time of borrowing and determines the percentage of the borrowed stablecoin that must be locked in a reserve pool. The Reserve Ratio provides a way for users to participate in the stability of the protocol while earning potential rewards.

To open a CDP, users must choose either the Shielding Rate or the Reserve Ratio. The interplay between these two parameters controls the circulation of stablecoins and directly impacts price stability. Redemptions and liquidations are triggered based on these rates, ensuring that the protocol remains balanced.

The protocol also tracks **target shielding rate** at each update of **Shielding Rate** by the rate governors based on the stake in reserve pool. Rate Governors can also update the shielding rate only once per day.

The protocol calculates the weighted average shielding rate, using the following formula:

$$\text{Target Shielding Rate} = \frac{\sum_{i=1}^{n} (\text{reserve\_pool\_stake}_i \times \text{shielding\_rate}_i)}{\sum_{i=1}^{n} \text{reserve\_pool\_stake}_i}$$

At the time of opening the CDP position, regular users who do not want to be rate governors pay a fee equivalent to target shielding rate, to claim redemption protection for 1 year, or they get pro-rata protection based on the fee paid.

---

## Liquidation Mechanisms

StableBase supports two types of liquidation:

1. **Protocol Liquidation**: If the collateral value of a position drops below 110%, the protocol automatically liquidates the CDP from Stability Pool. If no funds are available in stability pool, the debt and collateral of the liquidated position are redistributed to the borrower with the next lowest collateral ratio, ensuring an orderly liquidation process.

2. **Third-Party Liquidation**: In this scenario, a third party, or an external user, can trigger a liquidation. The liquidator repays the debt and receives the underlying collateral at a discount, incentivizing users to help maintain the stability of the system.

### Redemption Mechanism

Redemption ensures that 1 stablecoin can always be exchanged for $1 of the underlying collateral. The protocol prioritizes CDPs for redemption based on the following hierarchy:

1. **Expired Shielded CDPs**: Redemptions begin with any expired shielded positions.
2. **Target Shielding Rate**: If no expired positions exist, the CDP farthest from the target shielding rate is redeemed.
3. **Reserve Ratio**: If necessary, the CDP with the lowest reserve ratio is next in line for redemption.
4. **Non-Expired Shielded CDPs**: Finally, the protocol redeems non-expired shielded CDPs if no other options are available.

Users who prepay the full shielding rate enjoy protection from redemption for one year. Partial payments provide pro-rata protection based on the paid amount. Users can renew this protection by paying an additional Shielding Rate at the end of their protection period.

---

## Stability Pool and Reserve Pool

StableBase introduces two pools to enhance system stability:

1. **Reserve Pool**: Users who set a Reserve Ratio contribute to this pool, which locks a percentage of their borrowed stablecoins. In return, they earn fees generated from the protocol at a higher rate compared to the Stability Pool.

2. **Stability Pool**: Stablecoin holders can park their stablecoins in the Stability Pool, earning fees from borrowing activities, liquidations, and redemptions.

### Fee Distribution

Fees collected from Shielding Rates are distributed as follows:

- **Reserve Pool**: Receives 2x the rewards compared to the Stability Pool.
- **Stability Pool**: Earns a share of fees from Shielding Rates, redemptions, and liquidations.
- **Liquidators**: Earn liquidation fees when they trigger a liquidation.

---

## Price Oracle

Like other CDP-based protocols, StableBase relies on an external price oracle to track the value of collateral assets. The protocol plans to integrate **Chainlink** as its primary oracle for real-time price data.

---

## Unique Features of StableBase

StableBase introduces several innovations that differentiate it from existing stablecoin protocols:

1. **0% interest rates**, eliminating ongoing borrowing fees.
2. A user-defined **Reserve Ratio** that allows dynamic control of the stablecoin supply.
3. A prepaid **Shielding Rate** that offers predictable borrowing terms and redemption protection.
4. Redemption protection, providing a better user experience for borrowers.
5. Yield opportunities for **Reserve Pool** and **Stability Pool** depositors.
6. An adaptable framework suitable for both advanced users and everyday borrowers.

---

## User Profiles

StableBase caters to different user profiles based on risk tolerance and borrowing needs:

1. **Borrowers using the Shielding Rate**:

   - **Risk**: Low (protected from redemptions).
   - **Reward**: Predictable loan terms.
   - **Target Users**: Everyday borrowers seeking predictable, low-risk loans.

2. **Borrowers using the Reserve Ratio**:

   - **Risk**: High (must manage risk actively).
   - **Reward**: Fee revenue from the protocol and borrowing at 0% rates.
   - **Target Users**: Advanced users such as hedge funds, institutions, and traders seeking to generate yield.

3. **Stablecoin Holders**:
   - **Risk**: Low (only risk is stablecoin de-pegging).
   - **Reward**: Fee revenue through the Stability Pool.
   - **Target Users**: Individuals holding stablecoins for transactions or savings.

---

## Available Collateral

As a base layer stablecoin protocol without governance, StableBase protocol will only support native currencies like **ETH** as collateral, with the understanding that introducing additional collateral types require governance or an external mechanism due to the centralized nature of the token operation.

---

## Conclusion

StableBase offers a reimagined approach to stablecoin protocols by combining **0% interest rates** with innovative tools like the **Reserve Ratio** and **Shielding Rate**. These mechanisms provide users with flexibility, predictability, and a better borrowing experience while enhancing protocol stability. With its novel stability mechanics and yield-generating opportunities, StableBase positions itself as a robust alternative to existing stablecoin protocols, catering to both advanced traders and everyday users.
