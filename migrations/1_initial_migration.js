const DeflationLabsToken = artifacts.require("DeflationLabsToken");

module.exports = async function (deployer) {
    deployer.deploy(DeflationLabsToken);
    const dlt = await DeflationLabsToken.deployed();
};
