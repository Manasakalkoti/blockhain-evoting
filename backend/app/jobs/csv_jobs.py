"""
RQ job: parse voter CSV, keccak256-hash each ID, insert ElectionVoter rows.

Re-uploading replaces all existing voters for the constituency.
"""


def process_csv_upload(election_id: str, constituency_id: str, csv_content: str) -> dict:
    import csv
    import io
    from app import create_app, db
    from app.models.election_voter import ElectionVoter
    from web3 import Web3

    app = create_app()
    with app.app_context():
        # Replace any previous upload for this constituency
        ElectionVoter.query.filter_by(constituency_id=constituency_id).delete()
        db.session.commit()

        reader = csv.reader(io.StringIO(csv_content))
        voters = []
        seen: set[str] = set()

        SKIP_HEADERS = {"voter_id", "id", "identifier", "student_id", "roll_no", "usn"}

        for row in reader:
            if not row:
                continue
            raw_id = row[0].strip()
            if not raw_id:
                continue
            if raw_id.lower() in SKIP_HEADERS:
                continue  # skip header row
            if raw_id in seen:
                continue
            seen.add(raw_id)

            # keccak256(abi.encodePacked(raw_id)) — matches Solidity leaf hashing
            leaf_hash = Web3.keccak(text=raw_id).hex()

            voters.append(
                ElectionVoter(
                    constituency_id=constituency_id,
                    voter_identifier=raw_id,
                    hashed_identifier=leaf_hash,
                    authorization_status="authorized",
                )
            )

        db.session.bulk_save_objects(voters)
        db.session.commit()

        return {"count": len(voters), "election_id": election_id}
