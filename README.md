# StableBase

StableBase is an over-collateralized borrowing protocol issuing SBUSD tokens, pegged to USD. It features Collateral Debt Position(CDP) mechanism, with Liquidations and Redemptions to achieve stability.

Here are some highlights of the protocol:

1. 0% interest rates
2. 0% origination fees
3. 110% collateral requirement
4. No governance
5. Immutable
6. Only native asset(ETH) supported at the moment
7. Market determined **Pay As You Go** model to protect from redemptions.
8. Bootstrap mode: No redemptions during bootstrap phase(Until 5 million SBUSD borrowed)
9. The Protocol issues SBR tokens to Stability Pool contributors for 1 year.
   1. No Premine
   2. 1 token issued per second for 1 year proportionally to stakers in stability pool.
10. SBR stakers capture 10% of the fees paid to the protocol by users.
11. Stability Pool stakers capture 90% of fees paid to the protocol.

# Docs

1. [Whitepaper](./WHITEPAPER.md)
2. [Website](https://stablebase.org)
3. [Contracts](./contracts)
4. [Tests/Simulations](./scripts/simulate.js)

# FAQ

**1. How is this protocol different?**

The protocol is mostly inspired by the same mechanisms(CDP, Liquidation, Redemptions) from other popular CDP protocols. The key difference between this protocol and other protocols is the pricing structure. Where other popular protocols have interest rates or origination fees, the protocol doesn't impose any minimum nor maximum fees and is purely market driven. The users simply pay as you go to protect themselves from redemptions.

**2. Why are redemptions bad?**

Redemptions are not bad, they happen because too much stablecoin is in circulation than is needed by the market. Redemptions are a way to reduce the circulating supply. To avoid redemptions, users can pay a market determined fee(as a percentage of borrowing) to protect themselves from redemption.

**3. How is this different from paying interest rates?**

Interest rates are ongoing borrowing costs, but in this protocol you only pay when needed.

**4. What are some other innovations in this protocol?**

1. Pricing structure(Pay As You Go model) is the key innovation.
2. This protocol also treats Redemptions as a way to exchange or provide **exchange liquidity** for the collateral assets. This, we presume would create more demand for the stablecoins. The stability pool earns not only from fees paid to the protocol by borrowers, but also collects redemption fees.

Here is an example: A user wants to sell 10 ETH for stablecoins. They can use this protocol to borrow (90.9%) stablecoins upfront. For the remainder, they can wait to get redeemed. This is similar to placing a market order, and getting upfront liquidity(in the form of stablecoins, of course- they risk liquidations). Assuming the liquidity and actors are sufficiently high, the users can get better fees / low slippage from the protocol than traditional exchanges. This mechanism is also dependent on price oracle, so users have to be careful when it comes to price feed manipulation / MEV. This is not a replacement for traditional exchanges or AMMs, but such integrations are possible due to the pricing structure of the protocol.

The protocol earns fees from redeemer(as a percentage of collateral(0.15%)), and from the user whose collateral is redeemed(0.15%). The numbers are just the minimum. The fee calculation is also dependent on how much the borrower has already paid in fees to the protocol. The protocol does its best to ensure it protects the users that have paid fees from being redeemed by increasing the redemption fees upto a maximum of 0.75%.

# Social

1. [X.com](https://x.com/stablebase_org)
2. [Telegram](https://t.me/stablebase_org)

# Roadmap

1. Support for ERC20 tokens as collateral
2. Multi collateral support

# License

MIT

# Disclaimer

- The protocol is immutable, with no one controlling the code once deployed. SVY Labs, the company that developed **StableBase** protocol is only a developer of the protocol and doesn't issue 'SBR' or 'SBUSD' tokens. The company is responsible for the development and deployment of the protocol on Ethereum, with users of the protocol responsible for their actions and for ensuring they follow jurisdictional laws.
- The protocol is sufficiently tested by the developer, but the code is unaudited, so may contain bugs resulting in hacks or inability for users to withdraw funds from the protocol. Exercise caution when interacting with the protocol, or when using third-party frontends. The repository only contains the smart contract code developed by the developer.
- The protocol mechanism is also unaudited and may contain flaws. The company or the developer cannot be held responsible / liable if the protocol doesn't work as intended in the whitepaper.
- The 'SBR' and 'SBUSD' tokens may not carry any value, nor users will have any means to exchange these tokens for other assets. The developer cannot be held liable nor responsible for the adoption of the protocol, nor the tokens. Users are solely responsible for their actions with regards to supplying liquidity to the protocol, or exchanging assets with value to 'SBR' or 'SBUSD' tokens.
