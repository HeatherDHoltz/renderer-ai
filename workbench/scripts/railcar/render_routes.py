"""Material ownership shared by authoring/export; baking itself is separate."""
ROUTES = {'baked_room', 'live_metal', 'live_glass', 'live_mirror', 'custom_gem', 'live_mixed'}


def material_route(material):
    explicit = material.get('railcar_render_route')
    if explicit is not None:
        if explicit not in ROUTES:
            raise ValueError(f'Unknown railcar render route {explicit!r} on {material.name}')
        return explicit
    name = material.name.lower()
    if 'mirror' in name:
        return 'live_mirror'
    if name.startswith(('rc gem', 'rc loose diamond', 'rc amethyst')):
        return 'custom_gem'
    from export import is_glass, principled
    if is_glass(material):
        return 'live_glass'
    node = principled(material)
    if node:
        metal = node.inputs['Metallic']
        if metal.is_linked:
            return 'live_mixed'
        if metal.default_value > .5:
            return 'live_metal'
    return 'baked_room'


def annotate():
    import bpy
    result = {}
    for material in bpy.data.materials:
        if not material.users:
            continue
        route = material_route(material)
        material['railcar_render_route'] = route
        result.setdefault(route, []).append(material.name)
    return result
