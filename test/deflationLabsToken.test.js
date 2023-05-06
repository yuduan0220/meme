
const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, send, ether, balance, constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const DeflationLabsToken = contract.fromArtifact('DeflationLabsToken');

describe('DeflationLabsTokenTest', () => {
    const [owner, dev, reward, user] = accounts;
    // this.timeout(10000);

    beforeEach(async() => {
        this.dlt = await DeflationLabsToken.new({from: owner});
        await this.dlt.setDevAddress(dev, {from: owner});
        await this.dlt.setRewardAddress(reward, {from: owner});
    });

    it('The contract initially has correct state', async() => {
        expect((await this.dlt.balanceOf(this.dlt.address)).toNumber()).to.equal(100000000);
        // expect((await this.dlt.totalSupply()).toNumber()).to.equal(100000000);
        expect((await this.dlt.devPercent()).toNumber()).to.equal(2);
        expect((await this.dlt.burnPercent()).toNumber()).to.equal(5);
        expect((await this.dlt.rewardPercent()).toNumber()).to.equal(3);
        expect(await this.dlt.isBlocked(owner)).to.be.false;
        expect(await this.dlt.isBlocked(user)).to.be.false;
        expect(await this.dlt.devAddress()).to.equal(dev);
        expect(await this.dlt.rewardAddress()).to.equal(reward);
        console.log((await time.latest()).toNumber());
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

    it('Transfer works correctly with updated percent', async() => {
        await this.dlt.updatePercentage(2, 3, 5, {from: owner});
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

    it('Transfer timelock works correctly', async() => {
        const amount = 100;
        const balanceBefore = (await this.dlt.balanceOf(owner)).toNumber();
        await this.dlt.transfer(user, amount, {from: owner});   // _lastTransferTimestamp for owner is updated
        await time.increase(time.duration.hours(35));           // increase block timestamp by 35 hours, not locked yet
        await this.dlt.transfer(user, amount, {from: owner});   // this should still work and reset the lock
        await time.increase(time.duration.hours(35));           // increase block timestamp by 35 hours, not locked yet
        await this.dlt.transfer(user, amount, {from: owner});   // this should still work and reset the lock
        const balanceAfter = (await this.dlt.balanceOf(owner)).toNumber();
        expect(balanceAfter + 3 * amount).to.equal(balanceBefore);
        await time.increase(time.duration.hours(36) + 1);        // increase block timestamp by 36 hours, should be locked
        await expectRevert(
            this.dlt.transfer(user, amount, {from: owner}),     // this should be blocked
            'Timeout, blocked'
        );
        expect(await this.dlt.isBlocked(owner)).to.be.true;
        expect(await this.dlt.isBlocked(user)).to.be.false;
    });
});
