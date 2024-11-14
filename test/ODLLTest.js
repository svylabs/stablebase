const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OrderedDoublyLinkedListTest", function () {
    this.beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const OrderedDoublyLinkedListFactory = await ethers.getContractFactory("OrderedDoublyLinkedList");
        orderedDoublyLinkedList = await OrderedDoublyLinkedListFactory.connect(addr1).deploy();
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
            const receipt = await result.wait();
            const head = await orderedDoublyLinkedList.connect(addr1).head();
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            const tail = await orderedDoublyLinkedList.connect(addr1).tail();
            console.log("(Inserted, head, tail, node, gas)", value, head, tail, node, receipt.gasUsed);
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

    it("Test update", async function () {
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
            const receipt = await result.wait();
            const head = await orderedDoublyLinkedList.connect(addr1).head();
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            const tail = await orderedDoublyLinkedList.connect(addr1).tail();
            console.log("(Inserted, head, tail, node, gas)", value, head, tail, node, receipt.gasUsed);
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
        const update = {
            id: 4,
            value: 100,
            prev: 15,
            next: 0,
            nearestInput: 15
        };
        const updatedValues = [
            {
                id: 5,
                value: 5,
                prev: 0,
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
                next: 4,
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
                value: 100,
                prev: 15,
                next: 0,
                nearestInput: 15
            }
        ];
        const result = await orderedDoublyLinkedList.connect(addr1).upsert(update.id, update.value, update.nearestInput);
        const receipt = await result.wait();
        const node = await orderedDoublyLinkedList.connect(addr1).nodes(update.id);
        console.log("(Updated, node, gas)", update, node, receipt.gasUsed);
        expect(node.value).to.equal(update.value);
        expect(node.prev).to.equal(update.prev);
        expect(node.next).to.equal(update.next);
        const head2 = await orderedDoublyLinkedList.connect(addr1).head();
        const tail2 = await orderedDoublyLinkedList.connect(addr1).tail();
        console.log("(head, tail)", head2, tail2);
        expect(head2).to.equal(5);
        expect(tail2).to.equal(4);
        for (let i = 0; i < updatedValues.length; i++) {
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(updatedValues[i].id);
            console.log("(id, node)", updatedValues[i].id, updatedValues[i].value, node);
            expect(node.value).to.equal(updatedValues[i].value);
            expect(node.prev).to.equal(updatedValues[i].prev);
            expect(node.next).to.equal(updatedValues[i].next);
        }
    });

    it("Test Remove", async function () {
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
            const receipt = await result.wait();
            const head = await orderedDoublyLinkedList.connect(addr1).head();
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(values[i].id);
            const tail = await orderedDoublyLinkedList.connect(addr1).tail();
            console.log("(Inserted, head, tail, node, gas)", value, head, tail, node, receipt.gasUsed);
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
        const removeTest = {
            remove: [
                {
                    id: 9,
                    head: 4,
                    tail: 15,
                },
                {
                    id: 15,
                    head: 4, 
                    tail: 14
                },
                {
                    id: 4,
                    head: 5,
                    tail: 14
                }
            ],
            updatedValues: [
                {
                    id: 5,
                    value: 5,
                    prev: 0,
                    next: 10,
                    nearestInput: 0
                },
                {
                    id: 10,
                    value: 10,
                    prev: 5,
                    next: 14,
                    nearestInput: 0
                },
                {
                    id: 14,
                    value: 15,
                    prev: 10,
                    next: 0,
                    nearestInput: 5
                }
            ]
        };
        for (let i = 0; i < removeTest.remove.length; i++) {
            const remove = removeTest.remove[i];
            const result = await orderedDoublyLinkedList.connect(addr1).remove(remove.id);
            const receipt = await result.wait();
            const head2 = await orderedDoublyLinkedList.connect(addr1).head();
            const tail2 = await orderedDoublyLinkedList.connect(addr1).tail();
            console.log("(Removed, head, tail, gas)", remove, head2, tail2, receipt.gasUsed);
            expect(head2).to.equal(remove.head);
            expect(tail2).to.equal(remove.tail);
        }
        for (let i = 0; i < removeTest.updatedValues.length; i++) {
            const node = await orderedDoublyLinkedList.connect(addr1).nodes(removeTest.updatedValues[i].id);
            console.log("(id, node)", removeTest.updatedValues[i].id, removeTest.updatedValues[i].value, node);
            expect(node.value).to.equal(removeTest.updatedValues[i].value);
            expect(node.prev).to.equal(removeTest.updatedValues[i].prev);
            expect(node.next).to.equal(removeTest.updatedValues[i].next);
        }
    });

    it ("Should change ownership", async function() {
        const id = 1;
        const value = 1;
        //await orderedDoublyLinkedList.connect(owner).upsert(1, 1, 0);
        await expect(orderedDoublyLinkedList.connect(owner).upsert(1, 1, 0)).to.be.revertedWithCustomError(orderedDoublyLinkedList, "OwnableUnauthorizedAccount");
        await orderedDoublyLinkedList.connect(addr1).setAddresses(owner.address);
        await expect(orderedDoublyLinkedList.connect(addr1).upsert(1, 1, 0)).to.be.revertedWithCustomError(orderedDoublyLinkedList, "OwnableUnauthorizedAccount");
        await orderedDoublyLinkedList.connect(owner).upsert(1, 1, 0);
        const head = await orderedDoublyLinkedList.connect(owner).head();
        expect(head).to.equal(id);
        const tail = await orderedDoublyLinkedList.connect(owner).tail();
        expect(tail).to.equal(id);
        const node = await orderedDoublyLinkedList.connect(addr1).nodes(id);
        expect(node.value).to.equal(value);
    });


    it("Random test", async function() {
        const randomValues = [];
        const ids = {};
        for (i = 0 ;i<150;i++) {
            randomValues.push({
                id: Math.floor(Math.random() * 100000000),
                value: Math.floor(Math.random() * 100),
                nearestInput: Math.floor(Math.random() * 100)
            });
            if (ids[randomValues[i].id] === undefined) {
                const tx = await orderedDoublyLinkedList.connect(addr1).upsert(randomValues[i].id, randomValues[i].value, randomValues[i].nearestInput);
                const receipt = await tx.wait();
            }
            ids[randomValues[i].id] = true;
            
        }
        for (i=0;i<randomValues.length;i++) {
            const node = await orderedDoublyLinkedList.getNode(randomValues[i].id);
            expect(node.value).to.equal(randomValues[i].value);
        }
        let current = await orderedDoublyLinkedList.getHead();
        let prev;
        let prevId;
        do {
            const node = await orderedDoublyLinkedList.getNode(current);
            if (prev) {
                expect(prev.value).to.be.lessThanOrEqual(node.value);
                expect(prev.next).to.equal(current);
                expect(node.prev).to.equal(prevId);
            }
            //console.log("Node: ", node, current);
            prevId = current;
            current = node.next;
            prev = node;
        } while (current != BigInt(0));

    })

});