
const {accounts, contract, web3} = require('@openzeppelin/test-environment');
const {BN, send, ether, balance, constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const ABI = [{
  "inputs": [
    {
      "internalType": "bytes32[]",
      "name": "proof",
      "type": "bytes32[]"
    }
  ],
  "name": "claimAirdrop",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}];
const DeflationLabsToken = contract.fromArtifact('DeflationLabsToken');

describe('DeflationLabsTokenTest', () => {
    const [owner, dev, reward, user, user2] = accounts;

    beforeEach(async() => {
        this.dlt = await DeflationLabsToken.new({from: owner});
        await this.dlt.setDevAddress(dev, {from: owner});
        await this.dlt.setRewardAddress(reward, {from: owner});
        this.contract = new web3.eth.Contract(ABI, this.dlt.address);
    });

    it('The contract initially has correct state', async() => {
        expect((await this.dlt.balanceOf(this.dlt.address)).toNumber()).to.equal(800);
        expect((await this.dlt.devPercent()).toNumber()).to.equal(2);
        expect((await this.dlt.burnPercent()).toNumber()).to.equal(5);
        expect((await this.dlt.rewardPercent()).toNumber()).to.equal(3);
        expect(await this.dlt.isLocked(owner)).to.be.false;
        expect(await this.dlt.isLocked(user)).to.be.false;
        expect(await this.dlt.devAddress()).to.equal(dev);
        expect(await this.dlt.rewardAddress()).to.equal(reward);
    });

    it('Only owner can modify contract state', async() => {
        expect(await this.dlt.owner()).to.equal(owner);
        await this.dlt.updatePercentage(2, 3, 5, {from: owner});
        expect((await this.dlt.devPercent()).toNumber()).to.equal(2);
        expect((await this.dlt.burnPercent()).toNumber()).to.equal(3);
        expect((await this.dlt.rewardPercent()).toNumber()).to.equal(5);
        await expectRevert(
            this.dlt.updatePercentage(3, 3, 4, {from: user}),
            'Ownable: caller is not the owner'
        );
        await expectRevert(
            this.dlt.setDevAddress(user, {from: user}),
            'Ownable: caller is not the owner'
        );
        await expectRevert(
            this.dlt.setRewardAddress(user, {from: user}),
            'Ownable: caller is not the owner'
        );
    });

    it('Owner cannot be too greedy', async() => {
        await expectRevert(
            this.dlt.updatePercentage(3, 3, 5, {from: owner}),
            'too greedy'
        );
    })

    it('Transfer works correctly', async() => {
        const amount = 200;
        const totalSupplyBefore = (await this.dlt.totalSupply()).toNumber();
        const balanceBefore = (await this.dlt.balanceOf(owner)).toNumber();
        await this.dlt.transfer(user, amount, {from: owner});
        const balanceAfter = (await this.dlt.balanceOf(owner)).toNumber();
        expect(balanceAfter + amount).to.equal(balanceBefore);
        const devBalance = (await this.dlt.balanceOf(dev)).toNumber();
        const devPercent = (await this.dlt.devPercent()).toNumber();
        expect(devBalance).to.equal(amount * devPercent / 100);
        const rewardBalance = (await this.dlt.balanceOf(reward)).toNumber();
        const rewardPercent = (await this.dlt.rewardPercent()).toNumber();
        expect(rewardBalance).to.equal(amount * rewardPercent / 100);
        const burnPercent = (await this.dlt.burnPercent()).toNumber();
        const burnAmount = amount * burnPercent / 100;
        const userBalance = (await this.dlt.balanceOf(user)).toNumber();
        expect(burnAmount > 0).to.be.true;
        const totalSupplyAfter = (await this.dlt.totalSupply()).toNumber();
        // console.log(userBalance, devBalance, rewardBalance);
        expect(userBalance + burnAmount + rewardBalance + devBalance).to.equal(amount);
        expect(totalSupplyAfter + burnAmount).to.equal(totalSupplyBefore);

        // transfer a small amount will not deflate
        const smallAmount = 10;
        await this.dlt.transfer(user2, smallAmount, {from: user});
        expect((await this.dlt.balanceOf(user2)).toNumber()).to.equal(smallAmount);
        expect((await this.dlt.balanceOf(user)).toNumber()).to.equal(userBalance - smallAmount);
    });

    it('Transfer works correctly between dev and reward', async() => {
        const amount = 1000000;
        await this.dlt.transfer(user, amount, {from: owner});
        const devBalance = (await this.dlt.balanceOf(dev)).toNumber();
        const devPercent = (await this.dlt.devPercent()).toNumber();
        expect(devBalance).to.equal(amount * devPercent / 100);
        const rewardBalance = (await this.dlt.balanceOf(reward)).toNumber();
        const rewardPercent = (await this.dlt.rewardPercent()).toNumber();
        const burnPercent = (await this.dlt.burnPercent()).toNumber();
        expect(rewardBalance).to.equal(amount * rewardPercent / 100);
        await this.dlt.transfer(reward, devBalance, {from: dev});
        expect((await this.dlt.balanceOf(dev)).toNumber()).to.equal(0);
        const rewardBalanceAfter = (await this.dlt.balanceOf(reward)).toNumber();
        expect(rewardBalanceAfter).to.equal(rewardBalance + devBalance * (100 - devPercent  - burnPercent) / 100);
        await this.dlt.transfer(dev, rewardBalanceAfter, {from: reward});
        expect((await this.dlt.balanceOf(reward)).toNumber()).to.equal(0);
        const devBalanceAfter = (await this.dlt.balanceOf(dev)).toNumber();
        expect(devBalanceAfter).to.equal(rewardBalanceAfter * (100 - rewardPercent - burnPercent) / 100);
    });

    it('Transfer works correctly with updated percent', async() => {
        await this.dlt.updatePercentage(3, 4, 3, {from: owner});
        const amount = 100;
        const totalSupplyBefore = (await this.dlt.totalSupply()).toNumber();
        const balanceBefore = (await this.dlt.balanceOf(owner)).toNumber();
        await this.dlt.transfer(user, amount, {from: owner});
        const balanceAfter = (await this.dlt.balanceOf(owner)).toNumber();
        expect(balanceAfter + amount).to.equal(balanceBefore);
        const devBalance = (await this.dlt.balanceOf(dev)).toNumber();
        const devPercent = (await this.dlt.devPercent()).toNumber();
        expect(devBalance).to.equal(amount * devPercent / 100);
        const rewardBalance = (await this.dlt.balanceOf(reward)).toNumber();
        const rewardPercent = (await this.dlt.rewardPercent()).toNumber();
        expect(rewardBalance).to.equal(amount * rewardPercent / 100);
        const burnPercent = (await this.dlt.burnPercent()).toNumber();
        const burnAmount = amount * burnPercent / 100;
        const userBalance = (await this.dlt.balanceOf(user)).toNumber();
        expect(burnAmount > 0).to.be.true;
        const totalSupplyAfter = (await this.dlt.totalSupply()).toNumber();
        // console.log(userBalance, devBalance, rewardBalance);
        expect(userBalance + burnAmount + rewardBalance + devBalance).to.equal(amount);
        expect(totalSupplyAfter + burnAmount).to.equal(totalSupplyBefore);
    });

    it('Timelock works correctly in transfer', async() => {
        const amount = 100;
        await this.dlt.transfer(user, amount, {from: owner});   // _transferDeadline for user is updated
        expect((await this.dlt.timeTillLocked(user)).eq(constants.MAX_UINT256)).to.be.false;
        await time.increase(time.duration.hours(35));           // user is not locked yet after 35 hours
        await this.dlt.transfer(user2, 50, {from: user});       // this transfer will succeed
        await time.increase(time.duration.hours(2));            // user will be locked
        await expectRevert(
            this.dlt.transfer(user2, 10, {from: user}),         // this should be blocked
            'sender or receiver is locked'
        );
        await expectRevert(
            this.dlt.transfer(user, 10, {from: owner}),         // this should be blocked
            'sender or receiver is locked'
        );

        expect((await this.dlt.timeTillLocked(user)).eq(new BN(0))).to.be.true;
        expect(await this.dlt.isLocked(user)).to.be.true;
        expect((await this.dlt.timeTillLocked(user2)).eq(constants.MAX_UINT256)).to.be.false;
        expect(await this.dlt.isLocked(user2)).to.be.false;
    });

    it('Timelock resets correctly in transfer', async() => {
        const amount = 100;
        await this.dlt.transfer(user, amount, {from: owner});   // _transferDeadline for user is updated
        expect((await this.dlt.timeTillLocked(user)).eq(constants.MAX_UINT256)).to.be.false;
        await time.increase(time.duration.hours(35));           // user is not locked yet after 35 hours
        const userBalance = (await this.dlt.balanceOf(user)).toNumber();
        await this.dlt.transfer(user2, userBalance, {from: user});  // this will reset the _transferDeadline
        expect((await this.dlt.timeTillLocked(user)).eq(constants.MAX_UINT256)).to.be.true;
        expect(await this.dlt.isLocked(user)).to.be.false;
    });

    it('timeTillLocked works correctly', async() => {
        const amount = 100;
        await this.dlt.transfer(user, amount, {from: owner});   // _transferDeadline for user is updated
        const lockTimerInSeconds = (await this.dlt.lockTimerInSeconds()).toNumber();
        expect((await this.dlt.timeTillLocked(user)).toNumber()).to.equal(lockTimerInSeconds);
        await time.increase(time.duration.hours(1));
        expect((await this.dlt.timeTillLocked(user)).toNumber()).to.equal(lockTimerInSeconds - 60 * 60);
        await time.increase(time.duration.hours(36));
        expect((await this.dlt.timeTillLocked(user)).toNumber()).to.equal(0);
        expect(await this.dlt.isLocked(user)).to.be.true;

        expect((await this.dlt.timeTillLocked(user2)).eq(constants.MAX_UINT256)).to.be.true;    // not locked
        expect((await this.dlt.timeTillLocked(owner)).eq(constants.MAX_UINT256)).to.be.true;    // not locked
        expect((await this.dlt.timeTillLocked(dev)).eq(constants.MAX_UINT256)).to.be.true;      // not locked
        expect((await this.dlt.timeTillLocked(reward)).eq(constants.MAX_UINT256)).to.be.true;   // not locked
    });

    it('airdrop feature works correctly', async() => {
        const merkleRoot = '0x0db2dd7b4532d2869c573c38ecca8e59b28091d4a9c44144914b2846af51cfc6';
        await this.dlt.setMerkleRoot(merkleRoot, {from: owner});
        const testProof = {
            '0xe65c4E7739879C61E6B07f8d92fC5dc744793A82': ['0x7f99d3cdc43cc49e3b7cdb78878d42defbce61ed624fc845d1f70c539bb0a7fc','0x581e7cdfd5dfa863466d6df455c919bf4156c5c6cae3afc7d333277e77416a50'],
            '0xBA9b7aEB59522C6f9d83449d1615EF848DB6Ba7c': ['0xd7c85f6ad652e618ae9639b3b91e509015977c61a5432a1648b173cb75d02ee5','0x581e7cdfd5dfa863466d6df455c919bf4156c5c6cae3afc7d333277e77416a50'],
            '0xF20f881915B3923c2E6D7d0e5666fe3F99b5F246': ['0x4e974b5d9bb8c04c9c7271c6fe2b950e596b8ea7d11ab92adcf8e9d938556559']
        };
        for (const [wallet, proof] of Object.entries(testProof)) {
            const res = await this.dlt.airdropEligible(wallet, proof);
            expect(res['0']).to.be.true;
        }

        // mismatch wallet and proof
        let res = await this.dlt.airdropEligible('0xe65c4E7739879C61E6B07f8d92fC5dc744793A82', testProof['0xBA9b7aEB59522C6f9d83449d1615EF848DB6Ba7c']);
        expect(res['0']).to.be.false;

        // other wallets are not eligible
        for (const wallet of accounts) {
            const res = await this.dlt.airdropEligible(wallet, testProof['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82']);
            expect(res['0']).to.be.false;
        }

        // can't claim before start
        await expectRevert(
            this.dlt.claimAirdrop(testProof['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82'], {from: owner}),
            'airdrop not started'
        );

        // activate airdrop
        await this.dlt.activateAirdrop({from: owner});
        expect(await this.dlt.airdropActive()).to.be.true;

        const privateKey = ['0x4eb758710891810b3455d9f0af1b2e6110cf8f1d17d681ee806d103bd7d55e69', '0x266672f379780672f7a80f581d6c079eb897d19201a4f7ce5375e71933aa5a41', '0x269771fdb43611b7ec1057ff7dd45d0907459b6452c62b166fd93f6832e22603'];
        const airdropUser = ['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82', '0xBA9b7aEB59522C6f9d83449d1615EF848DB6Ba7c', '0xF20f881915B3923c2E6D7d0e5666fe3F99b5F246'];
        // claim airdrop
        await send.ether(owner, airdropUser[0], ether('1'));
        let f = this.contract.methods.claimAirdrop(testProof[airdropUser[0]]);
        let txn = await web3.eth.accounts.signTransaction(
            {
                nonce: await web3.eth.getTransactionCount(airdropUser[0]),
                to: this.dlt.address,
                value: 0,
                data: f.encodeABI(),
                gas: 15000000
            },
            privateKey[0]
        );
        const receipt = await web3.eth.sendSignedTransaction(txn.rawTransaction);
        expect((await this.dlt.balanceOf(airdropUser[0])).toNumber()).to.equal(720);
        res = await this.dlt.airdropEligible(airdropUser[0], testProof[airdropUser[0]]);
        expect(res['0']).to.be.false;

        // can't claim twice
        txn = await web3.eth.accounts.signTransaction(
            {
                nonce: await web3.eth.getTransactionCount(airdropUser[0]),
                to: this.dlt.address,
                value: 0,
                data: f.encodeABI(),
                gas: 15000000
            },
            privateKey[0]
        );
        let thrown = false;
        try {
            await web3.eth.sendSignedTransaction(txn.rawTransaction);
        } catch (error) {
            const errorString = error.toString();
            if (errorString.includes('not eligible')) {
                thrown = true;
            }
        }
        expect(thrown).to.be.true;

        // others can't claim
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[0]], {from: owner}),
            'not eligible'
        );

        // locked user can't claim
        await send.ether(owner, airdropUser[1], ether('1'));
        await this.dlt.transfer(airdropUser[1], 1000, {from: owner});
        await time.increase(time.duration.hours(37));
        f = this.contract.methods.claimAirdrop(testProof[airdropUser[1]]);
        txn = await web3.eth.accounts.signTransaction(
            {
                nonce: await web3.eth.getTransactionCount(airdropUser[1]),
                to: this.dlt.address,
                value: 0,
                data: f.encodeABI(),
                gas: 15000000
            },
            privateKey[1]
        );
        thrown = false;
        try {
            await web3.eth.sendSignedTransaction(txn.rawTransaction);
        } catch (error) {
            const errorString = error.toString();
            if (errorString.includes('user is locked')) {
                thrown = true;
            }
        }
        expect(thrown).to.be.true;

        // user can't claim when there is no token left
        await send.ether(owner, airdropUser[2], ether('1'));
        f = this.contract.methods.claimAirdrop(testProof[airdropUser[2]]);
        txn = await web3.eth.accounts.signTransaction(
            {
                nonce: await web3.eth.getTransactionCount(airdropUser[2]),
                to: this.dlt.address,
                value: 0,
                data: f.encodeABI(),
                gas: 15000000
            },
            privateKey[2]
        );
        thrown = false;
        try {
            await web3.eth.sendSignedTransaction(txn.rawTransaction);
        } catch (error) {
            const errorString = error.toString();
            if (errorString.includes('no token left')) {
                thrown = true;
            }
        }
        expect(thrown).to.be.true;

        // can't claim after airdrop finishes
        await time.increase(time.duration.hours(36));
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[2]], {from: owner}),
            'airdrop finished'
        );
    });
});
