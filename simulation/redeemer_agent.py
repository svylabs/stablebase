from mesa import Agent
import numpy as np
import random

class RedeemerAgent(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)
        self.stablecoins = 100  # Initial stablecoins held

    def redeem(self, amount):
        """Redeem stablecoins for collateral from the Stability Pool."""
        if amount <= self.stablecoins and self.model.stability_pool > 0:
            redeemable_collateral = amount * 0.9  # Redemption at 90% of stablecoin value
            self.stablecoins -= amount
            self.model.stability_pool -= redeemable_collateral

    def step(self):
        # Randomly decide to redeem stablecoins
        if random.random() < 0.3:
            self.redeem(self.stablecoins * 0.1)  # Redeem 10% of stablecoins
