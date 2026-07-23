/**
 * Hardhat deployment script for EVoting contract.
 *
 * 
 * 
 *
 * In production, this is called programmatically from the Python backend
 * via the deployElection RQ job using web3.py. This script is for manual
 * testing and demo deployments.
 */
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying EVoting contract with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await deployer.provider.getBalance(deployer.address)), 'ETH');

  // Example election parameters — replace with real values from DB
  const candidateIds = [1, 2, 3];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 60;           // starts in 1 minute
  const endTime   = now + 60 * 60 * 24; // ends in 24 hours
  const eligibilityRoot = ethers.ZeroHash; // 0x000...0 for public elections; set real Merkle root for private

  const EVoting = await ethers.getContractFactory('EVoting');
  const contract = await EVoting.deploy(
    candidateIds,
    startTime,
    endTime,
    eligibilityRoot
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log('\nEVoting contract deployed!');
  console.log('Contract address:', address);
  console.log('Candidate IDs:', candidateIds);
  console.log('Start time:', new Date(startTime * 1000).toISOString());
  console.log('End time:', new Date(endTime * 1000).toISOString());
  console.log('Eligibility root:', eligibilityRoot);
  console.log('\nUpdate backend/.env → EVOTING_CONTRACT_ADDRESS=' + address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
