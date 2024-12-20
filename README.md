# StableBase

StableBase is an over-collateralized borrowing protocol issuing DFID(D.FI.Dollar) tokens, pegged to USD. It features Collateral Debt Position(CDP) mechanism, with Liquidations and Redemptions to achieve stability.

Here are some highlights of the protocol:

1. 0% interest rates
2. 0% origination fees
3. 110% collateral requirement
4. No governance
5. Immutable
6. Only native asset(ETH) is supported.
7. Market determined **Pay As You Go** model to protect from redemptions.
8. Bootstrap mode: No redemptions during bootstrap phase(Until 5 million DFID borrowed)
9. The Protocol issues DFIRE tokens to Stability Pool contributors for 1 year.
   1. No Premine
   2. 1 token issued per second for 1 year, proportionally split among stakers in stability pool.
10. DFIRE stakers capture 10% of the fees paid to the protocol by users.
11. Stability Pool stakers capture 90% of fees paid to the protocol.

# Docs

1. [Whitepaper](./WHITEPAPER.md)
2. [Website](https://stablebase.org)
3. [Contracts](./contracts)
4. [Tests/Simulations](./scripts/simulate.js)
   - The code is unaudited. We have run roughly 200 simulations, each time running close to 300 days worth of transactions(~100k txs per run) to spot issues / bugs. So far we have fixed all the issues that we could find. While we are optimistic there are no bugs, do exercise caution before deploying a reasonable amount of funds depending on your risk tolerance, until the protocol reaches stability.

# FAQ

**1. How is the StableBase protocol different from other protocols?**

The protocol is mostly inspired by the same mechanisms(CDP, Liquidation, Redemptions) from other popular CDP protocols. The key difference between StableBase and other protocols is the pricing structure. Where other popular protocols have minimum interest rates or minimum origination fees, the protocol doesn't impose any one time fee, nor interest rates and is purely market driven. The users simply **_pay as you go_** to protect themselves from redemptions.

**2. Why is this pricing structure better?**

**_Pay As You Go_** is a clear pricing mechanism, where you don't pay anything until you need to. CDPs are ordered by the protocol based on the weight of the position calculated from the fee paid. So when you choose to pay, you are paying to jump to a different position in the redemption queue. Payment can be made at any time- at the time of borrowing or later using our **_fee topup_** mechanism.

**3. How is this different from paying interest rates?**

Interest rates are ongoing borrowing costs and keep accruing continuously, but in this protocol you only pay when you need to jump position in redemption queue. If redemptions doesn't happen, you don't have to pay anything.

**4. Why are redemptions bad?**

Redemptions are not bad, they happen because too much stablecoin is in circulation than is needed by the market. Redemptions are a way to reduce the circulating supply / keep the peg of the stablecoin. To avoid redemptions, users can pay a market determined fee(as a percentage of borrowing) to protect themselves from redemption.

**5. What are some innovations in StableBase protocol?**

1. Pricing structure(Pay As You Go model) is the key innovation.
2. This protocol also treats redemptions as a way to exchange or provide **exchange liquidity** for the collateral assets. This, we presume would create more demand for the stablecoins, assuming there is supply of collateral into the protocol. The stability pool earns not only from fees paid to the protocol by borrowers, but also collects redemption fees.

Here is an example: A user wants to sell 10 ETH for stablecoins. They can use this protocol to borrow (90.9%) stablecoins upfront. For the remainder, they can wait to get redeemed. This is similar to placing a market order, and getting upfront liquidity(in the form of stablecoins, of course- they risk liquidations). Assuming the liquidity and actors are sufficiently high, the users can get better fees / low slippage from the protocol than traditional exchanges. This mechanism is also dependent on price oracle, so users have to be careful when it comes to price feed manipulation / MEV. This is not a replacement for traditional exchanges nor AMMs, nor it helps with price discovery of collateral assets. It is simply an exchange mechanism at prices determined by the oracle.

The protocol earns fees from redeemer(as a percentage of collateral - 0.15%), and from the user whose collateral is redeemed(0.15%). The numbers are just the minimum. The fee calculation is also dependent on how much the borrower has already paid in fees to the protocol. The protocol does its best to ensure it protects the users that have paid fees from being redeemed by increasing the redemption fees upto a maximum of 0.75%.

**6. Is the protocol a fork of Liquity v1 or v2 or other protocols?**

This project is in no way connected with Liquity nor any of it's forks. While some mechanisms are directly inspired by Liquity v1, this project is not a fork. All contracts, mechanisms, reward distribution mechanism has been derived and developed independently. We had started working on this project in bits and pieces even before Liquity v2 / user-defined interest rates was announced in public. The origin of the protocol was a few days/weeks before this [tweet](https://x.com/sginams/status/1732368209972543804) when the developer was actively researching flaws in existing stablecoin protocols and came up with a market driven mechanism to address redemptions independently of Liquity team.

**7. As a (potential) user what should I keep in mind?**

Read the [disclaimer](#disclaimer).

**8. Can I fork the code and deploy on any chain?**

Yes, you can fork the code, make changes and deploy to any chain you wish. The developer does not claim responsibility to any forks. Also read the [disclaimer](#disclaimer).

**9. What are the Limitations of this protocol?**

The protocol as is, only supports tokens native to the blockchain. ERC20 support will be added to the code later. The protocol also relies on price oracle.

On Ethereum mainnet, we plan to reuse the price oracle developed and deployed by Liquity v1 at this [address](https://etherscan.io/address/0x4c517D4e2C851CA76d7eC94B805269Df0f2201De). So this protocol comes with the same guarantees and flaws as exists in Liquity v1 with regards to Price Oracle.

Oracle contracts for other chains / assets needs to be developed.

# Social

1. [X](https://x.com/stablebase_org)
2. [Telegram](https://t.me/stablebase_org)
3. Discord(Ask the developer for access)

# Future improvements

1. Support for ERC20 tokens as collateral
2. Multi collateral support
3. Liquidation Protection mechanism

# Releases

1. Preview release on Ethereum mainnet
   - Deployed on November 21.
   - Known Issues discovered after Deployment.
     - NFT minting uses `_mint` instead of `_safeMint`, thus minted NFT for Safes might not be compatible with Smart Contract wallets. (As no one is using the protocol yet, no one is affected) - We don't plan to fix this on ETH mainnet, as this does not affect externally owned accounts, or even smart contracts that originate the Safes themselves. This only affects for example: when an employee opens loan on behalf of a company, and takes a particular action when the loan is opened, for example: to move the loan to a company contract after mint.
2. Launch on Bitcoin L2 (TBA)

# License

MIT

# Disclaimer

**[Immutable with no governance]**
The protocol is immutable, with no individual or entity controlling the contracts once deployed. SVY Labs, the company that developed the StableBase protocol, is only a developer of the protocol and does not issue 'DFIRE' or 'DFID' tokens. The company is responsible for the development and deployment of the protocol on Ethereum and other chains, with users of the protocol responsible for their actions and for ensuring they follow jurisdictional laws.

**[Unaudited code]**
While the core protocol is tested by the developer, the code is unaudited and may contain bugs resulting in hacks or the inability for users to withdraw funds from the protocol. Internal testing does not equate to a formal audit, and vulnerabilities may still exist. Users should exercise caution when interacting with the protocol or using third-party frontends. The repository contains only the smart contract code developed by the developer.

**[Unaudited mechanism]**
The protocol mechanism is unaudited and may contain flaws. The company or the developer cannot be held responsible or liable if the protocol does not work as intended in the whitepaper. Users are advised to conduct their own research (DYOR) and seek professional advice before interacting with the protocol or its tokens.

**[No Liability for Loss of User Funds]**
While the protocol intends to peg the 'DFID' token to USD, the 'DFIRE' and 'DFID' tokens may not have any value, nor will users have any means to exchange these tokens for other assets. The developer cannot be held liable or responsible for the adoption of the protocol or the tokens. Users are solely responsible for their actions regarding supplying liquidity to the protocol and minting 'DFID' tokens or exchanging assets with value for 'DFIRE' or 'DFID' tokens. Users acknowledge the risk of permanent loss of funds when interacting with the protocol.

**[Regulatory and Third-Party Risks]**
Users must ensure compliance with all applicable laws and regulations in their jurisdiction when interacting with the protocol or associated tokens. The company or developer assumes no liability for regulatory implications of using the protocol. Additionally, third-party interfaces or integrations with the protocol are outside the control of the developer and may pose additional risks.

**[No Warranty]**
The protocol is provided 'as-is' without warranties of any kind, including but not limited to suitability for a particular purpose, accuracy, or functionality. Users assume all risks associated with interacting with the protocol.

# Don't trust, verify.
