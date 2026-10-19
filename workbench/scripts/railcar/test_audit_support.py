"""python3 -m unittest discover -s workbench/scripts/railcar -p test_audit_support.py"""
import unittest
from audit_support import evaluate


class PlanarSupportChecks(unittest.TestCase):
    def setUp(self):
        self.contract = {'min_gap_mm': -.05, 'max_gap_mm': .2, 'min_footprint_coverage': .99}
        self.support = {'min': [-2, -2, 0], 'max': [2, 2, 1]}

    def test_resting_part_passes(self):
        self.assertEqual(evaluate({'min': [-1,-1,1], 'max': [1,1,2]}, self.support, self.contract)['issues'], [])

    def test_page_with_point_one_mm_clearance_passes(self):
        self.assertEqual(evaluate({'min': [-1,-1,1.001], 'max': [1,1,1.001]}, self.support, self.contract)['issues'], [])

    def test_floating_page_reports_physical_gap(self):
        r = evaluate({'min': [-1,-1,1.081], 'max': [1,1,1.081]}, self.support, self.contract)
        self.assertEqual(r['gap_mm'], 8.1)
        self.assertEqual(r['issues'], ['unsupported_gap'])

    def test_part_through_support_is_flagged(self):
        r = evaluate({'min': [-1,-1,.97], 'max': [1,1,1.97]}, self.support, self.contract)
        self.assertEqual(r['gap_mm'], -3)
        self.assertEqual(r['issues'], ['support_penetration'])

    def test_sideways_shift_is_flagged_even_with_correct_height(self):
        r = evaluate({'min': [1,-1,1], 'max': [3,1,2]}, self.support, self.contract)
        self.assertEqual(r['footprint_coverage'], .5)
        self.assertEqual(r['issues'], ['support_misalignment'])

    def test_empty_footprint_is_not_accepted(self):
        self.assertIn('support_misalignment', evaluate({'min': [0,0,1], 'max': [0,0,1]}, self.support, self.contract)['issues'])


if __name__ == '__main__':
    unittest.main()
