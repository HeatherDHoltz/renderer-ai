"""Explicit planar-support contracts; bounds are in a declared support frame.

AABB footprint coverage is useful for a flat book/paper assembly, not proof
of contact for curved supports. Only source-reviewed planar supports belong
in the contracts file. No Blender imports, so checks can run with Python.
"""

def evaluate(subject, support, contract, mm_per_unit=100.0):
    gap_mm = (subject['min'][2] - support['max'][2]) * mm_per_unit
    area = max(0, subject['max'][0] - subject['min'][0]) * max(0, subject['max'][1] - subject['min'][1])
    covered = 1.0
    for axis in (0, 1):
        covered *= max(0, min(subject['max'][axis], support['max'][axis])
                       - max(subject['min'][axis], support['min'][axis]))
    coverage = covered / area if area else 0.0
    issues = []
    if gap_mm < contract.get('min_gap_mm', -.05) - .001:
        issues.append('support_penetration')
    if gap_mm > contract['max_gap_mm'] + .001:
        issues.append('unsupported_gap')
    if coverage < contract['min_footprint_coverage'] - .0001:
        issues.append('support_misalignment')
    return {'issues': issues, 'gap_mm': round(gap_mm, 4), 'footprint_coverage': round(coverage, 5)}
