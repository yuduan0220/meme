const DeflationLabsToken = artifacts.require("DeflationLabsToken");

module.exports = function (deployer) {
    deployer.deploy(DeflationLabsToken);
};
