// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * EVoting — private election contract using Merkle-proof voter eligibility.
 *
 * Flow:
 *   1. Admin deploys with merkleRoot, candidate IDs, start/end timestamps.
 *   2. Eligible voter proves membership via Merkle proof → castVote().
 *   3. Admin (or automated job) calls endElection() after end_time.
 */
contract EVoting {
    // ── State ────────────────────────────────────────────────────────────────

    address public admin;
    bytes32 public merkleRoot;
    uint256 public startTime;
    uint256 public endTime;
    bool    public ended;

    /// candidateId (1-based index) → vote count
    mapping(uint256 => uint256) public voteCounts;

    /// keccak256 leaf → already voted?  prevents double-voting
    mapping(bytes32 => bool) public hasVoted;

    uint256[] public candidateIds;

    // ── Events ────────────────────────────────────────────────────────────────

    event VoteCast(bytes32 indexed leaf, uint256 indexed candidateId);
    event ElectionEnded(uint256 endedAt);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        bytes32 _merkleRoot,
        uint256[] memory _candidateIds,
        uint256 _startTime,
        uint256 _endTime
    ) {
        require(_endTime > _startTime, "end must be after start");
        require(_candidateIds.length > 0, "need at least one candidate");

        admin        = msg.sender;
        merkleRoot   = _merkleRoot;
        candidateIds = _candidateIds;
        startTime    = _startTime;
        endTime      = _endTime;
    }

    // ── Vote ──────────────────────────────────────────────────────────────────

    /**
     * @param candidateId   Must be in candidateIds array.
     * @param merkleProof   Sibling hashes from leaf → root.
     * @param leaf          keccak256(abi.encodePacked(voterIdentifier))
     *                      computed off-chain; voter submits their own leaf.
     */
    function castVote(
        uint256 candidateId,
        bytes32[] calldata merkleProof,
        bytes32 leaf
    ) external {
        require(!ended,                          "Election has ended");
        require(block.timestamp >= startTime,    "Election not started");
        require(block.timestamp <= endTime,      "Election time expired");
        require(!hasVoted[leaf],                 "Already voted");
        require(_validCandidate(candidateId),    "Invalid candidate");
        require(_verify(merkleProof, merkleRoot, leaf), "Not eligible");

        hasVoted[leaf] = true;
        voteCounts[candidateId]++;

        emit VoteCast(leaf, candidateId);
    }

    // ── End ───────────────────────────────────────────────────────────────────

    function endElection() external {
        require(msg.sender == admin, "Only admin");
        require(!ended,              "Already ended");

        ended = true;
        emit ElectionEnded(block.timestamp);
    }

    // ── Results ───────────────────────────────────────────────────────────────

    function getResults() external view returns (
        uint256[] memory ids,
        uint256[] memory counts
    ) {
        ids    = candidateIds;
        counts = new uint256[](candidateIds.length);
        for (uint256 i = 0; i < candidateIds.length; i++) {
            counts[i] = voteCounts[candidateIds[i]];
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _validCandidate(uint256 id) internal view returns (bool) {
        for (uint256 i = 0; i < candidateIds.length; i++) {
            if (candidateIds[i] == id) return true;
        }
        return false;
    }

    /**
     * OpenZeppelin-compatible sorted-pair Merkle verification.
     * Must match the Python _build_merkle_root() in merkle_jobs.py.
     */
    function _verify(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 hash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            hash = hash <= p
                ? keccak256(abi.encodePacked(hash, p))
                : keccak256(abi.encodePacked(p, hash));
        }
        return hash == root;
    }
}
