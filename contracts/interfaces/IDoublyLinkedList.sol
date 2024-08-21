// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IDoublyLinkedList {
    struct Node {
        uint256 value;
        uint256 prev;
        uint256 next;
    }

    function remove(uint256 id) external returns (Node memory);

    function get(uint256 id) external view returns (Node memory);

    function upsert(uint256 id, uint256 value, uint256 _nearestSpot) external;

    function getHead() external view returns (uint256);

    function getTail() external view returns (uint256);
}
