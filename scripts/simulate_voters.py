#!/usr/bin/env python3
"""
Voter Simulation Script — JIT (Just-in-Time) headless voting
Based on: "High-Volume Voter Simulation Using Scripted Wallet Generation"

Simulates large numbers of voters for BOTH private (CSV-based) and
public (geo-based) elections without any browser or MetaMask interaction.
Each voter gets a freshly generated wallet, signs the transaction directly,
and casts their vote against the Hardhat local node.

─────────────────────────────────────────────────────────────────
USAGE
─────────────────────────────────────────────────────────────────

  # Private election — 200 voters from uploaded CSV:
  python scripts/simulate_voters.py private \\
      --election-id <uuid> \\
      --voter-csv path/to/voters.csv \\
      --count 200

  # Public election — 500 voters spread across eligible locations:
  python scripts/simulate_voters.py public \\
      --election-id <uuid> \\
      --count 500

  # List all active/scheduled elections (to find election IDs):
  python scripts/simulate_voters.py list

─────────────────────────────────────────────────────────────────
REQUIREMENTS
─────────────────────────────────────────────────────────────────
  pip install web3 eth-abi requests
  Hardhat node must be running: cd contracts && npx hardhat node
  Flask backend must be running: cd backend && python run.py
─────────────────────────────────────────────────────────────────
"""

import argparse
import csv
import json
import os
import random
import sys
import time

import requests
from eth_abi import encode as abi_encode
from eth_account import Account
from web3 import Web3

# ── Configuration ──────────────────────────────────────────────────────────────
BACKEND_URL = "http://127.0.0.1:5001"
RPC_URL     = "http://127.0.0.1:8545"

# Hardhat Account #0 — used to fund voter wallets with gas ETH
FUNDER_KEY  = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
FUND_AMOUNT = Web3.to_wei(0.05, "ether")   # 0.05 ETH per voter (covers gas easily)

SIM_PASSWORD = "Sim_Pass_123!"

# castVote(uint256,bytes32[]) — first 4 bytes of keccak256
_SELECTOR = Web3.keccak(text="castVote(uint256,bytes32[])")[:4]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _encode_cast_vote(candidate_id: int) -> str:
    """ABI-encode castVote call with empty Merkle proof (zero-root elections)."""
    args = abi_encode(["uint256", "bytes32[]"], [candidate_id, []])
    return "0x" + _SELECTOR.hex() + args.hex()


def _col(text, code):
    return f"\033[{code}m{text}\033[0m"

def ok(msg):    print(_col(f"  ✓ {msg}", "32"))
def fail(msg):  print(_col(f"  ✗ {msg}", "31"))
def info(msg):  print(f"  → {msg}")


# ── Simulator class ─────────────────────────────────────────────────────────────

class VoterSimulator:

    def __init__(self, election_id: str, count: int):
        self.election_id = election_id
        self.count       = count
        self.results     = {"success": 0, "failed": 0}

        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not self.w3.is_connected():
            print(f"\nERROR: Cannot connect to Hardhat at {RPC_URL}")
            print("Run:  cd contracts && npx hardhat node\n")
            sys.exit(1)

        self.funder = self.w3.eth.account.from_key(FUNDER_KEY)
        # Track funder nonce manually to avoid conflicts on rapid sends
        self._funder_nonce = self.w3.eth.get_transaction_count(self.funder.address)
        self._admin_token  = None

    # ── Backend API wrappers ──────────────────────────────────────────────────

    def _api(self, method: str, path: str, token: str = None, **kwargs):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        resp = getattr(requests, method)(
            f"{BACKEND_URL}{path}", headers=headers, timeout=20, **kwargs
        )
        return resp

    def _get_admin_token(self) -> str:
        if self._admin_token:
            return self._admin_token
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@evoting.com")
        admin_pass  = os.environ.get("ADMIN_PASSWORD", "admin123")
        login = requests.post(f"{BACKEND_URL}/api/auth/admin/login",
                              json={"email": admin_email, "password": admin_pass},
                              timeout=10)
        if login.status_code != 200:
            print(f"\nERROR: Admin login failed ({login.text[:100]})")
            print("Set ADMIN_EMAIL / ADMIN_PASSWORD env vars.")
            sys.exit(1)
        self._admin_token = login.json()["token"]
        return self._admin_token

    def get_election(self) -> dict:
        token = self._get_admin_token()
        resp  = self._api("get", f"/api/elections/{self.election_id}", token=token)
        if resp.status_code != 200:
            print(f"\nERROR: Election {self.election_id} not found — {resp.text}")
            sys.exit(1)
        return resp.json()["election"]

    def get_all_elections(self) -> dict:
        token = self._get_admin_token()
        resp  = self._api("get", "/api/elections", token=token)
        if resp.status_code != 200:
            return {}
        return resp.json()

    def register_voter(self, idx: int) -> tuple:
        """Create a test voter account, return (jwt_token, user_id)."""
        ts    = int(time.time() * 1000) % 1_000_000
        email = f"simvoter_{self.election_id[:8]}_{idx}_{ts}@test.sim"
        resp  = self._api("post", "/api/auth/register", json={
            "full_name": f"Sim Voter {idx}",
            "email":     email,
            "password":  SIM_PASSWORD,
        })
        if resp.status_code == 409:
            resp = self._api("post", "/api/auth/login",
                             json={"email": email, "password": SIM_PASSWORD})
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"register/login failed: {resp.text[:120]}")
        d = resp.json()
        return d["token"], d["user"]["user_id"]

    def link_wallet(self, token: str, wallet_address: str):
        resp = self._api("put", "/api/auth/wallet", token=token,
                         json={"wallet_address": wallet_address})
        if resp.status_code not in (200, 409):
            raise RuntimeError(f"wallet link failed: {resp.text[:120]}")

    def verify_private(self, token: str, voter_id: str):
        resp = self._api("post",
                         f"/api/voter/elections/{self.election_id}/verify",
                         token=token, json={"voter_id": voter_id})
        if resp.status_code != 200:
            msg = resp.json().get("message", resp.text)
            raise RuntimeError(f"verification failed: {msg}")

    def verify_public(self, token: str, city: str, pincode: str):
        resp = self._api("post",
                         f"/api/voter/elections/{self.election_id}/verify",
                         token=token, json={"city": city, "pincode": pincode})
        if resp.status_code != 200:
            msg = resp.json().get("message", resp.text)
            raise RuntimeError(f"verification failed: {msg}")

    def confirm_vote(self, token: str, tx_hash: str,
                     candidate_id: int, wallet_address: str):
        resp = self._api("post", "/api/votes/confirm", token=token, json={
            "election_id":  self.election_id,
            "tx_hash":      tx_hash,
            "candidate_id": candidate_id,
            "wallet_address": wallet_address.lower(),
        })
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"confirm failed: {resp.text[:120]}")

    # ── Blockchain helpers ────────────────────────────────────────────────────

    def fund_wallet(self, address: str):
        """Send gas ETH from Hardhat funder to a voter wallet."""
        tx = {
            "from":     self.funder.address,
            "to":       Web3.to_checksum_address(address),
            "value":    FUND_AMOUNT,
            "gas":      21_000,
            "gasPrice": self.w3.eth.gas_price,
            "nonce":    self._funder_nonce,
            "chainId":  self.w3.eth.chain_id,
        }
        signed   = self.funder.sign_transaction(tx)
        tx_hash  = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=15)
        self._funder_nonce += 1

    def cast_vote_on_chain(self, private_key: str,
                           contract_address: str, candidate_id: int) -> str:
        """Sign and send castVote directly to the Hardhat node. Returns tx hash."""
        acct     = self.w3.eth.account.from_key(private_key)
        calldata = _encode_cast_vote(candidate_id)
        tx = {
            "from":     acct.address,
            "to":       Web3.to_checksum_address(contract_address),
            "data":     calldata,
            "gas":      350_000,
            "gasPrice": self.w3.eth.gas_price,
            "nonce":    self.w3.eth.get_transaction_count(acct.address),
            "chainId":  self.w3.eth.chain_id,
        }
        signed  = acct.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        if receipt["status"] != 1:
            raise RuntimeError("on-chain transaction reverted")
        return "0x" + tx_hash.hex()

    # ── Simulation runners ────────────────────────────────────────────────────

    def run_private(self, voter_ids: list):
        """
        Private election simulation.
        Each voter_id maps to one simulated voter with a fresh wallet.
        """
        election = self.get_election()
        contract = election.get("contract_address")
        if not contract:
            print("\nERROR: No contract address — Lock & Deploy the election first.\n")
            sys.exit(1)

        candidates = [c["candidate_position"] for c in election.get("candidates", [])]
        if not candidates:
            print("\nERROR: No candidates found for this election.\n")
            sys.exit(1)

        actual = min(self.count, len(voter_ids))
        print(f"\n{'═'*58}")
        print(f"  PRIVATE ELECTION SIMULATION")
        print(f"  Election : {election['title']}")
        print(f"  Status   : {election['status']}")
        print(f"  Contract : {contract}")
        print(f"  Voters   : {actual}  (of {len(voter_ids)} available IDs)")
        print(f"  Candidates: {candidates}")
        print(f"{'═'*58}")

        for i, voter_id in enumerate(voter_ids[:actual], 1):
            print(f"\n[{i:>3}/{actual}] voter_id={voter_id}")
            try:
                acct = Account.create()
                info(f"wallet generated: {acct.address}")

                token, _ = self.register_voter(i)
                info("user registered")

                self.link_wallet(token, acct.address)
                info("wallet linked to profile")

                self.fund_wallet(acct.address)
                info("wallet funded with gas ETH")

                self.verify_private(token, voter_id)
                info("eligibility verified")

                candidate_id = random.choice(candidates)
                tx_hash = self.cast_vote_on_chain(acct.key.hex(), contract, candidate_id)
                info(f"vote cast on-chain → tx {tx_hash[:18]}…")

                self.confirm_vote(token, tx_hash, candidate_id, acct.address)
                ok(f"DONE — candidate {candidate_id}")
                self.results["success"] += 1

            except RuntimeError as e:
                fail(str(e))
                self.results["failed"] += 1

            time.sleep(0.05)  # brief pause to avoid nonce collisions

        self._print_summary()

    def run_public(self, locations: list):
        """
        Public election simulation.
        Cycles through eligible city/pincode combinations.
        """
        election = self.get_election()
        contract = election.get("contract_address")
        if not contract:
            print("\nERROR: No contract address — Lock & Deploy the election first.\n")
            sys.exit(1)

        candidates = [c["candidate_position"] for c in election.get("candidates", [])]
        if not candidates:
            print("\nERROR: No candidates found for this election.\n")
            sys.exit(1)

        print(f"\n{'═'*58}")
        print(f"  PUBLIC ELECTION SIMULATION")
        print(f"  Election : {election['title']}")
        print(f"  Status   : {election['status']}")
        print(f"  Contract : {contract}")
        print(f"  Voters   : {self.count}")
        print(f"  Locations: {len(locations)} eligible zones (cycling)")
        print(f"  Candidates: {candidates}")
        print(f"{'═'*58}")

        for i in range(1, self.count + 1):
            loc    = locations[(i - 1) % len(locations)]
            city   = loc.get("city", "")
            pincode = loc.get("pincode", "")
            label  = city or pincode
            print(f"\n[{i:>3}/{self.count}] location={label}")
            try:
                acct = Account.create()
                info(f"wallet generated: {acct.address}")

                token, _ = self.register_voter(i)
                info("user registered")

                self.link_wallet(token, acct.address)
                info("wallet linked to profile")

                self.fund_wallet(acct.address)
                info("wallet funded with gas ETH")

                self.verify_public(token, city, pincode)
                info("geo eligibility verified")

                candidate_id = random.choice(candidates)
                tx_hash = self.cast_vote_on_chain(acct.key.hex(), contract, candidate_id)
                info(f"vote cast on-chain → tx {tx_hash[:18]}…")

                self.confirm_vote(token, tx_hash, candidate_id, acct.address)
                ok(f"DONE — candidate {candidate_id}")
                self.results["success"] += 1

            except RuntimeError as e:
                fail(str(e))
                self.results["failed"] += 1

            time.sleep(0.05)

        self._print_summary()

    def _print_summary(self):
        total = sum(self.results.values())
        pct   = (self.results["success"] / total * 100) if total else 0
        print(f"\n{'═'*58}")
        print(f"  SIMULATION COMPLETE")
        print(f"  Total   : {total}")
        print(_col(f"  Success : {self.results['success']} ({pct:.1f}%)", "32"))
        print(_col(f"  Failed  : {self.results['failed']}", "31" if self.results["failed"] else "0"))
        print(f"{'═'*58}\n")


# ── list command ────────────────────────────────────────────────────────────────

def cmd_list():
    """List all elections using admin credentials."""
    try:
        requests.get(f"{BACKEND_URL}/api/health", timeout=5)
    except Exception:
        print("ERROR: Could not reach backend. Is Flask running?")
        sys.exit(1)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@evoting.com")
    admin_pass  = os.environ.get("ADMIN_PASSWORD", "admin123")
    login = requests.post(f"{BACKEND_URL}/api/auth/admin/login",
                          json={"email": admin_email, "password": admin_pass},
                          timeout=10)
    if login.status_code != 200:
        print(f"ERROR: Admin login failed ({login.text[:100]})")
        print("Set ADMIN_EMAIL / ADMIN_PASSWORD env vars to match your admin account.")
        sys.exit(1)

    token = login.json()["token"]
    resp  = requests.get(f"{BACKEND_URL}/api/elections",
                         headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code != 200:
        print(f"ERROR: Could not fetch elections: {resp.text}")
        sys.exit(1)

    elections = resp.json().get("elections", [])
    if not elections:
        print("No elections found.")
        return

    print(f"\n{'─'*72}")
    print(f"  {'ELECTION ID':<38}  {'TYPE':<10}  {'STATUS':<12}  TITLE")
    print(f"{'─'*72}")
    for e in elections:
        etype = f"[{e['visibility_type']}]"
        print(f"  {e['election_id']}  {etype:<10}  {e['status']:<12}  {e['title']}")
    print()


# ── CLI ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Headless voter simulation for blockchain e-voting",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # list
    sub.add_parser("list", help="List all elections with their IDs")

    # private
    p_priv = sub.add_parser("private", help="Simulate a private (CSV-based) election")
    p_priv.add_argument("--election-id", required=True, help="Election UUID")
    p_priv.add_argument("--voter-csv",   required=True,
                        help="CSV file with voter IDs (same file uploaded to the election). "
                             "Must have a column named 'voter_id', 'id', or 'student_id'.")
    p_priv.add_argument("--count", type=int, default=200,
                        help="Number of voters to simulate (default: 200)")
    p_priv.add_argument("--id-column", default=None,
                        help="CSV column name containing the voter ID (auto-detected if omitted)")

    # public
    p_pub = sub.add_parser("public", help="Simulate a public (geo-based) election")
    p_pub.add_argument("--election-id", required=True, help="Election UUID")
    p_pub.add_argument("--count", type=int, default=500,
                       help="Number of voters to simulate (default: 500)")
    p_pub.add_argument("--city",    nargs="+", default=[],
                       help="One or more eligible city names (space-separated). "
                            "Auto-read from election rules if omitted.")
    p_pub.add_argument("--pincode", nargs="+", default=[],
                       help="One or more eligible pincodes. "
                            "Auto-read from election rules if omitted.")

    args = parser.parse_args()

    if args.cmd == "list":
        cmd_list()
        return

    # ── Private ──────────────────────────────────────────────────────────────
    if args.cmd == "private":
        voter_ids = []
        try:
            with open(args.voter_csv, newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                headers = reader.fieldnames or []

                # Auto-detect the ID column
                col = args.id_column
                if col is None:
                    for candidate_col in ("voter_id", "id", "student_id",
                                         "employee_id", "voter_identifier"):
                        if candidate_col in headers:
                            col = candidate_col
                            break
                if col is None and headers:
                    col = headers[0]  # fallback: use first column
                    print(f"  Note: auto-using first CSV column '{col}' as voter ID")

                for row in reader:
                    vid = (row.get(col) or "").strip()
                    if vid:
                        voter_ids.append(vid)
        except FileNotFoundError:
            print(f"ERROR: CSV file not found: {args.voter_csv}")
            sys.exit(1)

        if not voter_ids:
            print("ERROR: No voter IDs found in CSV")
            sys.exit(1)

        print(f"Loaded {len(voter_ids)} voter IDs from {args.voter_csv}")
        sim = VoterSimulator(args.election_id, args.count)
        sim.run_private(voter_ids)

    # ── Public ───────────────────────────────────────────────────────────────
    elif args.cmd == "public":
        sim = VoterSimulator(args.election_id, args.count)

        # Build location list
        locations = []

        # From CLI args
        for city in args.city:
            locations.append({"city": city, "pincode": ""})
        for pincode in args.pincode:
            locations.append({"city": "", "pincode": pincode})

        # Auto-read from election location_rules if none provided
        if not locations:
            election = sim.get_election()
            rules    = election.get("location_rules") or {}
            for city in rules.get("districts", []) + rules.get("wards", []):
                locations.append({"city": city, "pincode": ""})
            for pincode in rules.get("pincodes", []):
                locations.append({"city": "", "pincode": pincode})

        if not locations:
            print("ERROR: No eligible locations found.")
            print("       Either pass --city / --pincode, or check the election's location rules.")
            sys.exit(1)

        print(f"Using {len(locations)} eligible location(s): "
              f"{[l['city'] or l['pincode'] for l in locations[:5]]}"
              f"{'…' if len(locations) > 5 else ''}")

        sim.run_public(locations)


if __name__ == "__main__":
    main()
