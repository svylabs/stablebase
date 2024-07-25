const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OrderedDoublyLinkedListTest", function () {
    this.beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const OrderedDoublyLinkedListFactory = await ethers.getContractFactory("OrderedDoublyLinkedList");
        orderedDoublyLinkedList = await OrderedDoublyLinkedListFactory.deploy();
        await orderedDoublyLinkedList.waitForDeployment(); // wait for deployment to complete
    });

    // Test case for opening a new safe with ETH
    it("should initialize the list correctly", async function () {
        const id = 1;
        const value = 1;
        const result = await orderedDoublyLinkedList.connect(addr1).upsert(1, 1, 0);
        const head = await orderedDoublyLinkedList.connect(addr1).head();
        expect(head).to.equal(id);
        const tail = await orderedDoublyLinkedList.connect(addr1).tail();
        expect(tail).to.equal(id);
        const node = await orderedDoublyLinkedList.connect(addr1).nodes(id);
        expect(node.value).to.equal(value);
    });

    it("should insert at the end", async function () {
        const values = [
            {
                id: 1,
                value: 1
            },
            {
                id: 2,
                value: 2
            },
            {
                id: 3,
                value: 3
            },
        ];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const result = await orderedDoublyLinkedList.connect(addr1).upsert(value.id, value.value, 0);
            console.log("Inserted: ", value);
        }
        const head = await orderedDoublyLinkedList.connect(addr1).head();
        expect(head).to.equal(1);
        const tail = await orderedDoublyLinkedList.connect(addr1).tail();
        expect(tail).to.equal(3);
        for (let i = 0; i < values.length; i++) {
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            console.log(node);
            expect(node.value).to.equal(values[i].value);
        }
    });

    it("should insert at the beginning", async function () {
        const values = [
            {
                id: 3,
                value: 3
            },
            {
                id: 2,
                value: 2
            },
            {
                id: 1,
                value: 1
            },
        ];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const result = await orderedDoublyLinkedList.connect(addr1).upsert(value.id, value.value, 0);
            const head = await orderedDoublyLinkedList.connect(addr1).head();
            expect(head).to.equal(value.id);
            console.log("(Inserted, head)", value, head);
        }
        const head = await orderedDoublyLinkedList.connect(addr1).head();
        expect(head).to.equal(1);
        const tail = await orderedDoublyLinkedList.connect(addr1).tail();
        expect(tail).to.equal(3);
        for (let i = 0; i < values.length; i++) {
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            console.log(node);
            expect(node.value).to.equal(values[i].value);
        }
    });

    it("should insert at the middle", async function () {
        const values = [
            {
                id: 5,
                value: 5,
                prev: 4,
                next: 9,
                nearestInput: 0
            },
            {
                id: 10,
                value: 10,
                prev: 9,
                next: 14,
                nearestInput: 0
            },
            {
                id: 15,
                value: 15,
                prev: 14,
                next: 0,
                nearestInput: 5
            },
            {
                id: 14,
                value: 15,
                prev: 10,
                next: 15,
                nearestInput: 5
            },
            {
                id: 9,
                value: 10,
                prev: 5,
                next: 10,
                nearestInput: 15
            },
            {
                id: 4,
                value: 5,
                prev: 0,
                next: 5,
                nearestInput: 15
            }
        ];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const result = await orderedDoublyLinkedList.connect(addr1).upsert(value.id, value.value, value.nearestInput);
            const head = await orderedDoublyLinkedList.connect(addr1).head();
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            const tail = await orderedDoublyLinkedList.connect(addr1).tail();
            console.log("(Inserted, head, tail, node)", value, head, tail, node);
        }
        const head = await orderedDoublyLinkedList.connect(addr1).head();
        expect(head).to.equal(4);
        const tail = await orderedDoublyLinkedList.connect(addr1).tail();
        expect(tail).to.equal(15);
        for (let i = 0; i < values.length; i++) {
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            console.log("(id, node)", values[i].id, values[i].value, node);
            expect(node.value).to.equal(values[i].value);
            expect(node.prev).to.equal(values[i].prev);
            expect(node.next).to.equal(values[i].next);
        }
    });

});