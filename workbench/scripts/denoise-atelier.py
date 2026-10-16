"""Denoise the linear irradiance atlas through Blender's compositor.

Only the diffuse light map is denoised; base-color texture and live gemstones
are unchanged. UV islands have 12-pixel bake padding to protect their seams.
"""
from pathlib import Path
import bpy


def denoise_atlas(path):
    original = bpy.context.scene
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "Non-Color"
    scene = bpy.data.scenes.new("Atlas denoising")
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.resolution_x = image.size[0]
    scene.render.resolution_y = image.size[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    temporary = path.parents[3] / "output/atelier-research/denoised-atlas.exr"
    scene.render.filepath = str(temporary)
    camera = bpy.data.objects.new("Empty compositor camera", bpy.data.cameras.new("Empty camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.use_nodes = True
    nodes, links = scene.node_tree.nodes, scene.node_tree.links
    nodes.clear()
    source = nodes.new("CompositorNodeImage")
    source.image = image
    denoise = nodes.new("CompositorNodeDenoise")
    denoise.prefilter = "ACCURATE"
    output = nodes.new("CompositorNodeComposite")
    links.new(source.outputs["Image"], denoise.inputs["Image"])
    links.new(denoise.outputs["Image"], output.inputs["Image"])
    bpy.context.window.scene = scene
    bpy.ops.render.render(write_still=True)
    result = bpy.data.images.load(str(temporary), check_existing=False)
    result.file_format = "HDR"
    result.filepath_raw = str(path)
    result.save()
    bpy.context.window.scene = original
    print("ATLAS_DENOISED", path)


if __name__ == "__main__":
    denoise_atlas(Path(__file__).resolve().parents[1] / "assets/atelier/atelier-light.hdr")
