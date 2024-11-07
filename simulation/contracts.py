class CDPContract:
    def __init__(self):
        self.total_debt = 0
        self.total_collateral = 0
        self.cumulative_debt_per_collateral = 0
        self.cumulative_collateral_per_collateral = 0
    
class SBDToken:
    def __init__(self):
        self.total_supply = 0

class SBRToken:
    def __init__(self):
        self.total_supply = 0

class StabilityPool:
    def __init__(self):
        self.total_balance = 0
        self.total_sbd_balance = 0
        self.total_staked_raw = 0