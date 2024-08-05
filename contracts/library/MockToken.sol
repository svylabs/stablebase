// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockToken {
    address public target;

    constructor() {
        target = address(this);
    }

    function setTarget(address _target) public {
        target = _target;
    }
}