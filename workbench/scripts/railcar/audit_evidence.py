"""Isolated, flat-colour pair renders in a temporary scene; originals untouched."""
from pathlib import Path
import bpy
from mathutils import Vector


def render_pairs(source_scene, findings, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    diagnostic = bpy.data.scenes.new('Railcar audit diagnostic (temporary)')
    camera_data = bpy.data.cameras.new('Audit camera (temporary)')
    camera = bpy.data.objects.new('Audit camera (temporary)', camera_data)
    diagnostic.collection.objects.link(camera)
    diagnostic.camera = camera
    copies = []
    try:
        diagnostic.render.engine = 'BLENDER_WORKBENCH'
        diagnostic.render.resolution_x = 800
        diagnostic.render.resolution_y = 600
        diagnostic.render.resolution_percentage = 100
        diagnostic.render.image_settings.file_format = 'PNG'
        diagnostic.display.shading.light = 'STUDIO'
        diagnostic.display.shading.color_type = 'OBJECT'
        diagnostic.display.shading.show_shadows = True
        diagnostic.display.shading.show_cavity = True
        diagnostic.display.shading.background_type = 'WORLD'
        diagnostic.world = bpy.data.worlds.new('Audit background (temporary)')
        diagnostic.world.color = (.035, .035, .035)
        for row in findings:
            for obj in copies:
                bpy.data.objects.remove(obj, do_unlink=True)
            copies.clear()
            points = []
            for name, color in ((row['a'], (.04, .6, 1, 1)), (row['b'], (1, .25, .04, 1))):
                original = source_scene.objects.get(name)
                if original is None:
                    continue
                obj = original.copy()
                obj.parent = None
                obj.matrix_world = original.matrix_world.copy()
                obj.color = color
                diagnostic.collection.objects.link(obj)
                copies.append(obj)
                points += [obj.matrix_world @ Vector(p) for p in obj.bound_box]
            if not points:
                continue
            # Pair overview. Full-size desk/wall pair may need a witness close-up.
            lo = Vector(tuple(min(p[k] for p in points) for k in range(3)))
            hi = Vector(tuple(max(p[k] for p in points) for k in range(3)))
            center = (lo + hi) / 2
            radius = max((hi - lo).length / 2, .05)
            camera_data.type = 'ORTHO'
            camera_data.ortho_scale = radius * 2.4
            camera_data.clip_start = .001
            camera_data.clip_end = max(500, radius * 10)
            direction = Vector((1, -1.5, 1)).normalized()
            camera.location = center + direction * radius * 4
            camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
            path = directory / (row['id'] + '.png')
            diagnostic.render.filepath = str(path)
            bpy.ops.render.render(write_still=True, scene=diagnostic.name)
            row['diagnostic_image'] = str(path.resolve())
            row['diagnostic_legend'] = {'blue': row['a'], 'orange': row['b'],
                                       'meaning': 'isolated pair overview; no room occlusion or real materials'}
    finally:
        for obj in copies:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.objects.remove(camera, do_unlink=True)
        bpy.data.cameras.remove(camera_data)
        world = diagnostic.world
        bpy.data.scenes.remove(diagnostic)
        if world:
            bpy.data.worlds.remove(world)


def render_context(source_scene, row, directory):
    """One real-material Cycles view using copied scene/camera/settings.

    Keeps original source sampling, resolution, lights and colour management.
    The view is a recorded audit witness, not the approved hero camera.
    """
    import math
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    view = row.get('visible_witness')
    if not view:
        return
    diagnostic = source_scene.copy()
    diagnostic.name = 'Audit context (temporary)'
    camera_data = bpy.data.cameras.new('Audit context camera (temporary)')
    camera = bpy.data.objects.new('Audit context camera (temporary)', camera_data)
    diagnostic.collection.objects.link(camera)
    try:
        diagnostic.camera = camera
        camera_data.sensor_fit = 'VERTICAL'
        camera_data.sensor_height = 24
        camera_data.lens = 24 / (2 * math.tan(math.radians(52) / 2))
        camera_data.clip_start = .025
        camera_data.clip_end = 400
        camera.location = view['camera_blender']
        camera.rotation_euler = (Vector(view['target_blender']) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        path = directory / (row['id'] + '-context.png')
        diagnostic.render.filepath = str(path)
        diagnostic.render.image_settings.file_format = 'PNG'
        bpy.ops.render.render(write_still=True, scene=diagnostic.name)
        row['context_image'] = str(path.resolve())
        row['context_settings'] = {'engine': diagnostic.render.engine,
                                   'samples': diagnostic.cycles.samples,
                                   'resolution': [diagnostic.render.resolution_x, diagnostic.render.resolution_y],
                                   'note': 'source materials/lighting/settings, audit witness camera; not runtime export'}
    finally:
        bpy.data.objects.remove(camera, do_unlink=True)
        bpy.data.cameras.remove(camera_data)
        bpy.data.scenes.remove(diagnostic)
