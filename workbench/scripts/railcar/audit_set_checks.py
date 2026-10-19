"""Run in Blender: import audit_set_checks; audit_set_checks.run().

Small actual-mesh fixtures, independent expected outcomes. Uses a temporary
scene and removes its meshes/objects even if an assertion fails.
"""
from pathlib import Path
import bpy
from mathutils import Vector
from audit_geometry import triangle_relation
from audit_set import _geometry, _bbox_candidates, _containment, _expectation, MM_PER_UNIT, run as audit


def run():
    checks = []
    def check(label, condition):
        assert condition, label
        checks.append(label)
    def tri(points):
        return tuple(Vector(p) for p in points)
    a = tri(((0, 0, 0), (2, 0, 0), (0, 2, 0)))
    overlap = tri(((.2, .2, 0), (1, .2, 0), (.2, 1, 0)))
    check('same-facing positive-area overlap', triangle_relation(a, overlap)[0] == 'same_facing_patch')
    check('opposing contact is not z-fighting', triangle_relation(a, tuple(reversed(overlap)))[0] == 'opposing_contact')
    edge = tri(((0, 0, 0), (0, -2, 0), (2, 0, 0)))
    check('shared edge is not a patch or crossing', triangle_relation(a, edge) is None)
    distant = tri(tuple((p.x, p.y, .01) for p in overlap))
    check('separated parallel faces are clear', triangle_relation(a, distant) is None)
    near = tri(tuple((p.x, p.y, .0005) for p in overlap))
    check('near-coplanar same-facing risk', triangle_relation(a, near)[0] == 'same_facing_patch')
    crossing = tri(((.4, .4, -1), (.4, .4, 1), (1.2, .4, 0)))
    check('proper crossing', triangle_relation(a, crossing)[0] == 'surface_crossing')
    miss = tri(((3, 3, -1), (3, 3, 1), (4, 3, 0)))
    check('straddling planes alone do not imply intersection', triangle_relation(a, miss) is None)
    degenerate = tri(((0, 0, 0), (1, 0, 0), (2, 0, 0)))
    check('degenerate triangle does not become a contact', triangle_relation(a, degenerate) is None)
    check('physical scale is 100 mm per authoring unit', MM_PER_UNIT == 100)

    scene = bpy.data.scenes.new('Audit fixture (temporary)')
    meshes, objects = [], []
    def mesh_object(name, verts, faces):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        meshes.append(mesh)
        obj = bpy.data.objects.new(name, mesh)
        objects.append(obj)
        scene.collection.objects.link(obj)
        return obj
    def cube(name, center, size):
        x, y, z = center
        s = size / 2
        verts = [(x+dx*s, y+dy*s, z+dz*s) for dx,dy,dz in
                 ((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1))]
        return mesh_object(name, verts, [(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)])
    try:
        outer = cube('fixture outer', (0,0,0), 4)
        inner = cube('fixture contained', (0,0,0), 1)
        cross = cube('fixture crossing', (2,0,0), 1)
        duplicate_a = mesh_object('fixture patch A', [(10,0,0),(12,0,0),(10,2,0)], [(0,1,2)])
        duplicate_b = mesh_object('fixture patch B', [(10.2,.2,0),(11,.2,0),(10.2,1,0)], [(0,1,2)])
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            scene.view_layers[0].update()
            dg = bpy.context.evaluated_depsgraph_get()
            oa, ib, cc = (_geometry(o, dg) for o in (outer, inner, cross))
            check('closed-mesh containment candidate', _containment(oa, ib)['inner'] == inner.name)
            check('intersecting box not mislabeled contained', _containment(oa, cc) is None)
            fixture_path = Path(__file__).resolve().parents[3] / 'output/railcar/audit-fixture.json'
            result = audit(output_path=fixture_path, scene=scene, use_camera_filter=False)
        pairs = {frozenset((r['a'],r['b'])): r for r in result['findings']}
        check('end-to-end surface crossing', 'surface_crossing' in pairs[frozenset((outer.name,cross.name))]['kinds'])
        check('end-to-end zero-thickness coplanar patch', 'same_facing_patch' in pairs[frozenset((duplicate_a.name,duplicate_b.name))]['kinds'])
        check('end-to-end contained cube', 'sampled_containment' in pairs[frozenset((outer.name,inner.name))]['kinds'])
        check('unresolved findings prevent clear status', result['status'] == 'REVIEW_REQUIRED')
        rules = [{'objects': [outer.name, inner.name], 'max_overlap_mm': [101]*3, 'reason': 'test'}]
        check('exact contact rule applies within limits', _expectation(oa, ib, [1]*3, rules) == 'test')
        check('contact rule expires beyond physical limits', _expectation(oa, ib, [2]*3, rules) is None)
        check('unrelated pair is not accepted', _expectation(oa, cc, [1]*3, rules) is None)
    finally:
        for obj in objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(scene)
        for mesh in meshes:
            bpy.data.meshes.remove(mesh)
    return {'passed': len(checks), 'checks': checks}
