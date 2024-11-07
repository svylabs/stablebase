from mesa import Agent, Model
from mesa.time import RandomActivation
from mesa.datacollection import DataCollector
import numpy as np
import random
from borrower_agent import BorrowerAgent
from liquidator_agent import LiquidatorAgent
from redeemer_agent import RedeemerAgent
from stablecoin_holder_agent import StablecoinHolderAgent
from ape import accounts, networks


class StableBaseModel(Model):
    def __init__(self, num_borrowers, num_holders, num_liquidators, num_redeemers, initial_collateral):
        self.schedule = RandomActivation(self)
        self.stability_pool = 0 # Stability pool initially empty

        # Create Borrowers
        for i in range(num_borrowers):
            borrower = BorrowerAgent(i, self, initial_collateral)
            self.schedule.add(borrower)

        # Create Stablecoin Holders
        for i in range(num_holders):
            holder = StablecoinHolderAgent(i + num_borrowers, self, 100)  # Each holder starts with 100 SBD
            self.schedule.add(holder)

        # Create Liquidators
        for i in range(num_liquidators):
            liquidator = LiquidatorAgent(i + num_borrowers + num_holders, self)
            self.schedule.add(liquidator)

        # Create Redeemers
        for i in range(num_redeemers):
            redeemer = RedeemerAgent(i + num_borrowers + num_holders + num_liquidators, self)
            self.schedule.add(redeemer)

        self.datacollector = DataCollector(
            model_reporters={"Stability Pool": lambda m: m.stability_pool},
            agent_reporters={"Collateral": lambda a: getattr(a, 'collateral', None),
                             "Stablecoins": lambda a: getattr(a, 'stablecoins', None),
                             "Staked Stablecoins": lambda a: getattr(a, 'staked_stablecoins', None)}
        )

    def liquidate(self, borrower):
        """Process liquidation if the collateralization ratio is below threshold."""
        if borrower.collateralization_ratio < 1.1:
            liquidator = next(agent for agent in self.schedule.agents if isinstance(agent, LiquidatorAgent))
            liquidator.liquidate(borrower)

    def redeem_stablecoins(self, borrower, amount):
        """Allow a borrower to redeem stablecoins for collateral."""
        redeemer = next(agent for agent in self.schedule.agents if isinstance(agent, RedeemerAgent))
        redeemer.redeem(amount)

    def step(self):
        # Advance the model by one step
        self.datacollector.collect(self)
        self.schedule.step()
