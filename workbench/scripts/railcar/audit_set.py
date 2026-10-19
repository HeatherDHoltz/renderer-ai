"""Read-only railcar geometry audit. See AUDIT.md for use and interpretation.

Evaluated meshes -> AABB broad phase -> triangle narrow phase -> sampled
visibility -> ranked JSON/Markdown + optional isolated diagnostic renders.
Never modifies source objects, saves the blend, or silently accepts findings.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from array import array
from pathlib import Path
import time
from collections import Counter

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from audit_geometry import triangle_relation
from audit_support import evaluate as evaluate_support

ROOT = Path(__file__).resolve().parents[3]
TARGET = Vector((0.0, -0.15, -1.08))
HOME_CAMERA = Vector((0.0, -6.4, 2.6))
YAW_DEGREES = tuple(range(-90, 91, 15))
ELEVATION_DEGREES = tuple(range(0, 76, 15))
ZOOM_FACTORS = (0.18, 0.5, 0.75, 1.0, 1.25)
ASPECT = 16 / 9
VERTICAL_FOV_DEGREES = 52
NEAR_CLIP = 0.025
# The railcar's authored scale overrides Blender's default metre unit setting.
METRES_PER_UNIT = 0.1
MM_PER_UNIT = 100.0
AABB_TOLERANCE = 0.02  # 2 physical mm, broadphase only
PLANE_TOLERANCE = 0.001  # 0.1 physical mm, near-coplanar risk
GEOMETRY_EPSILON = 1e-5

def _pose(yaw_degrees, elevation_degrees, zoom):
    yaw = math.radians(yaw_degrees)
    elevation = math.radians(elevation_degrees)
    radius = (HOME_CAMERA - TARGET).length * zoom
    horizontal = radius * math.cos(elevation)
    position = TARGET + Vector(
        (horizontal * math.sin(yaw), -horizontal * math.cos(yaw), radius * math.sin(elevation))
    )
    forward = (TARGET - position).normalized()
    right = forward.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(forward).normalized()
    return position, forward, right, up


def _aabb_intersects_frustum(corners, camera_pose, tan_h, tan_v):
    position, forward, right, up = camera_pose
    # Each frustum half-space is linear; if all AABB corners fail any one
    # plane, the box is outside. This intentionally errs toward keeping props.
    values = []
    for point in corners:
        rel = point - position
        depth = rel.dot(forward)
        x = rel.dot(right)
        y = rel.dot(up)
        values.append(
            (
                depth - NEAR_CLIP,
                x + depth * tan_h,
                depth * tan_h - x,
                y + depth * tan_v,
                depth * tan_v - y,
            )
        )
    return all(any(value[i] >= 0 for value in values) for i in range(5))


def _geometry(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        triangles = [tuple(tri.vertices) for tri in mesh.loop_triangles]
        if not vertices or not triangles:
            return None
        lo = Vector(tuple(min(v[k] for v in vertices) for k in range(3)))
        hi = Vector(tuple(max(v[k] for v in vertices) for k in range(3)))
        normals = []
        triangle_bounds = []
        normal_tree = KDTree(len(triangles) * 2)
        for index, tri in enumerate(triangles):
            points = [vertices[i] for i in tri]
            n = (points[1] - points[0]).cross(points[2] - points[0])
            if n.length:
                n.normalize()
            normals.append(n)
            normal_tree.insert(n, index * 2)
            normal_tree.insert(-n, index * 2 + 1)
            triangle_bounds.append((tuple(min(v[k] for v in points) for k in range(3)),
                                    tuple(max(v[k] for v in points) for k in range(3))))
        normal_tree.balance()
        edges = Counter(tuple(sorted((a, b))) for tri in triangles
                        for a, b in zip(tri, tri[1:] + tri[:1]))
        signature = hashlib.sha256(array('d', (x for v in vertices for x in v)).tobytes())
        signature.update(array('I', (i for tri in triangles for i in tri)).tobytes())
        return {'geometry_sha256': signature.hexdigest(), 'obj': obj, 'vertices': vertices, 'triangles': triangles,
                'normals': normals, 'normal_tree': normal_tree, 'triangle_bounds': triangle_bounds,
                'min': lo, 'max': hi,
                'corners': [Vector((x, y, z)) for x in (lo.x, hi.x)
                            for y in (lo.y, hi.y) for z in (lo.z, hi.z)],
                'closed': bool(edges) and all(n == 2 for n in edges.values()),
                'exact_tree': BVHTree.FromPolygons(vertices, triangles, all_triangles=True),
                'tree': BVHTree.FromPolygons(vertices, triangles, all_triangles=True,
                                             epsilon=PLANE_TOLERANCE)}
    finally:
        evaluated.to_mesh_clear()


def _bbox_candidates(items):
    ordered = sorted(items, key=lambda item: (item['min'][0], item['obj'].name))
    active = []
    for current in ordered:
        active = [r for r in active if r['max'].x + AABB_TOLERANCE >= current['min'].x]
        for other in active:
            overlap = [min(other['max'][k], current['max'][k])
                       - max(other['min'][k], current['min'][k]) for k in range(3)]
            if all(d >= -AABB_TOLERANCE for d in overlap):
                yield other, current, overlap
        active.append(current)


def _near_plane_candidates(a, b):
    # Blender BVH.overlap can omit coplanar triangles, even with epsilon.
    # Find parallel/opposing normals independently, then plane and AABB-filter.
    for ia, normal in enumerate(a['normals']):
        if normal.length_squared < .5:
            continue
        pa = a['vertices'][a['triangles'][ia][0]]
        amin, amax = a['triangle_bounds'][ia]
        for _, encoded, _ in b['normal_tree'].find_range(normal, .001415):
            ib = encoded // 2
            pb = b['vertices'][b['triangles'][ib][0]]
            if abs(normal.dot(pb - pa)) > PLANE_TOLERANCE:
                continue
            bmin, bmax = b['triangle_bounds'][ib]
            if all(min(amax[k], bmax[k]) >= max(amin[k], bmin[k]) - PLANE_TOLERANCE for k in range(3)):
                yield ia, ib


def _inside(point, tree):
    # Parity in 3 non-axis directions, away from mesh-edge ambiguity.
    votes = []
    for direction in (Vector((1, .173, .319)), Vector((.239, 1, .417)), Vector((.137, .293, 1))):
        direction.normalize()
        origin, count = point.copy(), 0
        for _ in range(256):
            hit, _, _, _ = tree.ray_cast(origin, direction)
            if hit is None:
                break
            count += 1
            origin = hit + direction * GEOMETRY_EPSILON * 4
        else:
            return None  # too complex to classify, never silently pass
        votes.append(count % 2 == 1)
    return True if all(votes) else (False if not any(votes) else None)


def _containment(a, b):
    for outer, inner in ((a, b), (b, a)):
        if not outer['closed'] or not inner['closed']:
            continue
        if not all(outer['min'][k] + GEOMETRY_EPSILON < inner['min'][k]
                   and inner['max'][k] < outer['max'][k] - GEOMETRY_EPSILON for k in range(3)):
            continue
        verts = inner['vertices']
        sample = verts[::max(1, len(verts) // 16)][:16]
        if all(_inside(v, outer['exact_tree']) is True for v in sample):
            return {'inner': inner['obj'].name, 'outer': outer['obj'].name,
                    'sampled_vertices': len(sample), 'witness': sample[0]}
    return None


def _exposure(scene, depsgraph, witnesses, views, pair_names):
    """Positive ray evidence only. Unseen samples do not prove invisibility."""
    tan_v = math.tan(math.radians(VERTICAL_FOV_DEGREES) / 2)
    tan_h = tan_v * ASPECT
    for kind, point in witnesses[:3]:
        for yaw, elevation, zoom, pose in views:
            eye, forward, right, up = pose
            delta = point - eye
            depth = delta.dot(forward)
            if depth <= NEAR_CLIP or abs(delta.dot(right)) > depth * tan_h or abs(delta.dot(up)) > depth * tan_v:
                continue
            direction = delta.normalized()
            # Skip render-hidden objects, which scene.ray_cast can still hit.
            origin = eye.copy()
            for _ in range(32):
                hit, location, _, _, obj, _ = scene.ray_cast(depsgraph, origin, direction,
                                                           distance=delta.length + PLANE_TOLERANCE * 4)
                if not hit or not obj.hide_render:
                    break
                origin = location + direction * PLANE_TOLERANCE * 4
            else:
                continue
            if hit and obj.name in pair_names and abs((location - eye).length - delta.length) <= PLANE_TOLERANCE * 4:
                px_per_unit = 720 / (2 * depth * tan_v)
                item = {'yaw': yaw, 'elevation': elevation, 'zoom': zoom,
                        'camera_blender': list(eye), 'target_blender': list(TARGET),
                        'witness_blender': list(point), 'witness_kind': kind, 'first_hit': obj.name,
                        'pixels_per_mm_at_720p': round(px_per_unit / MM_PER_UNIT, 4),
                        'witness_pixel_1280x720': [round(640 + delta.dot(right) * px_per_unit),
                                                round(360 - delta.dot(up) * px_per_unit)]}
                return item
    return None


def _expectation(a, b, overlap, rules):
    names = sorted((a['obj'].name, b['obj'].name))
    for rule in rules:
        if sorted(rule['objects']) == names:
            # Exact pair, explicit physical limits. Drift reopens the finding.
            if all(d * MM_PER_UNIT <= limit + 0.05
                   for d, limit in zip(overlap, rule['max_overlap_mm'])):
                return rule['reason']
    return None


def _source_fingerprint():
    files = (sorted(Path(__file__).parent.glob('*.py')) + sorted(Path(__file__).parent.glob('*.mjs'))
             + sorted(Path(__file__).parent.glob('audit_*.json')) + sorted((ROOT / 'workbench/src').glob('*.js')))
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _write_summary(result, path):
    counts = result['summary']
    lines = ['# Railcar geometry audit', '',
             f"**{result['status']}** — {counts['unresolved_pairs']} unresolved pairs; "
             f"{counts['exposed_risks']} have a sampled exposed witness.", '',
             f"Scene: `{result['blend_file']}`; source fingerprint `{result['source_sha256']}`.",
             f"Scale: 1 unit = 100 mm. Elapsed: {result['elapsed_seconds']} s.", '',
             '## Agent action', '',
             '1. Open the first exposed findings below. Use the witness camera and diagnostic image; inspect a real render before calling a visual defect confirmed.',
             '2. Fix confirmed defects in the generator. Rerun after rebuilding; compare the same camera before and after.',
             '3. Accept an intended join only with an exact object pair, source reason and physical limits in `audit_contacts.json`. Same-facing patches always stay open.',
             '4. Report completion only when unresolved findings are resolved or individually justified. Do not infer visual approval from a geometry pass.', '',
             '## Planar support contracts', '',
             '| Part | Support | Gap mm | Footprint coverage | Result |', '|---|---|---:|---:|---|',
             *[f"| {r['subject']} | {r['support']} | {r.get('gap_mm', '?')} | {r.get('footprint_coverage', '?')} | {', '.join(r['issues']) or 'PASS'} |"
               for r in result['support_contracts']], '',
             '## Repeated patterns (triage only; complete queue in JSON)', '',
             '| Pattern | Pairs | Exposed witnesses |', '|---|---:|---:|',
             *[f"| {g['pattern']} | {len(g['ids'])} | {g['exposed']} |" for g in result['finding_groups'][:15]], '',
             '## Findings (ranked; complete data in set-audit.json)', '',
             ]
    if not result['changes_since_previous_run']['comparable_previous_run']:
        lines += ['Previous camera/sampling differs or is unknown. The ID differences below are not a geometry regression verdict.', '']
    lines += [f"Previous-run differences: {len(result['changes_since_previous_run']['new'])} new, "
              f"{len(result['changes_since_previous_run']['resolved'])} resolved, "
              f"{len(result['changes_since_previous_run']['geometry_changed'])} with changed geometry.", '']
    lines += ['| ID | Kind | Objects | Exposure | Patch area mm² |', '|---|---|---|---|---:|']
    for row in result['findings'][:50]:
        lines.append(f"| {row['id']} | {', '.join(row['kinds'])} | {row['a']} / {row['b']} | "
                     f"{'sampled exposed' if row['visible_witness'] else 'unverified / occluded samples'} | "
                     f"{row['same_facing_area_mm2']} |")
    for row in result['findings'][:12]:
        lines += ['', f"### {row['id']}: {row['a']} / {row['b']}", '',
                  f"Source modules: {', '.join(row['source_modules'])}. {row['next_action']}",
                  f"World witness (Blender units): `{row['witness_blender']}`.",
                  f"Sampled view: `{json.dumps(row['visible_witness'])}`."]
        if row.get('context_image'):
            lines += ['', f"![Source Cycles view from witness camera]({row['context_image']})"]
        if row.get('diagnostic_image'):
            lines += ['', f"![Isolated diagnostic — not a final render]({row['diagnostic_image']})"]
    lines += ['', '## Coverage and limits', '', *[f'- {s}' for s in result['limitations']], '',
              f"Counts: `{json.dumps(counts, sort_keys=True)}`."]
    path.write_text('\n'.join(lines) + '\n')


def run(output_path=None, progress_path=None, scene=None, use_camera_filter=True, evidence_count=0, context_count=0):
    global HOME_CAMERA, TARGET, VERTICAL_FOV_DEGREES, ASPECT
    if use_camera_filter:
        from case_preview import camera_frame
        camera = camera_frame()
        HOME_CAMERA, TARGET = Vector(camera['position']), Vector(camera['target'])
        VERTICAL_FOV_DEGREES, ASPECT = camera['fov'], camera['aspect']
    started = time.time()
    source_fingerprint = _source_fingerprint()
    scene_signature = hashlib.sha256()
    scene = scene or bpy.context.scene
    output_path = Path(output_path or ROOT / 'output/railcar/set-audit.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(output_path.read_text()) if output_path.exists() else {}
    progress_path = Path(progress_path or output_path.with_name(output_path.stem + '-progress.txt'))
    def progress(message):
        progress_path.write_text(f"{time.strftime('%H:%M:%S')} {message}\n")

    depsgraph = scene.view_layers[0].depsgraph
    objects = sorted((o for o in scene.objects if o.type == 'MESH' and not o.hide_render), key=lambda o: o.name)
    views = [(yaw, elevation, zoom, _pose(yaw, elevation, zoom))
             for yaw in YAW_DEGREES for elevation in ELEVATION_DEGREES for zoom in ZOOM_FACTORS]
    tan_v = math.tan(math.radians(VERTICAL_FOV_DEGREES) / 2)
    contracts = json.loads(Path(__file__).with_name('audit_supports.json').read_text())['contracts'] if use_camera_filter else []
    contract_names = {c[k] for c in contracts for k in ('subject', 'support')}
    contract_records = {}
    records, unseen, unsupported = [], [], []
    for obj in objects:
        record = _geometry(obj, depsgraph)
        if record is not None and obj.name in contract_names:
            contract_records[obj.name] = record
        if record is not None:
            scene_signature.update((obj.name + record['geometry_sha256']).encode())
        if record is None:
            unsupported.append(obj.name)
        elif not use_camera_filter or any(_aabb_intersects_frustum(record['corners'], v[3], tan_v * ASPECT, tan_v) for v in views):
            records.append(record)
        else:
            unseen.append(obj.name)
    support_results = []
    for contract in contracts:
        missing = [contract[k] for k in ('subject', 'support') if contract[k] not in contract_records]
        frame = scene.objects.get(contract['frame'])
        if frame is None:
            missing.append(contract['frame'])
        if missing:
            support_results.append(dict(contract, issues=['missing_support_contract_object'], missing=missing))
            continue
        inverse = frame.matrix_world.inverted()
        def frame_bounds(name):
            points = [inverse @ v for v in contract_records[name]['vertices']]
            return {'min': [min(v[k] for v in points) for k in range(3)],
                    'max': [max(v[k] for v in points) for k in range(3)]}
        support_results.append(dict(contract, **evaluate_support(frame_bounds(contract['subject']),
                                                               frame_bounds(contract['support']), contract, MM_PER_UNIT)))
    support_failures = [r for r in support_results if r['issues']]
    progress(f'evaluated {len(records)} in-envelope meshes')
    rules = json.loads(Path(__file__).with_name('audit_contacts.json').read_text())['pairs']
    findings, accepted, stats = [], [], Counter()
    modules = {'car': 'shell.py', 'desk trinkets': 'trinkets.py', 'partners desk': 'desk.py',
               'jewellery cases': 'cases.py', 'furniture': 'furnish.py', 'lighting': 'lights.py',
               'fireplace': 'fireplace.py', 'whisky corner': 'bar.py', 'longcase clock': 'clock.py',
               'library': 'library.py', 'room decor': 'decor.py'}
    for index, (a, b, overlap) in enumerate(_bbox_candidates(records)):
        stats['broadphase_pairs'] += 1
        hits = set(a['tree'].overlap(b['tree']))
        hits.update(_near_plane_candidates(a, b))
        kinds, witnesses, same_area, largest_patch = Counter(), [], 0.0, 0.0
        for ia, ib in hits:
            ta = tuple(a['vertices'][i] for i in a['triangles'][ia])
            tb = tuple(b['vertices'][i] for i in b['triangles'][ib])
            relation = triangle_relation(ta, tb, GEOMETRY_EPSILON, PLANE_TOLERANCE)
            if relation is None:
                continue
            kind, point, area = relation
            kinds[kind] += 1
            if kind != 'opposing_contact':
                # Keep the largest patch witness and spatially varied crossings.
                if kind == 'same_facing_patch' and area > largest_patch:
                    largest_patch = area
                    witnesses.insert(0, (kind, point))
                elif len(witnesses) < 3 or all((point - p).length > .1 for _, p in witnesses[:3]):
                    witnesses.append((kind, point))
                if kind == 'same_facing_patch':
                    same_area += area
        stats['opposing_contact_triangle_pairs'] += kinds['opposing_contact']
        risk = [k for k in kinds if k != 'opposing_contact']
        containment = None if hits else _containment(a, b)
        if containment:
            risk.append('sampled_containment')
            witnesses.append(('sampled_containment', containment.pop('witness')))
        if not risk:
            stats['contact_or_broadphase_only_pairs'] += 1
            continue
        expected = _expectation(a, b, overlap, rules)
        if expected and 'same_facing_patch' not in risk and not containment:
            accepted.append({'a': a['obj'].name, 'b': b['obj'].name, 'reason': expected,
                             'overlap_mm': [round(d * MM_PER_UNIT, 4) for d in overlap]})
            continue
        visible = _exposure(scene, depsgraph, witnesses, views, {a['obj'].name, b['obj'].name}) if use_camera_filter else None
        collections = sorted({c.name for r in (a, b) for c in r['obj'].users_collection})
        source = sorted({module for col in collections for key, module in modules.items() if col.startswith(key)})
        names = sorted((a['obj'].name, b['obj'].name))
        finding_id = hashlib.sha256(('\0'.join(names + sorted(risk))).encode()).hexdigest()[:10]
        findings.append({'id': finding_id, 'a': names[0], 'b': names[1], 'kinds': sorted(risk),
                         'triangle_counts': dict(kinds), 'same_facing_area_mm2': round(same_area * MM_PER_UNIT ** 2, 4),
                         'overlap_mm': [round(d * MM_PER_UNIT, 4) for d in overlap],
                         'witness_kind': witnesses[0][0],
                         'witness_blender': [round(x, 6) for x in witnesses[0][1]],
                         'geometry_sha256': hashlib.sha256(''.join(sorted((a['geometry_sha256'], b['geometry_sha256']))).encode()).hexdigest(),
                         'visible_witness': visible, 'collections': collections, 'source_modules': source or ['inspect object generator'],
                         'containment': containment,
                         'next_action': 'Inspect reported patch for z-fighting; remove confirmed duplicate surface in generator.' if 'same_facing_patch' in risk
                                        else 'Inspect actual contact in render; correct placement or document an exact intended join.'})
        if index % 100 == 0:
            progress(f'narrow phase {index}: {len(findings)} unresolved')
    findings.sort(key=lambda f: (not (f['visible_witness'] and f['visible_witness']['witness_kind'] == 'same_facing_patch'),
                                not bool(f['visible_witness']), 'same_facing_patch' not in f['kinds'],
                                -f['same_facing_area_mm2'], f['id']))
    summary = dict(stats, unresolved_pairs=len(findings), accepted_pairs=len(accepted),
                   exposed_risks=sum(bool(f['visible_witness']) for f in findings),
                   support_failures=len(support_failures),
                   same_facing_pairs=sum('same_facing_patch' in f['kinds'] for f in findings),
                   containment_pairs=sum('sampled_containment' in f['kinds'] for f in findings))
    groups = {}
    for row in findings:
        # Group repeated generated elements for triage only, never for accepting.
        pattern = ' / '.join(re.sub(r'-?\d+(?:\.\d+)?', '#', name) for name in (row['a'], row['b']))
        key = pattern + ': ' + ', '.join(row['kinds'])
        group = groups.setdefault(key, {'pattern': pattern, 'kinds': row['kinds'], 'ids': [], 'exposed': 0})
        group['ids'].append(row['id'])
        group['exposed'] += bool(row['visible_witness'])
    old = {f['id']: f for f in previous.get('findings', [])}
    current = {f['id']: f for f in findings}
    camera_spec = {'target': list(TARGET), 'home': list(HOME_CAMERA), 'aspect': ASPECT,
                   'vertical_fov': VERTICAL_FOV_DEGREES, 'filtered': use_camera_filter,
                   'yaw_degrees': list(YAW_DEGREES), 'elevation_degrees': list(ELEVATION_DEGREES),
                   'zoom_factors': list(ZOOM_FACTORS)}
    changes = {'new': sorted(current.keys() - old.keys()), 'resolved': sorted(old.keys() - current.keys()),
               'geometry_changed': sorted(k for k in current.keys() & old.keys()
                                          if current[k]['geometry_sha256'] != old[k].get('geometry_sha256')),
               'comparable_previous_run': previous.get('schema') == 2 and previous.get('camera') == camera_spec}
    result = {'schema': 2, 'status': 'REVIEW_REQUIRED' if findings or unsupported or support_failures else 'GEOMETRY_CHECKS_CLEAR',
              'scene': scene.name, 'blend_file': bpy.data.filepath,
              'blend_mtime_ns': os.stat(bpy.data.filepath).st_mtime_ns if bpy.data.filepath else None,
              'source_sha256': source_fingerprint, 'evaluated_geometry_sha256': scene_signature.hexdigest(), 'metres_per_authoring_unit': METRES_PER_UNIT,
              'camera_samples': len(views), 'mesh_objects': len(objects), 'in_envelope_meshes': len(records),
              'camera': camera_spec,
              'summary': summary, 'support_contracts': support_results, 'support_failures': support_failures,
              'changes_since_previous_run': changes, 'finding_groups': list(groups.values()), 'findings': findings, 'accepted_contacts': accepted,
              'outside_sampled_envelope': unseen, 'unsupported_empty_meshes': unsupported,
              'non_mesh_render_objects': [o.name for o in scene.objects if o.type not in ('MESH', 'LIGHT', 'CAMERA', 'EMPTY') and not o.hide_render],
              'limitations': [
                  'Geometry evidence diagnoses risk, not appearance. No automatic visual approval.',
                  'Read-only authoring-scene check. Runtime cases, animated poses, export coplanar repair, materials and shaders require browser screenshots.',
                  '126 discrete 16:9 ring-pivot views only; other aspects, focus-pivot movement, inspection/loupe cameras and views between samples remain unverified. Never prune from this report.',
                  'Positive exposure means a ray reached a witness within 0.4 mm; occluded samples do not prove a defect invisible. Transparent surfaces can mask positive visibility evidence.',
                  'Cross-object evaluated mesh triangles plus explicitly declared flat support contracts checked. Self-intersections, curves/text/instances not converted to meshes, normals/material errors, shadows and flicker over time are not validated.',
                  'Containment uses closed triangulated meshes and 16 vertex samples with 3 ray directions; it is a candidate, not a proof. Open/non-manifold containment is unverified.',
                  'Opposing face contacts and edge/point-only contact are not z-fighting. Same-facing near-plane patches within 0.1 mm stay unresolved even for accepted joins.',
                  'Source hash and blend timestamp identify this run; rerun after rebuilding. A source hash alone does not prove the blend/export were rebuilt.'
              ], 'elapsed_seconds': round(time.time() - started, 2)}
    output_path.write_text(json.dumps(result, indent=2) + '\n')
    _write_summary(result, output_path.with_suffix('.md'))
    if evidence_count or context_count:
        try:
            from audit_evidence import render_pairs, render_context
            if evidence_count:
                render_pairs(scene, findings[:evidence_count], output_path.parent / 'audit-evidence')
            for row in [f for f in findings if f['visible_witness']][:context_count]:
                progress('rendering Cycles context: ' + row['id'])
                render_context(scene, row, output_path.parent / 'audit-evidence')
        except Exception as exc:
            result['evidence_error'] = str(exc)
            result['limitations'].append('Diagnostic render failed: ' + str(exc))
        result['elapsed_seconds'] = round(time.time() - started, 2)
    output_path.write_text(json.dumps(result, indent=2) + '\n')
    _write_summary(result, output_path.with_suffix('.md'))
    progress(f"{result['status']}: {summary}; {result['elapsed_seconds']}s")
    return result
