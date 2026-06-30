#!/usr/bin/env python3
import argparse
import subprocess
import time

from run_athena_query import REGION, start_query


def aws_json(args):
    import json

    raw = subprocess.check_output(["aws", *args, "--region", REGION], text=True)
    return json.loads(raw)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="openalex_scratch")
    parser.add_argument("--sql-file", required=True)
    parser.add_argument("--download-to", required=True)
    args = parser.parse_args()

    sql = open(args.sql_file, encoding="utf-8").read()
    query_id = start_query(sql, args.database)
    print(f"Started Athena query: {query_id}", flush=True)

    while True:
        execution = aws_json(["athena", "get-query-execution", "--query-execution-id", query_id])["QueryExecution"]
        state = execution["Status"]["State"]
        stats = execution.get("Statistics", {})
        scanned = int(stats.get("DataScannedInBytes", 0))
        print(f"{state}; scanned {scanned / 1024 ** 3:.2f} GiB", flush=True)
        if state in {"SUCCEEDED", "FAILED", "CANCELLED"}:
            if state != "SUCCEEDED":
                raise RuntimeError(execution["Status"].get("StateChangeReason", state))
            output = execution["ResultConfiguration"]["OutputLocation"]
            subprocess.check_call(["aws", "s3", "cp", output, args.download_to, "--region", REGION])
            print(f"Downloaded {output} to {args.download_to}")
            return 0
        time.sleep(30)


if __name__ == "__main__":
    raise SystemExit(main())
