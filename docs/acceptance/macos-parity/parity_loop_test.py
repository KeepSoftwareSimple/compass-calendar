import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from parity_loop import (
    LoopState,
    acquire_lease,
    gate_blocks_launch,
    ingest_paths,
    invalidate_task_evidence,
    pick_next_task,
    quota_blocks,
    record_quota_wait,
    recover_stale_leases,
    release_lease,
    upsert_task,
    validate_queue,
    validate_stream,
)


class ParityLoopTests(unittest.TestCase):
    def test_duplicate_merge_events_do_not_duplicate_changes(self):
        stream = {'schemaVersion': 1, 'pendingChanges': []}
        queue = {'schemaVersion': 1, 'tasks': []}
        paths = ['apps/calendar-web/src/routes/index.tsx']
        stream, queue, first = ingest_paths(stream, queue, merge_sha='abc123', paths=paths)
        stream, queue, second = ingest_paths(stream, queue, merge_sha='abc123', paths=paths)
        self.assertEqual(len(stream['pendingChanges']), 1)
        self.assertTrue(any(event.startswith('duplicate-ignored:') for event in second))

    def test_stale_lease_recovery(self):
        state = LoopState.empty()
        now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
        acquire_lease(
            state,
            stable_key='task-a',
            worker_id='worker-1',
            head_sha='deadbeef',
            now=now,
        )
        recovered = recover_stale_leases(state, now + timedelta(hours=4))
        self.assertEqual(recovered, ['task-a'])
        self.assertNotIn('task-a', state.leases)

    def test_interrupted_dispatch_releases_and_redispatches(self):
        state = LoopState.empty()
        now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
        acquire_lease(state, stable_key='task-a', worker_id='worker-1', head_sha='abc', now=now)
        release_lease(state, 'task-a', 'worker-1')
        self.assertNotIn('task-a', state.leases)
        queue = {
            'schemaVersion': 1,
            'tasks': [{'stableKey': 'task-a', 'title': 'A', 'priority': 1, 'status': 'pending'}],
        }
        task = pick_next_task(queue, state, now=now)
        self.assertEqual(task['stableKey'], 'task-a')

    def test_quota_wait_and_resume(self):
        state = LoopState.empty()
        now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
        record_quota_wait(state, 3600, now)
        self.assertTrue(quota_blocks(state, now))
        self.assertFalse(quota_blocks(state, now + timedelta(hours=2)))

    def test_changed_head_invalidates_evidence(self):
        task = {'stableKey': 'x', 'status': 'done', 'evidenceHead': '1111111111111111111111111111111111111111'}
        updated = invalidate_task_evidence(task, '2222222222222222222222222222222222222222')
        self.assertEqual(updated['status'], 'pending')
        self.assertIsNone(updated['evidenceHead'])

    def test_reviewed_exclusions_do_not_force_native_tasks(self):
        stream = {'schemaVersion': 1, 'pendingChanges': []}
        queue = {'schemaVersion': 1, 'tasks': []}
        stream, queue, events = ingest_paths(
            stream,
            queue,
            merge_sha='abc',
            paths=['docs/acceptance/macos-parity/checkpoint.md'],
        )
        self.assertEqual(stream['pendingChanges'], [])
        self.assertEqual(events, [])

    def test_failed_gate_blocks_launch(self):
        inventory = {'gates': {'visual': {'status': 'failing'}}}
        self.assertEqual(gate_blocks_launch(inventory), ['gate:visual:failing'])
        queue = {
            'schemaVersion': 1,
            'tasks': [{'stableKey': 'task-a', 'title': 'A', 'priority': 1, 'status': 'pending'}],
        }
        self.assertIsNone(pick_next_task(queue, LoopState.empty(), now=datetime.now(timezone.utc), inventory=inventory))

    def test_queue_dedupe(self):
        queue = {'schemaVersion': 1, 'tasks': []}
        task = {'stableKey': 'same', 'title': 'One', 'priority': 1, 'status': 'pending'}
        queue, added = upsert_task(queue, task)
        self.assertTrue(added)
        queue, added = upsert_task(queue, task)
        self.assertFalse(added)

    def test_validate_contracts(self):
        inventory = {'baselineCommit': 'cf5e5539ef75fb94a1f06a2460dcd62b1d1adda7'}
        stream = {
            'schemaVersion': 1,
            'frozenBaselineCommit': 'cf5e5539ef75fb94a1f06a2460dcd62b1d1adda7',
            'reviewedWatermark': '65fa132af7ccf26be9ece443b87bc350a0c6f0ed',
            'pendingChanges': [],
        }
        queue = json.loads(Path(__file__).with_name('maintenance-queue.json').read_text())
        self.assertEqual(validate_stream(stream, inventory), [])
        self.assertEqual(validate_queue(queue), [])


if __name__ == '__main__':
    unittest.main()
