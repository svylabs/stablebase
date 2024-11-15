# StableBase

StableBase is an over-collateralized borrowing protocol, issuing SBUSD tokens. It features Collateral Debt Position(CDP) mechanism, with Liquidations and Redemptions to achieve stability. 

Here are some highlights of the protocol:

1. 0% interest rates
2. 0% origination fees
3. 110% collateral requirement
4. No governance
5. Immutable
6. Only native asset(ETH) supported at the moment
7. Market determined **Pay As You Go** model to protect from redemptions.
8. Bootstrap mode: No redemptions during bootstrap phase(Until 5 million SBUSD borrowed)
10. The Protocol issues SBR tokens to Stability Pool contributors for 1 year.
    1. No Premine
    2. 1 token issued per second for 1 year proportionally to stakers in stability pool.
11. SBR stakers capture 10% of the fees paid to the protocol by users.
12. Stability Pool stakers capture 90% of fees paid to the protocol.

# Docs

1. [WHITEPAPER.md](./WHITEPAPER.md)
2. [Website](https://stablebase.org)
3. [Simulation](./scripts/simulate.js)

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
