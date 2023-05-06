// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract DeflationLabsToken is ERC20, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    mapping(address => bool) public allowlist;  // TODO: Whitelist uniswap v2 pair
    mapping(address => uint256) private _lastTransferTimestamp;
    mapping(address => bool) public claimed;
    uint256 public devPercent = 2;
    uint256 public burnPercent = 5;
    uint256 public rewardPercent = 3;
    uint256 public burnedAmount = 0;
    address public devAddress = address(0);
    address public rewardAddress = address(0);
    uint256 public lockTimerInSeconds = 36 * 60 * 60; // after 36 hours the account will be blocked if there is no transfer
    bool public airdropActive = false;
    uint256 public airdropDeadline = 0;
    uint256 public constant airdropDuration = 72 * 60 * 60; // airdrop will last for 72 hours
    uint256 public baseAirdropAmount = 1000;
    bytes32 public merkleRoot;

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant uniswapV2Factory = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant uniswapV2Router = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public uniswapV2Pair = address(0);
    constructor() ERC20("DeflationLabsToken", "DLT") {
        _mint(address(this), 100000000); // community airdrop
        _mint(msg.sender, 100000000); // initial liquidity
        (address token0, address token1) = WETH < address(this) ? (WETH, address(this)) : (address(this), WETH);
        uniswapV2Pair = address(uint160(uint(keccak256(abi.encodePacked(
                hex'ff',
                uniswapV2Factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // init code hash
            )))));
        allowlist[uniswapV2Pair] = true;
        allowlist[uniswapV2Router] = true;
        allowlist[address(this)] = true;
    }

    function isBlocked(address account) public view returns (bool) {
        return timeTillBlocked(account) == 0 && !allowlist[account];
    }

    function airdropEligible(address account, bytes32[] calldata proof) public view returns (bool, uint256) {
        if (!airdropActive || block.timestamp > airdropDeadline) {
            return (false, 0);  // airdrop finished
        }
        bytes32 leaf = keccak256(abi.encodePacked(account));
        if (MerkleProof.verify(proof, merkleRoot, leaf)) {
            if (!claimed[account]) {
                return (true, _getDecayedAirdropAmount());
            } else {
                return (false, 0); // claimed
            }
        } else {
            return (false, 0);  // not eligible
        }
    }

    function timeTillBlocked(address account) public view returns (uint256) {
        if (_lastTransferTimestamp[account] == 0) {
            return type(uint256).max;   // not blocked
        }
        if (_lastTransferTimestamp[account] > 0 && block.timestamp >= _lastTransferTimestamp[account].add(lockTimerInSeconds)) {
            return 0;   // blocked
        }
        return _lastTransferTimestamp[account].add(lockTimerInSeconds).sub(block.timestamp);
    }

    function updatePercentage(uint256 dev, uint256 burn, uint256 reward) external onlyOwner {
        require(dev.add(burn).add(reward) <= 10, 'too greedy');
        devPercent = dev;
        burnPercent = burn;
        rewardPercent = reward;
    }

    function setDevAddress(address newAddress) external onlyOwner {
        require(newAddress != address(0), 'zero address');
        devAddress = newAddress;
    }

    function setRewardAddress(address newAddress) external onlyOwner {
        require(newAddress != address(0), 'zero address');
        rewardAddress = newAddress;
    }

    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        merkleRoot = newRoot;
    }

    function activateAirdrop() external onlyOwner {
        require(!airdropActive && airdropDeadline == 0, 'Airdrop has started before');
        airdropActive = true;
        airdropDeadline = airdropDuration.add(block.timestamp);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = msg.sender;
        require(!isBlocked(owner) && !isBlocked(to), 'Timeout, sender or receiver is blocked');
        (uint256 devAmount, uint256 burn, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
        _transfer(owner, devAddress, devAmount);
        _burn(owner, burn);
        _transfer(owner, rewardAddress, rewardAmount);
        _transfer(owner, to, transferAmount);
        if (_lastTransferTimestamp[owner] == 0) {
            _lastTransferTimestamp[owner] = block.timestamp;
        }
        if (balanceOf(owner) == 0) {
            _lastTransferTimestamp[owner] = 0;  // unblock wallet when it transfers out all token
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = msg.sender;
        require(!isBlocked(from) && !isBlocked(to), 'Timeout, sender or receiver is blocked');
        (uint256 devAmount, uint256 burnAmount, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
        _transfer(from, devAddress, devAmount);
        _burn(from, burnAmount);
        _transfer(from, rewardAddress, rewardAmount);
        _spendAllowance(from, spender, transferAmount);
        _transfer(from, to, transferAmount);
        if (_lastTransferTimestamp[from] == 0) {
            _lastTransferTimestamp[from] = block.timestamp;
        }
        if (balanceOf(from) == 0) {
            _lastTransferTimestamp[from] = 0;   // unblock wallet when it transfers out all token
        }
        return true;
    }

    function _calculateAmount(uint256 inputAmount) private view returns (uint256, uint256, uint256, uint256) {
        uint256 devAmount = inputAmount.mul(devPercent).div(100);
        uint256 burnAmount = inputAmount.mul(burnPercent).div(100);
        uint256 rewardAmount = inputAmount.mul(rewardPercent).div(100);
        uint256 transferAmount = inputAmount.sub(devAmount).sub(burnAmount).sub(rewardAmount);
        return (devAmount, burnAmount, rewardAmount, transferAmount);
    }

    function _getDecayedAirdropAmount() private view returns (uint256) {
        // TODO: add decay logic
        return baseAirdropAmount;
    }
}
