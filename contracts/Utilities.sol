// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Structures.sol";

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

    function getBorrowMode(uint32 mode) internal pure returns (SBStructs.BorrowMode) {
        uint32 _mode = mode & 0x00000003;
        if (_mode == 0) {
            return SBStructs.BorrowMode.MINT_WITH_PROTECTION;
        } else if (_mode == 1) {
            return SBStructs.BorrowMode.MINT_WITH_MANUAL_STABILITY;
        } else if (_mode == 2) {
            return SBStructs.BorrowMode.BORROW_FROM_POOL;
        } else {
            revert("Invalid borrow mode");
        }
    }

    /**
     * @dev Get the rate at a specific position in the compressed rate
     * 
     * Each rate block is 2 bytes long, with first two bits representing the rate type, and the next 14 bits representing the rate value.
     */
    function getRateAtPosition(uint256 _compressedRate, uint256 _position) internal pure returns (uint256) {
        if (_position == 0) {
            return (_compressedRate & 0xff) >> 2;
        } else if (_position == 1) {
            return ((_compressedRate & 0xff0000) >> 16) >> 2;
        } else {
            revert("Invalid position");
        }
    }

}
