#!/usr/bin/env python3
import argparse
import csv
import subprocess
import sys
import time

REGION = "us-east-1"
WORKGROUP = "primary"
OUTPUT = "s3://openalex-june-2026/athena-results/"


def aws_json(args):
    import json

    raw = subprocess.check_output(["aws", *args, "--region", REGION], text=True)
    return json.loads(raw)


def start_query(sql: str, database: str) -> str:
    resp = aws_json(
        [
            "athena",
            "start-query-execution",
            "--work-group",
            WORKGROUP,
            "--query-execution-context",
            f"Database={database}",
            "--result-configuration",
            f"OutputLocation={OUTPUT}",
            "--query-string",
            sql,
        ]
    )
    return resp["QueryExecutionId"]


def wait_query(query_id: str) -> dict:
    while True:
        resp = aws_json(["athena", "get-query-execution", "--query-execution-id", query_id])
        status = resp["QueryExecution"]["Status"]
        state = status["State"]
        if state in {"SUCCEEDED", "FAILED", "CANCELLED"}:
            if state != "SUCCEEDED":
                reason = status.get("StateChangeReason", "")
                raise RuntimeError(f"Athena query {query_id} {state}: {reason}")
            return resp["QueryExecution"]
        time.sleep(2)


def fetch_rows(query_id: str) -> list[list[str]]:
    rows = []
    token = None
    while True:
        args = ["athena", "get-query-results", "--query-execution-id", query_id]
        if token:
            args += ["--next-token", token]
        resp = aws_json(args)
        for row in resp["ResultSet"]["Rows"]:
            rows.append([cell.get("VarCharValue", "") for cell in row.get("Data", [])])
        token = resp.get("NextToken")
        if not token:
            return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="openalex_scratch")
    parser.add_argument("--sql-file", required=True)
    parser.add_argument("--csv-out")
    args = parser.parse_args()

    sql = open(args.sql_file, encoding="utf-8").read()
    query_id = start_query(sql, args.database)
    print(f"Started Athena query: {query_id}", flush=True)
    execution = wait_query(query_id)
    stats = execution.get("Statistics", {})
    scanned = int(stats.get("DataScannedInBytes", 0))
    elapsed_ms = int(stats.get("EngineExecutionTimeInMillis", 0))
    print(f"Succeeded. Scanned {scanned / 1024 ** 3:.2f} GiB; engine time {elapsed_ms / 1000:.1f}s")

    if args.csv_out:
        rows = fetch_rows(query_id)
        with open(args.csv_out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        print(f"Wrote {args.csv_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
