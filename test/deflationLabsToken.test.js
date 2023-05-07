
const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, send, ether, balance, constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const DeflationLabsToken = contract.fromArtifact('DeflationLabsToken');

describe('DeflationLabsTokenTest', () => {
    const [owner, dev, reward, user, user2] = accounts;

    beforeEach(async() => {
        this.dlt = await DeflationLabsToken.new({from: owner});
        await this.dlt.setDevAddress(dev, {from: owner});
        await this.dlt.setRewardAddress(reward, {from: owner});
    });

    it('The contract initially has correct state', async() => {
        expect((await this.dlt.balanceOf(this.dlt.address)).toNumber()).to.equal(100000000);
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
        await time.increase(time.duration.hours(1) + 1);        // user will be locked
        await expectRevert(
            this.dlt.transfer(user2, 10, {from: user}),         // this should be blocked
            'Timeout, sender or receiver is locked'
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

    });
});
