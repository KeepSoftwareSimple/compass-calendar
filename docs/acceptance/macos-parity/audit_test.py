import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CompletionTests(unittest.TestCase):
    def setUp(self):
        self.source = 'e2e/attendees/rsvp.spec.ts'
        self.data = dict(baseline=[self.source], sourceReviews={}, behaviors=[],
                         gates={key: dict(status='passing', evidence='inspected build/run')
                                for key in ['visual', 'signedIn', 'strict', 'fullReview']})

    def test_mapping_one_behavior_does_not_review_whole_source(self):
        self.data['behaviors'] = [dict(id='rsvp', behavior='submit', web=[self.source],
            native=['apps/calendar-macos/CompassUITests/EventFormRsvpKeyboardTests.swift'],
            status='passing', evidence='run', review='assertions inspected')]
        errors, backlog = audit.inspect(self.data)
        self.assertFalse(errors)
        self.assertIn(f'unreviewed-source: {self.source}', backlog)

    def test_fixture_coverage_cannot_bypass_signed_in_gate(self):
        self.data['gates']['signedIn'] = dict(status='missing', evidence='fixture only')
        errors, backlog = audit.inspect(self.data)
        self.assertFalse(errors)
        self.assertIn('gate: signedIn: missing', backlog)

    def test_unjustified_exclusion_and_unproved_pass_fail(self):
        for status in ['excluded', 'passing']:
            with self.subTest(status=status):
                data = copy.deepcopy(self.data)
                data['behaviors'] = [dict(id='rsvp', behavior='submit', web=[self.source],
                                          native=[], status=status)]
                self.assertTrue(audit.inspect(data)[0])

    def test_review_without_mapped_behavior_is_invalid(self):
        self.data['sourceReviews'][self.source] = 'reviewed'
        self.assertTrue(audit.inspect(self.data)[0])

    def test_complete_records_can_pass(self):
        self.data['sourceReviews'][self.source] = 'all assertions accounted'
        self.data['behaviors'] = [dict(id='rsvp', behavior='submit', web=[self.source],
            native=['apps/calendar-macos/CompassUITests/EventFormRsvpKeyboardTests.swift'],
            status='passing', evidence='inspected run', review='matching assertions')]
        self.assertEqual(audit.inspect(self.data), ([], []))
