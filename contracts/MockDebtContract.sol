pragma solidity ^0.8.20;

contract MockDebtContract {
    receive() external payable {
        //emit Received(msg.sender, msg.value);
    }

    function liquidate(uint256 _amount) external returns (uint256) {
        uint balance = (address(this).balance);
        require(balance >= 0, "Insufficient balance");
        // Mock liquidation - send all available collateral to the liquidator
        payable(msg.sender).transfer(balance);
        return balance;
    }
}
