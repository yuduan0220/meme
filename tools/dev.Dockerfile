FROM ubuntu:bionic

RUN apt-get update -y && apt-get install -y software-properties-common

RUN add-apt-repository ppa:ethereum/ethereum
RUN apt-get update -y
RUN apt-get install -y solc && apt-get clean

RUN apt-get install -y curl

RUN curl -sL https://deb.nodesource.com/setup_14.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt-get update -y && apt-get install -y nodejs build-essential
RUN node --version
RUN npm --version
RUN apt-get clean

RUN npm install -g npm@latest
RUN npm install -g truffle
RUN npm install -g @openzeppelin/test-environment @openzeppelin/test-helpers @openzeppelin/contracts mocha chai

ENTRYPOINT ["/bin/bash"]
