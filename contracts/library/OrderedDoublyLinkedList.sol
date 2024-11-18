// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../interfaces/IDoublyLinkedList.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OrderedDoublyLinkedList is IDoublyLinkedList, Ownable {
    uint256 public head;
    uint256 public tail;

    mapping(uint256 => Node) public nodes;

    constructor() Ownable(msg.sender) {
        head = 0;
        tail = 0;
    }

    function setAddresses(address _stableBaseCDP) external onlyOwner {
        transferOwnership(_stableBaseCDP);
    }

    function _insert(
        uint256 id,
        Node memory node,
        uint256 _nearestSpot
    ) internal returns (Node memory) {
        uint256 _head = head;
        if (_head == 0) {
            head = id;
            tail = id;
        } else {
            uint256 _tail = tail;
            if (_nearestSpot == 0) {
                _nearestSpot = _head;
            }

            if (
                nodes[_nearestSpot].prev == 0 &&
                nodes[_nearestSpot].next == 0 &&
                nodes[_nearestSpot].value == 0
            ) {
                _nearestSpot = head;
                //nearest = nodes[_nearestSpot];
            }
            // nearest: 7, node:10: 7, 7, 9, 11, 11
            // nearest: 9, node: 7: 7, 7, 9, 11, 11
            // nearest: 9, node: 12: 7, 7, 9, 11, 11

            while (
                _nearestSpot != _tail && nodes[_nearestSpot].value < node.value
            ) {
                _nearestSpot = nodes[_nearestSpot].next;
                //nearest = nodes[_nearestSpot];
            }
            // nearest: 11, node:10: 7, 7, 9, 11, 11
            // nearest: 9, node:7: 7, 7, 9, 11, 11
            // nearest: 11(last), node: 12: 7, 7, 9, 11, 11

            while (
                _nearestSpot != _head && nodes[_nearestSpot].value >= node.value
            ) {
                _nearestSpot = nodes[_nearestSpot].prev;
                //nearest = nodes[_nearestSpot];
            }
            // nearest: 7, node: 7: 7, 7, 9, 11, 11

            if (_nearestSpot == _head) {
                if (nodes[_nearestSpot].value >= node.value) {
                    node.next = _nearestSpot;
                    nodes[_nearestSpot].prev = id;
                    head = id;
                } else {
                    node.prev = _nearestSpot;
                    node.next = nodes[_nearestSpot].next;
                    nodes[_nearestSpot].next = id;
                    if (node.next != 0) {
                        nodes[node.next].prev = id;
                    } else {
                        tail = id;
                    }
                }
            } else if (_nearestSpot == _tail) {
                // nearest: 11(last), node: 12: 7, 7, 9, 11, 11
                if (nodes[_nearestSpot].value < node.value) {
                    node.prev = _nearestSpot;
                    nodes[_nearestSpot].next = id;
                    tail = id;
                } else {
                    node.prev = nodes[_nearestSpot].prev;
                    node.next = _nearestSpot;
                    nodes[_nearestSpot].prev = id;
                    if (node.prev != 0) {
                        nodes[node.prev].next = id;
                    } else {
                        head = id;
                    }
                }
            } else {
                // nearest: 9, node: 10: 7, 7, 9, 11, 11
                node.prev = _nearestSpot;
                node.next = nodes[_nearestSpot].next;
                nodes[_nearestSpot].next = id;
                nodes[node.next].prev = id;
            }
        }
        nodes[id] = node;
        return node;
    }

    function _insert(
        uint256 id,
        uint256 value,
        uint256 _nearestSpot
    ) internal returns (Node memory) {
        Node memory node = Node(value, 0, 0);
        return _insert(id, node, _nearestSpot);
    }

    function _remove(uint256 id) internal returns (Node memory) {
        Node memory node = nodes[id];
        if (node.prev == 0) {
            head = node.next;
            nodes[node.next].prev = 0;
        } else {
            nodes[node.prev].next = node.next;
            nodes[node.next].prev = node.prev;
        }
        if (node.next == 0) {
            tail = node.prev;
            nodes[node.prev].next = 0;
        } else {
            nodes[node.next].prev = node.prev;
            nodes[node.prev].next = node.next;
        }
        delete nodes[id];
        return node;
    }

    function _update(
        uint256 id,
        uint256 value,
        uint256 _nearestSpot
    ) internal returns (Node memory) {
        Node memory node = _remove(id);
        node.value = value;
        node.prev = 0;
        node.next = 0;
        return _insert(id, node, _nearestSpot);
    }

    function upsert(
        uint256 id,
        uint256 value,
        uint256 _nearestSpot
    ) external override onlyOwner returns (Node memory) {
        if (
            nodes[id].value == 0 && nodes[id].next == 0 && nodes[id].prev == 0
        ) {
            return _insert(id, value, _nearestSpot);
        } else {
            return _update(id, value, _nearestSpot);
        }
    }

    function remove(
        uint256 id
    ) external override onlyOwner returns (Node memory) {
        if (
            nodes[id].value == 0 && nodes[id].next == 0 && nodes[id].prev == 0
        ) {
            // Node doesn't exist
            return Node(0, 0, 0);
        }
        return _remove(id);
    }

    function get(uint256 id) external view override returns (Node memory) {
        return nodes[id];
    }

    function getHead() external view override returns (uint256) {
        return head;
    }

    function getTail() external view override returns (uint256) {
        return tail;
    }

    function getNode(uint256 id) public view returns (Node memory) {
        return nodes[id];
    }

    function getNodes(
        uint256 beginAt,
        uint256 total
    ) external view returns (Node[50] memory nodes, uint256 totalFound) {
        if (beginAt == 0) {
            beginAt = head;
        }
        for (uint256 i = 0; i < total; i++) {
            if (beginAt == 0) {
                break;
            }
            nodes[i] = getNode(beginAt);
            beginAt = nodes[i].next;
            totalFound++;
        }
    }
}
