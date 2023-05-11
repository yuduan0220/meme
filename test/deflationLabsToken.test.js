
const {accounts, contract, web3} = require('@openzeppelin/test-environment');
const {BN, send, ether, balance, constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');
const routerABI = require('./routerABI');
const ERC20ABI = require('./ERC20ABI');
const routerAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const DeflationLabsToken = contract.fromArtifact('DeflationLabsToken');

async function sendFunction(to, value, f, privateKey) {
    const walletAddress = web3.eth.accounts.privateKeyToAccount(privateKey).address;
    const txn = await web3.eth.accounts.signTransaction(
        {
            nonce: await web3.eth.getTransactionCount(walletAddress),
            to,
            value,
            data: f.encodeABI(),
            gas: 15000000
        },
        privateKey
    );
    try {
        const receipt = await web3.eth.sendSignedTransaction(txn.rawTransaction);
        return receipt.transactionHash;
    } catch (error) {
        console.log(error);
        return undefined;
    }
}

describe('DeflationLabsTokenTest', () => {
    const [dev, reward, user, user2, fund, referer] = accounts;
    const owner = '0xfb5C28a1e4d6DFC372Dc0Aeef7AF8AdE27668F42';
    const ownerKey = '0x2a9077cc3be2efd79b74b4edc291a8afedbe2fadc9289b4939130f7ce9d15928';
    const uniswapUser = '0x9111af93289BaDcf8396cd2d9C15d0d32510eA27';
    const uniswapUserKey = '0x0b7dd4c875e63bd7240feebaeda9d581536dfa5d4de2827721d58fa5aa964052';

    beforeEach(async() => {
        try {
            await send.ether(fund, owner, ether('50'));
            await send.ether(fund, uniswapUser, ether('49'));
        } catch (error) {
            ;
        }
        this.dlt = await DeflationLabsToken.new({from: owner});
        await this.dlt.setDevAddress(dev, {from: owner});
        await this.dlt.setRewardAddress(reward, {from: owner});
    });

    it('The contract initially has correct state', async() => {
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
        await expectRevert(
            this.dlt.setAirdropAmount(2000, {from: user}),
            'Ownable: caller is not the owner'
        );
    });

    it('Owner cannot be too greedy', async() => {
        await expectRevert(
            this.dlt.updatePercentage(3, 3, 5, {from: owner}),
            'too greedy'
        );
    });

    it('Transfer works correctly', async() => {
        const amount = 200;
        const totalSupplyBefore = await this.dlt.totalSupply();
        const balanceBefore = await this.dlt.balanceOf(owner);
        await this.dlt.transfer(user, amount, {from: owner});
        const balanceAfter = await this.dlt.balanceOf(owner);
        expect((balanceAfter.add(new BN(amount))).eq(balanceBefore)).to.be.true;
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
        const totalSupplyAfter = await this.dlt.totalSupply();
        expect(userBalance + burnAmount + rewardBalance + devBalance).to.equal(amount);
        expect((totalSupplyAfter.add(new BN(burnAmount))).eq(totalSupplyBefore)).to.be.true;

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
        const totalSupplyBefore = await this.dlt.totalSupply();
        const balanceBefore = await this.dlt.balanceOf(owner);
        await this.dlt.transfer(user, amount, {from: owner});
        const balanceAfter = await this.dlt.balanceOf(owner);
        expect((balanceAfter.add(new BN(amount))).eq(balanceBefore)).to.be.true;
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
        const totalSupplyAfter = await this.dlt.totalSupply();
        expect(userBalance + burnAmount + rewardBalance + devBalance).to.equal(amount);
        expect((totalSupplyAfter.add(new BN(burnAmount))).eq(totalSupplyBefore)).to.be.true;
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

        // allowlisted addresses won't be locked
        const uniswapV2Pair = await this.dlt.uniswapV2Pair();
        const uniswapV2Router = await this.dlt.uniswapV2Router();
        await this.dlt.transfer(uniswapV2Pair, 1000, {from: owner});
        await this.dlt.transfer(uniswapV2Router, 1000, {from: owner});
        await this.dlt.transfer(this.dlt.address, 1000, {from: owner});
        expect((await this.dlt.timeTillLocked(uniswapV2Pair)).eq(constants.MAX_UINT256)).to.be.true;
        expect(await this.dlt.isLocked(uniswapV2Pair)).to.be.false;
        expect((await this.dlt.timeTillLocked(uniswapV2Router)).eq(constants.MAX_UINT256)).to.be.true;
        expect(await this.dlt.isLocked(uniswapV2Router)).to.be.false;
        expect((await this.dlt.timeTillLocked(this.dlt.address)).eq(constants.MAX_UINT256)).to.be.true;
        expect(await this.dlt.isLocked(this.dlt.address)).to.be.false;
        await time.increase(time.duration.hours(37));
        expect(await this.dlt.isLocked(uniswapV2Pair)).to.be.false;
        expect(await this.dlt.isLocked(uniswapV2Router)).to.be.false;
        expect(await this.dlt.isLocked(this.dlt.address)).to.be.false;
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
        expect((await this.dlt.timeTillLocked(user)).toNumber()).to.be.within(lockTimerInSeconds - 60 * 60 - 10, lockTimerInSeconds - 60 * 60);
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
            this.dlt.claimAirdrop(testProof['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82'], constants.ZERO_ADDRESS, {from: owner}),
            'airdrop not started'
        );
        await expectRevert(
            this.dlt.claimReferalBonus({from: owner}),
            'airdrop not started'
        );

        // activate airdrop
        const totalAirdrop = await this.dlt.balanceOf(this.dlt.address);
        const airdropAmount = totalAirdrop.div(new BN(2));
        await this.dlt.setAirdropAmount(airdropAmount, {from: owner});
        await this.dlt.activateAirdrop({from: owner});
        expect(await this.dlt.airdropActive()).to.be.true;

        const privateKey = ['0x4eb758710891810b3455d9f0af1b2e6110cf8f1d17d681ee806d103bd7d55e69', '0x266672f379780672f7a80f581d6c079eb897d19201a4f7ce5375e71933aa5a41', '0x269771fdb43611b7ec1057ff7dd45d0907459b6452c62b166fd93f6832e22603'];
        const airdropUser = ['0xe65c4E7739879C61E6B07f8d92fC5dc744793A82', '0xBA9b7aEB59522C6f9d83449d1615EF848DB6Ba7c', '0xF20f881915B3923c2E6D7d0e5666fe3F99b5F246'];
        await send.ether(owner, airdropUser[0], ether('1'));
        await send.ether(owner, airdropUser[1], ether('1'));
        await send.ether(owner, airdropUser[2], ether('1'));

        // can't refer oneself
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[0]], airdropUser[0], {from: airdropUser[0]}),
            'self refer is not allowed'
        );

        // no bonus to claim yet
        await expectRevert(
            this.dlt.claimReferalBonus({from: airdropUser[0]}),
            'nothing to claim'
        );

        // claim airdrop
        await this.dlt.claimAirdrop(testProof[airdropUser[0]], referer, {from: airdropUser[0]});
        const userBalance = await this.dlt.balanceOf(airdropUser[0]);
        expect(userBalance.eq(airdropAmount.mul(new BN(9)).div(new BN(10)))).to.be.true;
        res = await this.dlt.airdropEligible(airdropUser[0], testProof[airdropUser[0]]);
        expect(res['0']).to.be.false;
        expect((await this.dlt.claimedUsers()).toNumber()).to.equal(1);
        const referalAmount = airdropAmount.div(new BN(10));
        expect((await this.dlt.referalBonus(referer)).eq(referalAmount)).to.be.true;
        expect((await this.dlt.referalBonus(airdropUser[0])).eq(new BN(0))).to.be.true;

        // claim referal bonus
        await this.dlt.claimReferalBonus({from: referer});
        expect((await this.dlt.balanceOf(airdropUser[0])).eq(referalAmount.mul(new BN(9)).div(new BN(10))));
        expect((await this.dlt.referalBonus(referer)).eq(new BN(0))).to.be.true;
        await expectRevert(
            this.dlt.claimReferalBonus({from: referer}),
            'nothing to claim'
        );

        // can't claim twice
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[0]], constants.ZERO_ADDRESS, {from: airdropUser[0]}),
            'not eligible'
        );

        // others can't claim
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[0]], constants.ZERO_ADDRESS, {from: airdropUser[1]}),
            'not eligible'
        );

        // locked user can't claim
        await this.dlt.transfer(airdropUser[1], 1000, {from: owner});
        await time.increase(time.duration.hours(37));
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[1]], constants.ZERO_ADDRESS, {from: airdropUser[1]}),
            'user is locked'
        );
        await expectRevert(
            this.dlt.claimReferalBonus({from: airdropUser[1]}),
            'user is locked'
        );

        // airdrop user will be locked after 36 hours
        await expectRevert(
            this.dlt.transfer(airdropUser[1], 700, {from: airdropUser[0]}),
            'sender or receiver is locked'
        );
        await expectRevert(
            this.dlt.transfer(airdropUser[1], 700, {from: referer}),
            'sender or receiver is locked'
        );

        // locked address can't refer
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[2]], referer, {from: airdropUser[2]}),
            'referer is locked'
        );

        const tokensLeft = await this.dlt.balanceOf(this.dlt.address);
        await this.dlt.claimAirdrop(testProof[airdropUser[2]], constants.ZERO_ADDRESS, {from: airdropUser[2]});
        expect((await this.dlt.balanceOf(airdropUser[2])).eq(tokensLeft.mul(new BN(9)).div(new BN(10)))).to.be.true;

        // can't claim after airdrop finishes
        await time.increase(time.duration.hours(36));
        await expectRevert(
            this.dlt.claimAirdrop(testProof[airdropUser[2]], constants.ZERO_ADDRESS, {from: owner}),
            'airdrop finished'
        );
        await expectRevert(
            this.dlt.claimReferalBonus({from: owner}),
            'airdrop finished'
        );
    });

    it('uniswap feature works correctly', async() => {
        const router = new web3.eth.Contract(routerABI, routerAddress);
        const wethAddress = await router.methods.WETH().call();
        const weth = new web3.eth.Contract(ERC20ABI, wethAddress);
        const lpAddress = await this.dlt.uniswapV2Pair();
        const lp = new web3.eth.Contract(ERC20ABI, lpAddress);
        const factoryAddress = await router.methods.factory().call();
        expect(factoryAddress).to.equal(await this.dlt.uniswapV2Factory());
        const ownerBalance = await this.dlt.balanceOf(owner);

        // add liquidity, doesn't burn
        const deadline = await time.latest() + 100000;
        await this.dlt.approve(routerAddress, ownerBalance, {from: owner});
        let f = router.methods.addLiquidityETH(this.dlt.address, ownerBalance, 1, ether('1'), owner, deadline);
        await sendFunction(routerAddress, ether('1'), f, ownerKey);
        // owner should receive lp token
        expect(await lp.methods.balanceOf(owner).call() > 0).to.be.true;
        // lp address should contain WETH and DLT tokens
        expect(await weth.methods.balanceOf(lpAddress).call() / 10**18).to.equal(1);
        expect((await this.dlt.balanceOf(lpAddress)).eq(ownerBalance)).to.be.true;

        // user buy
        const lockTimerInSeconds = (await this.dlt.lockTimerInSeconds()).toNumber();
        let amountOutMinimum = await router.methods.getAmountsOut(ether('0.5'), [wethAddress, this.dlt.address]).call();
        f = router.methods.swapExactETHForTokens(parseInt(amountOutMinimum[1] * 0.9), [wethAddress, this.dlt.address], uniswapUser, deadline);
        await sendFunction(routerAddress, ether('0.5'), f, uniswapUserKey);
        let userBalance = await this.dlt.balanceOf(uniswapUser);
        expect(userBalance.gt(new BN(parseInt(amountOutMinimum[1] * 0.9)))).to.be.true;
        // _transferDeadline is updated for the user but not locked yet
        expect((await this.dlt.timeTillLocked(uniswapUser)).toNumber()).to.equal(lockTimerInSeconds);
        expect(await this.dlt.isLocked(uniswapUser)).to.be.false;

        // user sell partial tokens won't reset the lock, sell doesn't burn
        await this.dlt.approve(routerAddress, ether('10000'), {from: uniswapUser});
        amountOutMinimum = await router.methods.getAmountsOut(ether('10000'), [this.dlt.address, wethAddress]).call();
        f = router.methods.swapExactTokensForETH(ether('10000'), amountOutMinimum[1], [this.dlt.address, wethAddress], uniswapUser, deadline);
        await sendFunction(routerAddress, 0, f, uniswapUserKey);
        expect((await this.dlt.timeTillLocked(uniswapUser)).toNumber() < lockTimerInSeconds).to.be.true;
        expect((await this.dlt.balanceOf(uniswapUser)).eq(userBalance.sub(new BN(ether('10000'))))).to.be.true;

        // user sell all tokens reset the lock
        userBalance = await this.dlt.balanceOf(uniswapUser);
        await this.dlt.approve(routerAddress, userBalance, {from: uniswapUser});
        amountOutMinimum = await router.methods.getAmountsOut(userBalance, [this.dlt.address, wethAddress]).call();
        f = router.methods.swapExactTokensForETH(userBalance, amountOutMinimum[1], [this.dlt.address, wethAddress], uniswapUser, deadline);
        await sendFunction(routerAddress, 0, f, uniswapUserKey);
        expect((await this.dlt.timeTillLocked(uniswapUser)).eq(constants.MAX_UINT256)).to.be.true;    // not locked

        // user buy token again and add all tokens to liquidity
        amountOutMinimum = await router.methods.getAmountsOut(ether('0.9'), [wethAddress, this.dlt.address]).call();
        f = router.methods.swapExactETHForTokens(parseInt(amountOutMinimum[1] * 0.9), [wethAddress, this.dlt.address], uniswapUser, deadline);
        await sendFunction(routerAddress, ether('0.9'), f, uniswapUserKey);
        let lowerBound = new BN(amountOutMinimum[1]).mul(new BN(9)).div(new BN(10));
        let upperBound = new BN(amountOutMinimum[1]).mul(new BN(91)).div(new BN(100));
        expect((await this.dlt.balanceOf(uniswapUser)).gt(lowerBound)).to.be.true;
        expect((await this.dlt.balanceOf(uniswapUser)).lt(upperBound)).to.be.true;
        // _transferDeadline is updated for the user but not locked yet
        expect((await this.dlt.timeTillLocked(uniswapUser)).toNumber()).to.equal(lockTimerInSeconds);
        expect(await this.dlt.isLocked(uniswapUser)).to.be.false;
        userBalance = await this.dlt.balanceOf(uniswapUser);
        const tmp = await this.dlt.balanceOf(lpAddress);
        await this.dlt.approve(routerAddress, userBalance, {from: uniswapUser});
        f = router.methods.addLiquidityETH(this.dlt.address, userBalance, userBalance, ether('1'), uniswapUser, deadline);
        await sendFunction(routerAddress, ether('2'), f, uniswapUserKey);
        expect(await lp.methods.balanceOf(uniswapUser).call() > 0).to.be.true;
        expect((await this.dlt.timeTillLocked(uniswapUser)).eq(constants.MAX_UINT256)).to.be.true;    // not locked
        expect((await this.dlt.balanceOf(lpAddress)).eq(tmp.add(userBalance))).to.be.true;

        // withdraw partial liquidity
        let lpBalance = await lp.methods.balanceOf(uniswapUser).call();
        f = lp.methods.approve(routerAddress, lpBalance);
        await sendFunction(lpAddress, 0, f, uniswapUserKey);
        f = router.methods.removeLiquidityETH(this.dlt.address, new BN(lpBalance).div(new BN(2)), 1, 1, uniswapUser, deadline);
        await sendFunction(routerAddress, 0, f, uniswapUserKey);
        expect((await this.dlt.timeTillLocked(uniswapUser)).toNumber()).to.equal(lockTimerInSeconds);
        upperBound = new BN(userBalance).mul(new BN(451)).div(new BN(1000));
        lowerBound = new BN(userBalance).mul(new BN(449)).div(new BN(1000));
        expect((await this.dlt.balanceOf(uniswapUser)).lt(upperBound)).to.be.true;
        expect((await this.dlt.balanceOf(uniswapUser)).gt(lowerBound)).to.be.true;

        // withdraw remaining liquidity
        f = router.methods.removeLiquidityETH(this.dlt.address, await lp.methods.balanceOf(uniswapUser).call(), 1, 1, uniswapUser, deadline);
        await sendFunction(routerAddress, 0, f, uniswapUserKey);
        expect(parseInt(await lp.methods.balanceOf(uniswapUser).call())).to.equal(0);
        lowerBound = new BN(userBalance).mul(new BN(89)).div(new BN(100));
        upperBound = new BN(userBalance).mul(new BN(91)).div(new BN(100));
        expect((await this.dlt.balanceOf(uniswapUser)).gt(lowerBound)).to.be.true;
        expect((await this.dlt.balanceOf(uniswapUser)).lt(upperBound)).to.be.true;

        // owner withdraw all liquidity
        lpBalance = await lp.methods.balanceOf(owner).call();
        f = lp.methods.approve(routerAddress, lpBalance);
        await sendFunction(lpAddress, 0, f, ownerKey);
        f = router.methods.removeLiquidityETH(this.dlt.address, lpBalance, 1, 1, owner, deadline);
        await sendFunction(routerAddress, 0, f, ownerKey);
        expect((await this.dlt.timeTillLocked(owner)).toNumber()).to.equal(lockTimerInSeconds);
        expect(parseInt(await lp.methods.balanceOf(owner).call())).to.equal(0);
        console.log((await this.dlt.balanceOf(owner)).toString());
        console.log((await this.dlt.balanceOf(uniswapUser)).toString());
        console.log((await this.dlt.balanceOf(dev)).toString());
        console.log((await this.dlt.balanceOf(reward)).toString());
        console.log((await this.dlt.totalSupply()).toString());
    });
});
