from mesa import Agent
import random
import numpy as np

class StablecoinHolderAgent(Agent):
    def __init__(self, unique_id, model, stablecoins):
        super().__init__(unique_id, model)
        self.stablecoins = stablecoins
        self.staked_stablecoins = 0

    def stake(self, amount):
        """Stake stablecoins in the Stability Pool."""
        self.stablecoins -= amount
        self.staked_stablecoins += amount
        self.model.stability_pool += amount

    def unstake(self, amount):
        """Unstake stablecoins from the Stability Pool."""
        if amount <= self.staked_stablecoins:
            self.stablecoins += amount
            self.staked_stablecoins -= amount
            self.model.stability_pool -= amount

    def step(self):
        # Randomly decide to stake or unstake
        if random.random() < 0.5:
            self.stake(self.stablecoins * 0.1)  # Stake 10% of available stablecoins
        else:
            self.unstake(self.staked_stablecoins * 0.1)  # Unstake 10% of staked stablecoins

