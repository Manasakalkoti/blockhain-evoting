// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * EVoting — Phase 1 election contract.
 *
 * Security model (per Implementation Guide corrections):
 *   - Merkle leaf is derived from msg.sender on-chain, NOT submitted by the caller.
 *     This prevents any account from claiming another voter's leaf.
 *   - hasVoted mapping keys on msg.sender (address), not a submitted leaf.
 *   - Double-vote prevention is enforced by the contract; the backend check is UX-only.
 *
 * Election types:
 *   - Private: eligibilityRoot != 0 → Merkle proof required.
 *   - Public:  eligibilityRoot == 0 → geographic check was done off-chain; no proof needed.
 */
contract EVoting {
    // ── State ──────────────────────────────────────────────────────────────────

    address public admin;           // backend platform wallet that deployed this
    bytes32 public eligibilityRoot; // Merkle root of authorized wallet addresses
    uint256 public startTime;       // UNIX timestamp
    uint256 public endTime;         // UNIX timestamp
    bool    public ended;           // set by endElection()

    /// candidateId → vote count
    mapping(uint256 => uint256) public voteCounts;

    /// wallet address → has already voted (authoritative double-vote guard)
    mapping(address => bool) public hasVoted;

    uint256[] public candidateIds;

    // ── Events ─────────────────────────────────────────────────────────────────

    event VoteCast(address indexed voter, uint256 indexed candidateId, uint256 timestamp);
    event ElectionEnded(uint256 endedAt);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(
        uint256[] memory _candidateIds,
        uint256 _startTime,
        uint256 _endTime,
        bytes32 _eligibilityRoot
    ) {
        require(_endTime > _startTime, "end must be after start");
        require(_candidateIds.length > 0, "need at least one candidate");

        admin            = msg.sender;
        candidateIds     = _candidateIds;
        startTime        = _startTime;
        endTime          = _endTime;
        eligibilityRoot  = _eligibilityRoot;
    }

    // ── Vote ───────────────────────────────────────────────────────────────────

    /**
     * @param candidateId  Must exist in candidateIds array.
     * @param merkleProof  Sibling hashes from leaf → root.
     *                     Pass an empty array [] for public elections (root == 0).
     *
     * CRITICAL: The leaf is derived from msg.sender on-chain.
     * The voter cannot claim another address's eligibility.
     */
    function castVote(
        uint256 candidateId,
        bytes32[] calldata merkleProof
    ) external {
        require(!ended,                       "Election has ended");
        require(block.timestamp >= startTime, "Election not started");
        require(block.timestamp <= endTime,   "Election time expired");
        require(!hasVoted[msg.sender],        "Already voted");
        require(_validCandidate(candidateId), "Invalid candidate");

        // Private election: verify Merkle proof against root.
        // Public election: root == 0, skip proof (geographic check was off-chain).
        if (eligibilityRoot != bytes32(0)) {
            require(
                _verifyMerkle(msg.sender, merkleProof),
                "Not eligible to vote"
            );
        }

        hasVoted[msg.sender]    = true;
        voteCounts[candidateId] += 1;

        emit VoteCast(msg.sender, candidateId, block.timestamp);
    }

    // ── End ────────────────────────────────────────────────────────────────────

    function endElection() external {
        require(msg.sender == admin, "Only admin");
        require(!ended,              "Already ended");
        ended = true;
        emit ElectionEnded(block.timestamp);
    }

    // ── Results (view — free, no gas) ──────────────────────────────────────────

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

    // ── Internal helpers ───────────────────────────────────────────────────────

    function _validCandidate(uint256 id) internal view returns (bool) {
        for (uint256 i = 0; i < candidateIds.length; i++) {
            if (candidateIds[i] == id) return true;
        }
        return false;
    }

    /**
     * OpenZeppelin-compatible sorted-pair Merkle verification.
     * Leaf is computed from the caller's address (abi.encodePacked = 20 bytes).
     * Must match the Python build_merkle_tree() in merkle_jobs.py.
     */
    function _verifyMerkle(
        address voter,
        bytes32[] calldata proof
    ) internal view returns (bool) {
        bytes32 hash = keccak256(abi.encodePacked(voter));
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            hash = hash <= p
                ? keccak256(abi.encodePacked(hash, p))
                : keccak256(abi.encodePacked(p, hash));
        }
        return hash == eligibilityRoot;
    }
}
