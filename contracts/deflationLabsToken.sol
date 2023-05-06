// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DeflationLabsToken is ERC20, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    // TODO: Whitelist uniswap v2 pair
    mapping(address => bool) public allowlist;
    mapping(address => uint256) private _lastTransferTimestamp;
    uint256 public devPercent = 2;
    uint256 public burnPercent = 5;
    uint256 public rewardPercent = 3;
    address public devAddress = address(0);
    address public rewardAddress = address(0);
    uint256 public lockTimerInSeconds = 36 * 60 * 60; // after 36 hours the account will be blocked if there is no transfer
    constructor() ERC20("DeflationLabsToken", "DLT") {
        _mint(address(this), 100000000);
        _mint(msg.sender, 100000000); // initial liquidity
    }

    modifier notBlocked() {
        require(timeTillBlocked(tx.origin) > 0 || allowlist[tx.origin], 'Timeout, blocked');
        _;
    }

    function isBlocked(address account) public view returns (bool) {
        return timeTillBlocked(account) == 0;
    }

    function timeTillBlocked(address account) public view returns (uint256) {
        if (_lastTransferTimestamp[account] == 0) {
            return type(uint256).max;   // no transfer history
        }
        if (_lastTransferTimestamp[account] > 0 && block.timestamp >= _lastTransferTimestamp[account].add(lockTimerInSeconds)) {
            return 0;   // blocked
        }
        return _lastTransferTimestamp[account].add(lockTimerInSeconds).sub(block.timestamp);
    }

    function updatePercentage(uint256 dev, uint256 burn, uint256 reward) public onlyOwner {
        require(dev.add(burn).add(reward) <= 10, 'too greedy');
        devPercent = dev;
        burnPercent = burn;
        rewardPercent = reward;
    }

    function setDevAddress(address newAddress) public onlyOwner {
        devAddress = newAddress;
    }

    function setRewardAddress(address newAddress) public onlyOwner {
        rewardAddress = newAddress;
    }

    function transfer(address to, uint256 amount) public override notBlocked returns (bool) {
        address owner = _msgSender();
        if (isBlocked(tx.origin)) {
            revert('Timeout, blocked');
        }
        (uint256 devAmount, uint256 burn, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
        _transfer(owner, devAddress, devAmount);
        _burn(owner, burn);
        _transfer(owner, rewardAddress, rewardAmount);
        _transfer(owner, to, transferAmount);
        _lastTransferTimestamp[owner] = block.timestamp;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override notBlocked returns (bool) {
        address spender = _msgSender();
        if (isBlocked(tx.origin)) {
            revert('Timeout, blocked');
        }
        (uint256 devAmount, uint256 burnAmount, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
        _transfer(from, devAddress, devAmount);
        _burn(from, burnAmount);
        _transfer(from, rewardAddress, rewardAmount);
        _spendAllowance(from, spender, transferAmount);
        _transfer(from, to, transferAmount);
        _lastTransferTimestamp[spender] = block.timestamp;
        return true;
    }

    function _calculateAmount(uint256 inputAmount) private view returns (uint256, uint256, uint256, uint256) {
        uint256 devAmount = inputAmount.mul(devPercent).div(100);
        uint256 burnAmount = inputAmount.mul(burnPercent).div(100);
        uint256 rewardAmount = inputAmount.mul(rewardPercent).div(100);
        uint256 transferAmount = inputAmount.sub(devAmount).sub(burnAmount).sub(rewardAmount);
        return (devAmount, burnAmount, rewardAmount, transferAmount);
    }
}
