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
    mapping(address => bool) public allowlist;
    mapping(address => uint256) private _transferDeadline;
    mapping(address => bool) public claimed;
    uint256 public devPercent = 2;
    uint256 public burnPercent = 5;
    uint256 public rewardPercent = 3;
    address public devAddress = address(0);
    address public rewardAddress = address(0);
    uint256 public constant lockTimerInSeconds = 36 * 60 * 60;  // after 36 hours the account will be locked if there is no transfer
    bool public airdropActive = false;
    uint256 public airdropDeadline = 0;
    uint256 public constant airdropDuration = 72 * 60 * 60;     // airdrop will last for 72 hours
    uint256 public baseAirdropAmount = 1000;
    bytes32 public merkleRoot;

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant uniswapV2Factory = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant uniswapV2Router = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public uniswapV2Pair = address(0);
    constructor() ERC20("GameOfDeflation", "GOD") {
        _mint(address(this), 100000000 * 1e18);    // community airdrop
        _mint(msg.sender, 100000000 * 1e18);       // initial liquidity
        (address token0, address token1) = WETH < address(this) ? (WETH, address(this)) : (address(this), WETH);
        uniswapV2Pair = address(uint160(uint(keccak256(abi.encodePacked(
                hex'ff',
                uniswapV2Factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
            )))));
        allowlist[uniswapV2Pair] = true;
        allowlist[uniswapV2Router] = true;
        allowlist[address(this)] = true;
    }

    function isLocked(address account) public view returns (bool) {
        return timeTillLocked(account) == 0 && !allowlist[account];
    }

    function airdropEligible(address account, bytes32[] calldata proof) public view returns (bool, uint256) {
        bytes32 leaf = keccak256(abi.encodePacked(account));
        if (MerkleProof.verify(proof, merkleRoot, leaf)) {
            if (!claimed[account]) {
                return (true, _getAirdropAmount());
            } else {
                return (false, 0);  // claimed
            }
        } else {
            return (false, 0);      // not eligible
        }
    }

    function timeTillLocked(address account) public view returns (uint256) {
        if (_transferDeadline[account] == 0) {
            return type(uint256).max;   // not locked
        }
        if (_transferDeadline[account] > 0 && block.timestamp >= _transferDeadline[account]) {
            return 0;                   // locked
        }
        return _transferDeadline[account].sub(block.timestamp);
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

    function setAirdropAmount(uint256 amount) external onlyOwner {
        baseAirdropAmount = amount;
    }

    function activateAirdrop() external onlyOwner {
        require(!airdropActive && airdropDeadline == 0, 'Airdrop has started before');
        airdropActive = true;
        airdropDeadline = airdropDuration.add(block.timestamp);
    }

    function claimAirdrop(bytes32[] calldata proof) external {
        require(airdropActive, 'airdrop not started');
        require(block.timestamp <= airdropDeadline, 'airdrop finished');
        require(!isLocked(msg.sender), 'user is locked');
        (bool eligible, uint256 amount) = airdropEligible(msg.sender, proof);
        require(eligible, 'not eligible');
        require(amount > 0, 'no token left');
        claimed[msg.sender] = true;
        {
        (uint256 devAmount, uint256 burnAmount, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
        _transfer(address(this), devAddress, devAmount);
        _burn(address(this), burnAmount);
        _transfer(address(this), rewardAddress, rewardAmount);
        _transfer(address(this), msg.sender, transferAmount);
        }
        if (_transferDeadline[msg.sender] == 0 && !allowlist[msg.sender]) {
            _transferDeadline[msg.sender] = lockTimerInSeconds.add(block.timestamp);
        }
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = msg.sender;
        require(!isLocked(owner) && !isLocked(to), 'sender or receiver is locked');
        if (to != uniswapV2Router) {
            (uint256 devAmount, uint256 burnAmount, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
            if (owner != devAddress) {
                _transfer(owner, devAddress, devAmount);
            } else {
                _burn(devAddress, devAmount);
            }
            _burn(owner, burnAmount);
            if (owner != rewardAddress) {
                _transfer(owner, rewardAddress, rewardAmount);
            } else {
                _burn(rewardAddress, rewardAmount);
            }
            _transfer(owner, to, transferAmount);
            if (_transferDeadline[to] == 0 && !allowlist[to]) {
                _transferDeadline[to] = lockTimerInSeconds.add(block.timestamp);
            }
        } else {
            _transfer(owner, to, amount);  // rmeove liquidity doesn't burn twice
        }

        if (balanceOf(owner) == 0) {
            _transferDeadline[owner] = 0;  // unlock wallet when it transfers out all token
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = msg.sender;
        require(!isLocked(from) && !isLocked(to), 'sender or receiver is locked');
        if (to != uniswapV2Pair) {
            (uint256 devAmount, uint256 burnAmount, uint256 rewardAmount, uint256 transferAmount) = _calculateAmount(amount);
            if (from != devAddress) {
                _transfer(from, devAddress, devAmount);
            } else {
                _burn(devAddress, devAmount);
            }
            _burn(from, burnAmount);
            if (from != rewardAddress) {
                _transfer(from, rewardAddress, rewardAmount);
            } else {
                _burn(rewardAddress, rewardAmount);
            }
            _spendAllowance(from, spender, amount);
            _transfer(from, to, transferAmount);
            if (_transferDeadline[to] == 0 && !allowlist[to]) {
                _transferDeadline[to] = lockTimerInSeconds.add(block.timestamp);
            }
        } else {
            _spendAllowance(from, spender, amount);
            _transfer(from, to, amount);
        }

        if (balanceOf(from) == 0) {
            _transferDeadline[from] = 0;   // unlock wallet when it transfers out all token
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

    function _getAirdropAmount() private view returns (uint256) {
        uint256 tokenLeft = balanceOf(address(this));
        return baseAirdropAmount > tokenLeft ? tokenLeft : baseAirdropAmount;
    }
}
