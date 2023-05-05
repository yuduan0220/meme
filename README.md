# Giantbot - meme

## Build development docker image:

    docker build -f tools/dev.Dockerfile -t solidity-dev:ubuntu-18.04 .

## Important tool versions in solidity-dev:ubuntu-18.04:
- node: 14.17.0
- npm: 7.15.0
- truffle: 5.3.8
- solc: 0.8.4

## Start docker container with volume mount:

    docker run -it -v $(pwd):/home/solc solidity-dev:ubuntu-18.04

## To compile and run test once you are in the container:

    cd /home/solc
    truffle compile
    npm install
    npm test

## How to install docker:
Please see https://docs.docker.com/docker-for-mac/install/ for how to install Docker Desktop on Mac.
