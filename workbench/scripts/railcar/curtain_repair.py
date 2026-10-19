"""Replace each three-roll curtain top with one continuous rounded valance.

Targeted authored-scene repair: preserves the outer silhouette, surface UVs,
materials and room layout. Internal end caps and overlapping barrel strips are
removed. Apply to the original three-roll source, not an already repaired copy.
"""
import re


def apply():
    import bpy
    import bmesh
    from mathutils import Vector
    groups = {}
    for ob in bpy.context.scene.objects:
        match = re.fullmatch(r'((?:back|front) window \d+) swag ([012])', ob.name)
        if match and ob.type == 'MESH':
            groups.setdefault(match[1], {})[int(match[2])] = ob
    if len(groups) != 8 or any(set(g) != {0, 1, 2} for g in groups.values()):
        raise ValueError('Expected eight original three-roll curtain tops')
    report = []
    for name, group in sorted(groups.items()):
        rows = []
        for k, ob in sorted(group.items()):
            points = [ob.matrix_world @ v.co for v in ob.data.vertices]
            bounds = [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)]
            center = Vector([(a + b) / 2 for a, b in bounds])
            radius = max(Vector((0, p.y-center.y, p.z-center.z)).length for p in points)
            if abs(radius-.55) > .001:
                raise ValueError('Unexpected radius: '+ob.name)
            rows.append({'name': ob.name, 'beforeBounds': bounds, 'center': list(center), 'oldRadius': radius})
        joins = [(rows[k]['beforeBounds'][0][1] + rows[k+1]['beforeBounds'][0][0])/2 for k in (0, 1)]
        for k, ob in sorted(group.items()):
            row = rows[k]; lo, hi = row['beforeBounds'][0]
            newlo = joins[k-1] if k else lo
            newhi = joins[k] if k < 2 else hi
            ob.data = ob.data.copy(); inv = ob.matrix_world.inverted()
            for vertex in ob.data.vertices:
                p = ob.matrix_world @ vertex.co
                p.x = newlo if abs(p.x-lo) < .0001 else newhi
                vertex.co = inv @ p
            bm = bmesh.new(); bm.from_mesh(ob.data)
            remove = []
            for face in bm.faces:
                x = [(ob.matrix_world @ v.co).x for v in face.verts]
                if (k and max(abs(a-newlo) for a in x) < .0001) or (k < 2 and max(abs(a-newhi) for a in x) < .0001):
                    remove.append(face)
            bmesh.ops.delete(bm, geom=remove, context='FACES_ONLY')
            bm.to_mesh(ob.data); bm.free()
            row['afterX'] = [newlo, newhi]
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group.values(): ob.select_set(True)
        bpy.context.view_layer.objects.active = group[1]
        bpy.ops.object.join()
        ob = bpy.context.object; ob.name = name+' valance'
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
        # Continuous barrel normals; flat end caps must not round each old roll.
        normals = []
        for face in ob.data.polygons:
            world = [ob.matrix_world @ ob.data.vertices[ob.data.loops[i].vertex_index].co for i in face.loop_indices]
            cap = max(p.x for p in world)-min(p.x for p in world) < .0001
            for p in world:
                n = Vector(((-1 if abs(p.x-rows[0]['beforeBounds'][0][0]) < .0001 else 1), 0, 0)) if cap else Vector((0, p.y-rows[1]['center'][1], p.z-rows[1]['center'][2])).normalized()
                normals.append(tuple((ob.matrix_world.to_3x3().transposed() @ n).normalized()))
            face.use_smooth = not cap
        ob.data.normals_split_custom_set(normals)
        check = bmesh.new(); check.from_mesh(ob.data)
        if any(not edge.is_manifold for edge in check.edges):
            check.free()
            raise ValueError('Valance must be a closed continuous shell: '+ob.name)
        check.free()
        ob['railcar_continuous_valance'] = True
        report.extend(rows)
    return report
