#!/usr/bin/env python3
"""Frozen baseline accounting; source discovery is not semantic equivalence."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(__file__).with_name('inventory.json')
STATES = {'unreviewed', 'missing', 'failing', 'passing', 'excluded'}


def inspect(data):
    errors, backlog = [], []
    baseline = data['baseline']
    if len(baseline) != len(set(baseline)):
        errors.append('duplicate baseline source')
    accounted = set(data['sourceReviews'])
    for path, review in data['sourceReviews'].items():
        if path not in baseline or not review:
            errors.append(f'{path}: source review needs baseline reference and complete assertion review')
    ids = [row['id'] for row in data['behaviors']]
    if len(ids) != len(set(ids)):
        errors.append('duplicate behavior id')
    for row in data['behaviors']:
        name = row['id']
        state = row['status']
        if state not in STATES:
            errors.append(f'{name}: invalid status')
        if not row['web'] or not row['behavior']:
            errors.append(f'{name}: needs behavior and web reference')
        for ref in row['web'] + row['native']:
            if not (ROOT / ref.split('#')[0]).is_file():
                errors.append(f'{name}: missing reference {ref}')
        if state == 'excluded' and not row.get('review'):
            errors.append(f'{name}: exclusion requires reviewer')
        if state == 'excluded' and not row.get('reason'):
            errors.append(f'{name}: exclusion requires a reviewed reason')
        if state == 'passing' and (not row['native'] or not row.get('evidence') or not row.get('review')):
            errors.append(f'{name}: passing requires native assertions, run evidence and equivalence review')
        if state not in {'passing', 'excluded'}:
            backlog.append(f'{state}: {name}: {row["behavior"]}')
    mapped = {ref.split('#')[0] for row in data['behaviors'] for ref in row['web']}
    for path in accounted - mapped:
        errors.append(f'{path}: reviewed source has no behavior accounting')
    for path in baseline:
        if path not in accounted:
            backlog.append(f'unreviewed-source: {path}')
    for requirement in ['visual', 'signedIn', 'strict', 'fullReview']:
        gate = data['gates'][requirement]
        if gate['status'] != 'passing' or not gate.get('evidence'):
            backlog.append(f'gate: {requirement}: {gate["status"]}')
    return errors, backlog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['report', 'gate', 'check'])
    args = parser.parse_args()
    data = json.loads(DATA.read_text())
    errors, backlog = inspect(data)
    for error in errors:
        print(f'ERROR: {error}')
    print(f'Baseline {data["baselineCommit"]}: {len(data["baseline"])} source files, not test or parity counts')
    print(f'{len(backlog)} unresolved items')
    if args.command == 'report':
        print('\n'.join(backlog))
    print('PARITY: INCOMPLETE' if errors or backlog else 'PARITY: PASS')
    return 1 if errors or (args.command == 'gate' and backlog) else 0


if __name__ == '__main__':
    raise SystemExit(main())
