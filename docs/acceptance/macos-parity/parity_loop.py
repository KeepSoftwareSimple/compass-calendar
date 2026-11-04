#!/usr/bin/env python3
"""Scoped macOS parity maintenance loop: queue, leases, merge ingestion."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent
INVENTORY = DATA_DIR / 'inventory.json'
STREAM = DATA_DIR / 'incremental-stream.json'
QUEUE = DATA_DIR / 'maintenance-queue.json'
STATE_MARKER = 'macos-parity-loop-state'
LEASE_TTL = timedelta(hours=3)
QUOTA_MARKER = 'macos-parity-quota-retry-at='

WEB_PRODUCT_PREFIXES = (
    'apps/calendar-web/src/',
    'apps/calendar-web/index.html',
)
WEB_E2E_PREFIX = 'e2e/'
NATIVE_PREFIXES = (
    'apps/calendar-macos/',
)
SHARED_PREFIXES = (
    'packages/core/',
)


@dataclass
class LoopState:
    leases: dict[str, dict[str, Any]]
    next_eligible_at: str | None
    dispatched_stable_keys: set[str]

    @classmethod
    def empty(cls) -> LoopState:
        return cls(leases={}, next_eligible_at=None, dispatched_stable_keys=set())

    def to_json(self) -> dict[str, Any]:
        return {
            'leases': self.leases,
            'nextEligibleAt': self.next_eligible_at,
            'dispatchedStableKeys': sorted(self.dispatched_stable_keys),
        }

    @classmethod
    def from_json(cls, raw: dict[str, Any]) -> LoopState:
        return cls(
            leases=dict(raw.get('leases') or {}),
            next_eligible_at=raw.get('nextEligibleAt'),
            dispatched_stable_keys=set(raw.get('dispatchedStableKeys') or []),
        )


def utc_now(iso: str | None = None) -> datetime:
    if iso:
        return datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return datetime.now(timezone.utc)


def parse_paths(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def classify_path(path: str) -> str:
    if path.startswith('docs/acceptance/macos-parity/'):
        return 'parity_accounting'
    if path.startswith(NATIVE_PREFIXES):
        return 'native_code'
    if path.startswith(SHARED_PREFIXES):
        return 'shared_contract'
    if path.startswith(WEB_E2E_PREFIX):
        return 'web_e2e'
    if any(path.startswith(prefix) for prefix in WEB_PRODUCT_PREFIXES):
        return 'web_product'
    if path.startswith('.github/workflows/test-macos.yml'):
        return 'native_ci'
    return 'other'


def native_impact(classes: set[str]) -> str:
    if 'native_code' in classes or 'shared_contract' in classes or 'native_ci' in classes:
        return 'required'
    if 'web_product' in classes or 'web_e2e' in classes:
        return 'review'
    if classes <= {'parity_accounting', 'other'}:
        return 'none'
    return 'review'


def stable_change_id(merge_sha: str, path: str) -> str:
    return f'change:{merge_sha[:12]}:{path}'


def ingest_paths(
    stream: dict[str, Any],
    queue: dict[str, Any],
    *,
    merge_sha: str,
    paths: list[str],
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    events: list[str] = []
    classes = {classify_path(path) for path in paths}
    impact = native_impact(classes)
    if impact == 'none':
        return stream, queue, events

    pending = list(stream.get('pendingChanges') or [])
    known = {row['id'] for row in pending}
    for path in paths:
        cls = classify_path(path)
        if cls in {'other', 'parity_accounting'}:
            continue
        change_id = stable_change_id(merge_sha, path)
        if change_id in known:
            events.append(f'duplicate-ignored:{change_id}')
            continue
        row = {
            'id': change_id,
            'mergeSha': merge_sha,
            'path': path,
            'classification': cls,
            'nativeImpact': impact,
            'status': 'pending',
        }
        pending.append(row)
        known.add(change_id)
        events.append(f'enqueued-change:{change_id}')

    stream = {**stream, 'pendingChanges': pending}
    return stream, queue, events


def upsert_task(queue: dict[str, Any], task: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    tasks = list(queue.get('tasks') or [])
    for existing in tasks:
        if existing.get('stableKey') == task['stableKey']:
            return queue, False
    tasks.append(task)
    tasks.sort(key=lambda row: (-int(row.get('priority', 0)), row.get('stableKey', '')))
    return {**queue, 'tasks': tasks}, True


def recover_stale_leases(state: LoopState, now: datetime) -> list[str]:
    recovered: list[str] = []
    for key, lease in list(state.leases.items()):
        until = utc_now(lease['leasedUntil'])
        if until <= now:
            recovered.append(key)
            del state.leases[key]
            state.dispatched_stable_keys.discard(key)
    return recovered


def acquire_lease(
    state: LoopState,
    *,
    stable_key: str,
    worker_id: str,
    head_sha: str,
    now: datetime,
) -> bool:
    existing = state.leases.get(stable_key)
    if existing:
        until = utc_now(existing['leasedUntil'])
        if until > now and existing.get('workerId') != worker_id:
            return False
    state.leases[stable_key] = {
        'workerId': worker_id,
        'headSha': head_sha,
        'leasedUntil': (now + LEASE_TTL).isoformat().replace('+00:00', 'Z'),
    }
    state.dispatched_stable_keys.add(stable_key)
    return True


def release_lease(state: LoopState, stable_key: str, worker_id: str) -> None:
    lease = state.leases.get(stable_key)
    if lease and lease.get('workerId') == worker_id:
        del state.leases[stable_key]
        state.dispatched_stable_keys.discard(stable_key)


def record_quota_wait(state: LoopState, retry_after_seconds: int, now: datetime) -> None:
    next_at = now + timedelta(seconds=max(retry_after_seconds, 3600))
    state.next_eligible_at = next_at.isoformat().replace('+00:00', 'Z')


def quota_blocks(state: LoopState, now: datetime) -> bool:
    if not state.next_eligible_at:
        return False
    return utc_now(state.next_eligible_at) > now


def clear_quota_wait(state: LoopState) -> None:
    state.next_eligible_at = None


def invalidate_task_evidence(task: dict[str, Any], actual_head: str) -> dict[str, Any]:
    expected = task.get('evidenceHead')
    if expected and expected != actual_head:
        return {
            **task,
            'evidenceHead': None,
            'status': 'pending',
            'notes': (task.get('notes') or '') + f' Evidence invalidated: head moved {expected[:12]} -> {actual_head[:12]}.',
        }
    return task


def gate_blocks_launch(inventory: dict[str, Any]) -> list[str]:
    blockers: list[str] = []
    for name, gate in (inventory.get('gates') or {}).items():
        if gate.get('status') == 'failing':
            blockers.append(f'gate:{name}:failing')
    return blockers


def pick_next_task(
    queue: dict[str, Any],
    state: LoopState,
    *,
    now: datetime,
    inventory: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if quota_blocks(state, now):
        return None
    if inventory is not None and gate_blocks_launch(inventory):
        return None
    for task in queue.get('tasks') or []:
        if task.get('status') != 'pending':
            continue
        key = task['stableKey']
        if key in state.leases:
            continue
        if key in state.dispatched_stable_keys:
            continue
        return task
    return None


def validate_stream(stream: dict[str, Any], inventory: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if stream.get('schemaVersion') != 1:
        errors.append('incremental-stream schemaVersion must be 1')
    if stream.get('frozenBaselineCommit') != inventory.get('baselineCommit'):
        errors.append('incremental-stream frozenBaselineCommit must match inventory baselineCommit')
    watermark = stream.get('reviewedWatermark')
    if not watermark or len(watermark) < 12:
        errors.append('incremental-stream reviewedWatermark required')
    return errors


def validate_queue(queue: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if queue.get('schemaVersion') != 1:
        errors.append('maintenance-queue schemaVersion must be 1')
    keys = [row.get('stableKey') for row in queue.get('tasks') or []]
    if len(keys) != len(set(keys)):
        errors.append('duplicate maintenance-queue stableKey')
    for row in queue.get('tasks') or []:
        if not row.get('stableKey') or not row.get('title'):
            errors.append('task requires stableKey and title')
        if row.get('status') not in {'pending', 'leased', 'done', 'blocked'}:
            errors.append(f"{row.get('stableKey')}: invalid status")
    return errors


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def cmd_validate(_: argparse.Namespace) -> int:
    inventory = load_json(INVENTORY)
    stream = load_json(STREAM)
    queue = load_json(QUEUE)
    errors = validate_stream(stream, inventory) + validate_queue(queue)
    for error in errors:
        print(f'ERROR: {error}')
    print('PARITY_LOOP: PASS' if not errors else 'PARITY_LOOP: FAIL')
    return 1 if errors else 0


def cmd_ingest(args: argparse.Namespace) -> int:
    stream = load_json(STREAM)
    queue = load_json(QUEUE)
    paths = parse_paths(args.paths.read_text() if args.paths else '')
    stream, queue, events = ingest_paths(stream, queue, merge_sha=args.merge_sha, paths=paths)
    if not args.dry_run:
        STREAM.write_text(json.dumps(stream, indent=2) + '\n')
        QUEUE.write_text(json.dumps(queue, indent=2) + '\n')
    for event in events:
        print(event)
    if args.dry_run and stream.get('pendingChanges'):
        print(json.dumps({'pendingChanges': stream['pendingChanges']}, indent=2))
    return 0


def cmd_pick(args: argparse.Namespace) -> int:
    queue = load_json(QUEUE)
    inventory = load_json(INVENTORY)
    state = LoopState.from_json(json.loads(args.state))
    now = utc_now(args.now)
    recover_stale_leases(state, now)
    task = pick_next_task(queue, state, now=now, inventory=inventory)
    print(json.dumps({'task': task, 'state': state.to_json()}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('validate')

    ingest = sub.add_parser('ingest')
    ingest.add_argument('--merge-sha', required=True)
    ingest.add_argument('--paths', type=Path)
    ingest.add_argument('--dry-run', action='store_true')

    pick = sub.add_parser('pick')
    pick.add_argument('--state', default='{}')
    pick.add_argument('--now')

    args = parser.parse_args()
    if args.command == 'validate':
        return cmd_validate(args)
    if args.command == 'ingest':
        return cmd_ingest(args)
    if args.command == 'pick':
        return cmd_pick(args)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
