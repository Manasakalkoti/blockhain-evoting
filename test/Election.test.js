const { expect } = require('chai');
const { ethers } = require('hardhat');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');

describe('EVoting', function () {
  let contract, admin, voter1, voter2, nonVoter;
  let startTime, endTime;
  let tree, merkleRoot;

  beforeEach(async function () {
    [admin, voter1, voter2, nonVoter] = await ethers.getSigners();

    // Build Merkle tree from eligible voter addresses
    const leaves = [[voter1.address], [voter2.address]];
    tree = StandardMerkleTree.of(leaves, ['address']);
    merkleRoot = tree.root;

    const now = Math.floor(Date.now() / 1000);
    startTime = now - 10;      // started 10s ago
    endTime   = now + 3600;    // ends in 1 hour

    const EVoting = await ethers.getContractFactory('EVoting');
    contract = await EVoting.deploy(
      [1, 2],
      startTime,
      endTime,
      merkleRoot
    );
    await contract.waitForDeployment();
  });

  function getProof(address) {
    for (const [i, v] of tree.entries()) {
      if (v[0].toLowerCase() === address.toLowerCase()) {
        return tree.getProof(i);
      }
    }
    throw new Error('Address not in tree');
  }

  describe('Deployment', function () {
    it('sets admin to deployer', async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it('stores eligibility root', async function () {
      expect(await contract.eligibilityRoot()).to.equal(merkleRoot);
    });

    it('stores candidate IDs', async function () {
      expect(await contract.candidateIds(0)).to.equal(1n);
      expect(await contract.candidateIds(1)).to.equal(2n);
    });
  });

  describe('castVote', function () {
    it('allows eligible voter to vote', async function () {
      const proof = getProof(voter1.address);
      await expect(contract.connect(voter1).castVote(1, proof))
        .to.emit(contract, 'VoteCast')
        .withArgs(voter1.address, 1n, anyValue => true);

      expect(await contract.voteCounts(1)).to.equal(1n);
      expect(await contract.hasVoted(voter1.address)).to.be.true;
    });

    it('rejects double voting', async function () {
      const proof = getProof(voter1.address);
      await contract.connect(voter1).castVote(1, proof);
      await expect(
        contract.connect(voter1).castVote(2, proof)
      ).to.be.revertedWith('Already voted');
    });

    it('rejects ineligible voter (invalid Merkle proof)', async function () {
      const proof = getProof(voter1.address); // voter1's proof used by nonVoter
      await expect(
        contract.connect(nonVoter).castVote(1, proof)
      ).to.be.revertedWith('Not eligible to vote');
    });

    it('rejects invalid candidate', async function () {
      const proof = getProof(voter1.address);
      await expect(
        contract.connect(voter1).castVote(99, proof)
      ).to.be.revertedWith('Invalid candidate');
    });

    it('rejects after election ends', async function () {
      // End the election
      await contract.connect(admin).endElection();
      const proof = getProof(voter1.address);
      await expect(
        contract.connect(voter1).castVote(1, proof)
      ).to.be.revertedWith('Election has ended');
    });
  });

  describe('Public election (zero root)', function () {
    let publicContract;

    beforeEach(async function () {
      const now = Math.floor(Date.now() / 1000);
      const EVoting = await ethers.getContractFactory('EVoting');
      publicContract = await EVoting.deploy(
        [1, 2],
        now - 10,
        now + 3600,
        ethers.ZeroHash  // public election — no Merkle check
      );
      await publicContract.waitForDeployment();
    });

    it('allows any voter with empty proof', async function () {
      await expect(publicContract.connect(nonVoter).castVote(1, []))
        .to.emit(publicContract, 'VoteCast');
    });

    it('still prevents double voting', async function () {
      await publicContract.connect(nonVoter).castVote(1, []);
      await expect(
        publicContract.connect(nonVoter).castVote(2, [])
      ).to.be.revertedWith('Already voted');
    });
  });

  describe('getResults', function () {
    it('returns current vote counts', async function () {
      const p1 = getProof(voter1.address);
      const p2 = getProof(voter2.address);
      await contract.connect(voter1).castVote(1, p1);
      await contract.connect(voter2).castVote(1, p2);

      const [ids, counts] = await contract.getResults();
      expect(ids[0]).to.equal(1n);
      expect(counts[0]).to.equal(2n);
      expect(counts[1]).to.equal(0n);
    });
  });

  describe('endElection', function () {
    it('only admin can end', async function () {
      await expect(
        contract.connect(voter1).endElection()
      ).to.be.revertedWith('Only admin');
    });

    it('admin can end election', async function () {
      await expect(contract.connect(admin).endElection())
        .to.emit(contract, 'ElectionEnded');
      expect(await contract.ended()).to.be.true;
    });
  });
});
