"""Repair the two side-table books without moving Heather's placement."""

def repair(scene):
    import bpy
    import bmesh
    from mathutils import Matrix, Vector
    changes=[]
    for index in (0,1):
        body=scene.objects.get(f'gem book {index}')
        pages=scene.objects.get(f'gem book {index} pages')
        if body is None or pages is None: continue
        bounds=[v.co for v in body.data.vertices]
        mn=Vector(tuple(min(v[k] for v in bounds) for k in range(3)))
        mx=Vector(tuple(max(v[k] for v in bounds) for k in range(3)))
        thickness=min(.02,(mx.z-mn.z)*.12)
        bm=bmesh.new()
        parts=[(mn,Vector((mx.x,mx.y,mn.z+thickness))),
               (Vector((mn.x,mn.y,mx.z-thickness)),mx),
               (Vector((mn.x,mn.y,mn.z+thickness)),Vector((mn.x+.06,mx.y,mx.z-thickness)))]
        for low,high in parts:
            matrix=Matrix.Translation((low+high)*.5) @ Matrix.Diagonal((*((high-low)*.5),1))
            bmesh.ops.create_cube(bm,size=2,matrix=matrix)
        bm.to_mesh(body.data);bm.free();body.data.update()
        for modifier in body.modifiers:
            if modifier.type=='BEVEL':modifier.width=.006
        before=list(pages.matrix_world.translation)
        pages.location=(.02,0,0)
        body['book_repaired']=True
        changes.append({'book':body.name,'pageBefore':before,'covers':'separate top/bottom/spine; original body transform retained'})
    return changes
