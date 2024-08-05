// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library SBUtils {
    
    function getSafeId(address _borrower, address _token) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_borrower, _token));
    }

    function depositEthOrToken(address _token, address _to, uint256 _amount) internal {
        if (_token == address(0)) {
            // Ethereum
            require(msg.value == _amount, "Invalid deposit amount");
        } else {
            // ERC20
            require(
                IERC20(_token).transferFrom(msg.sender, _to, _amount),
                "Token transfer failed"
            );
        }
    }

    function withdrawEthOrToken(address _token, address _to, uint256 _amount) internal {
        if (_token == address(0)) {
            // Ethereum
            payable(_to).transfer(_amount);
        } else {
            // ERC20
            require(
                IERC20(_token).transfer(_to, _amount),
                "Token transfer failed"
            );
        }
    }

}
