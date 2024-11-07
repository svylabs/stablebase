from stablecoin_model import StableBaseModel 
from ape import accounts, networks, project

# Initialize the model and run the simulation
num_borrowers = 10
num_holders = 5
num_liquidators = 2
num_redeemers = 3
initial_collateral = 100



with networks.parse_network_choice("ethereum:local:hardhat") as hardhat_network:
    print("Connected to Hardhat network!")

    # Check account balance
    account = accounts.test_accounts[0]  # Use the first test account provided by Hardhat
    print(accounts.test_accounts)
    print(f"Account address: {account.address}")

    print(f"Account balance: {account.balance}")
    print(project);
    print(account.deploy(project.StabilityPool))

model = StableBaseModel(num_borrowers, num_holders, num_liquidators, num_redeemers, initial_collateral)

# Run the simulation for a certain number of steps
for i in range(50):
    model.step()

# Collect and display results
results = model.datacollector.get_model_vars_dataframe()
#print(results)