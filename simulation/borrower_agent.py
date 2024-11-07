from mesa import Agent
import numpy as np
from models import User;

class BorrowerAgent(Agent, User):
    def __init__(self, unique_id, model, initial_collateral):
        super().__init__(unique_id, model)
        self.collateral = initial_collateral  # Initial collateral in ETH
        self.borrowed_stablecoins = 0  # Initial borrowed amount
        self.collateralization_ratio = 1.5  # Starting ratio above liquidation threshold

    def open_safe(self, borrow_amount):
        """Borrower opens a CDP (Safe) and mints stablecoins."""
        self.borrowed_stablecoins += borrow_amount
        self.collateralization_ratio = self.collateral / self.borrowed_stablecoins

    def close_safe(self):
        """Borrower closes the CDP and repays the borrowed amount."""
        self.borrowed_stablecoins = 0
        self.collateralization_ratio = float("inf")  # No outstanding debt

    def step(self):
        # Simulate collateral fluctuations
        self.collateral *= np.random.uniform(0.95, 1.05)
        self.collateralization_ratio = self.collateral / (self.borrowed_stablecoins or 1)

        # Check if liquidation is required
        if self.collateralization_ratio < 1.1:
            self.model.liquidate(self)
        elif self.collateralization_ratio > 1.5:
            self.model.redeem_stablecoins(self, self.borrowed_stablecoins * 0.1)  # Optional redemption action
