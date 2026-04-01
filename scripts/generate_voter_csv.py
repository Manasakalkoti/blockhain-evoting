#!/usr/bin/env python3
"""
Generate a large CSV of fake voter IDs for simulation testing.

Usage:
  python scripts/generate_voter_csv.py --count 200 --output voters_200.csv
  python scripts/generate_voter_csv.py --count 500 --output voters_500.csv
"""

import argparse
import csv
import random
import string


def generate_voter_ids(count: int) -> list:
    """
    Generate unique voter IDs in college roll-number format.
    Example: 1RV21CS042, 1RV22ME011, etc.
    """
    departments = ["CS", "ME", "EC", "EE", "CV", "IS", "BT", "CH", "IM", "AT"]
    years       = ["21", "22", "23", "24"]
    used        = set()
    ids         = []

    while len(ids) < count:
        year  = random.choice(years)
        dept  = random.choice(departments)
        num   = random.randint(1, 99)
        vid   = f"1RV{year}{dept}{num:03d}"
        if vid not in used:
            used.add(vid)
            ids.append(vid)

    return ids


def main():
    parser = argparse.ArgumentParser(description="Generate voter ID CSV for simulation")
    parser.add_argument("--count",  type=int, default=200, help="Number of voter IDs (default: 200)")
    parser.add_argument("--output", default="voters_200.csv", help="Output CSV filename")
    args = parser.parse_args()

    ids = generate_voter_ids(args.count)

    with open(args.output, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["voter_id"])
        for vid in ids:
            writer.writerow([vid])

    print(f"Generated {args.count} voter IDs → {args.output}")
    print(f"First 5: {ids[:5]}")
    print(f"\nNext steps:")
    print(f"  1. Go to Admin panel → open the private election → upload {args.output} as voter CSV")
    print(f"  2. Then run the simulation:")
    print(f"     ADMIN_EMAIL=abc@gmail.com ADMIN_PASSWORD=123456 python scripts/simulate_voters.py private \\")
    print(f"       --election-id <election-uuid> \\")
    print(f"       --voter-csv {args.output} \\")
    print(f"       --count {args.count}")


if __name__ == "__main__":
    main()
