pragma solidity ^0.8.20;

interface IDoublyLinkedList {
    struct Node {
        uint256 value;
        uint256 prev;
        uint256 next;
    }

    function insert(uint256 id, uint256 value, uint256 nearestSpot) external;

    function remove(uint256 id) external;

    function get(uint256 id) external view returns (Node memory);

    function update(uint256 id, uint256 value, uint256 nearestSpot) external;

    function getHead() external view returns (uint256);

    function getTail() external view returns (uint256);
}