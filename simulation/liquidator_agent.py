from mesa import Agent
import random
from borrower_agent import BorrowerAgent

class LiquidatorAgent(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def liquidate(self, borrower):
        """Liquidate an undercollateralized borrower."""
        if borrower.collateralization_ratio < 1.1:
            liquidation_reward = borrower.collateral * 0.1  # Liquidator receives 10% of collateral
            self.model.stability_pool += (borrower.collateral - liquidation_reward)  # Add collateral to pool
            borrower.collateral = 0
            borrower.borrowed_stablecoins = 0
            borrower.collateralization_ratio = float("inf")  # No outstanding debt

    def step(self):
        # Attempt liquidation on random borrower
        borrowers = [agent for agent in self.model.schedule.agents if isinstance(agent, BorrowerAgent)]
        if borrowers:
            borrower = random.choice(borrowers)
            self.liquidate(borrower)
