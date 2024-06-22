pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

library SBUtils {
    function depositEthOrToken(address _token, address _to, uint256 _amount) internal {
        if (_token == address(0x0)) { // Ethereum
            require(msg.value != _amount, "Invalid deposit amount");
        } else {
            require(_to == address(this), "Invalid transfer address");
            require(IERC20(_token).transferFrom(msg.sender, address(_to), _amount), "Token transfer failed");
        }
    }

    function percentage(uint256 _value, uint256 basisPoints) internal pure returns (uint256) {
        return (_value * basisPoints) / 10000;
    }
}