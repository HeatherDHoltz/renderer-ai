"""Material library for the 1890 private railcar (Blender 5.x, Cycles).

Materials the browser can rebuild exactly carry a JSON recipe in the custom
property "lj" (see runtime()); export.py ships the recipe and its source
textures instead of baking the surface into an atlas."""
import json
import os
import bpy

ROOT = os.environ.get("LJ_ROOT", "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai")
TEX = os.path.join(ROOT, "workbench/assets/railcar/textures")
MAT_ASSETS = os.path.join(ROOT, "workbench/assets/materials")


def runtime(m, **recipe):
    """Tag a material with its browser recipe (read by export.py)."""
    m["lj"] = json.dumps(recipe)
    return m


def _rgb(c):
    return [round(float(x), 4) for x in tuple(c)[:3]]


class G:
    """Tiny node-graph helper."""

    def __init__(self, name):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        self.m = m
        self.nt = m.node_tree
        self.nt.nodes.clear()
        self.out = self.n("ShaderNodeOutputMaterial")
        self.b = self.n("ShaderNodeBsdfPrincipled")
        self.L(self.b.outputs[0], self.out.inputs[0])

    def n(self, t, **kw):
        node = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(node, k, v)
        return node

    def L(self, a, b):
        self.nt.links.new(a, b)

    def set(self, sock, v):
        if isinstance(v, (int, float, tuple, list)):
            self.b.inputs[sock].default_value = v
        else:
            self.L(v, self.b.inputs[sock])

    def math(self, op, a, b=None, clamp=False):
        n = self.n("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.L(v, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        n = self.n("ShaderNodeMix")
        n.data_type = "RGBA"
        n.blend_type = blend
        for idx, v in ((0, fac), (6, a), (7, b)):
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = v
            elif isinstance(v, tuple):
                n.inputs[idx].default_value = v if len(v) == 4 else (*v, 1)
            else:
                self.L(v, n.inputs[idx])
        return n.outputs[2]

    def mixf(self, fac, a, b):
        n = self.n("ShaderNodeMix")
        n.data_type = "FLOAT"
        for idx, v in ((0, fac), (2, a), (3, b)):
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = v
            else:
                self.L(v, n.inputs[idx])
        return n.outputs[0]

    def world_vec(self, scale=1.0):
        geo = self.n("ShaderNodeNewGeometry")
        mp = self.n("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        self.L(geo.outputs["Position"], mp.inputs["Vector"])
        return mp.outputs[0]

    def obj_vec(self, scale=1.0):
        tc = self.n("ShaderNodeTexCoord")
        mp = self.n("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        self.L(tc.outputs["Object"], mp.inputs["Vector"])
        return mp.outputs[0]

    def img(self, path, vec, colorspace="sRGB", box=True):
        t = self.n("ShaderNodeTexImage")
        t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = colorspace
        if box:
            t.projection = "BOX"
            t.projection_blend = 0.25
        self.L(vec, t.inputs["Vector"])
        return t


def _pbr(name, tex, scale, tint=None, tint_mode="MULTIPLY", rough_mul=1.0, rough_add=0.0,
         coat=0.0, coat_rough=0.1, normal_strength=1.0, space="world", sheen=0.0, sheen_tint=(1, 1, 1, 1),
         metallic=0.0, bump_extra=None):
    g = G(name)
    vec = g.world_vec(scale) if space == "world" else g.obj_vec(scale)
    col = g.img(tex["Diffuse"], vec).outputs[0]
    if tint is not None:
        col = g.mix(1.0, col, tint, tint_mode)
    g.set("Base Color", col)
    if "Rough" in tex:
        r = g.img(tex["Rough"], vec, "Non-Color").outputs[0]
    elif "arm" in tex:
        sep = g.n("ShaderNodeSeparateColor")
        g.L(g.img(tex["arm"], vec, "Non-Color").outputs[0], sep.inputs[0])
        r = sep.outputs[1]
    else:
        r = None
    if r is not None:
        g.set("Roughness", g.math("ADD", g.math("MULTIPLY", r, rough_mul), rough_add, clamp=True))
    if "nor_gl" in tex:
        nm = g.n("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        g.L(g.img(tex["nor_gl"], vec, "Non-Color").outputs[0], nm.inputs["Color"])
        g.set("Normal", nm.outputs[0])
    g.b.inputs["Coat Weight"].default_value = coat
    g.b.inputs["Coat Roughness"].default_value = coat_rough
    g.b.inputs["Sheen Weight"].default_value = sheen
    g.b.inputs["Sheen Tint"].default_value = sheen_tint
    g.b.inputs["Metallic"].default_value = metallic
    rough = "Rough" if "Rough" in tex else ("arm" if "arm" in tex else None)
    return runtime(g.m, kind="box", space=space, scale=scale,
                   maps={"color": tex["Diffuse"], "rough": tex.get(rough) if rough else None,
                         "roughChannel": 1 if rough == "arm" else 0, "normal": tex.get("nor_gl")},
                   tint=_rgb(tint) if tint is not None else None, tintMode=tint_mode, roughMul=rough_mul,
                   roughAdd=rough_add, coat=coat, coatRough=coat_rough, normalStrength=normal_strength,
                   sheen=sheen, sheenTint=_rgb(sheen_tint), metallic=metallic)


def build_library(ph):
    """Create all shared materials; returns dict name->material."""
    M = {}
    sap = ph.texture("sapele_veneer")
    rose = ph.texture("rosewood_veneer1")
    maple = ph.texture("white_maple_veneer")
    velvet = ph.texture("velour_velvet")
    leather = ph.texture("brown_leather")
    jacq = ph.texture("floral_jacquard")
    marble = ph.texture("marble_01")

    # French-polished mahogany (sapele) — the dominant joinery wood.
    M["mahogany"] = _pbr("rc mahogany", sap, 0.09, tint=(0.62, 0.30, 0.20, 1), coat=0.55, coat_rough=0.14,
                         rough_mul=0.8, normal_strength=0.4)
    M["mahogany_dark"] = _pbr("rc mahogany dark", sap, 0.09, tint=(0.36, 0.15, 0.10, 1), coat=0.5, coat_rough=0.16,
                              rough_mul=0.8, normal_strength=0.4)
    M["rosewood"] = _pbr("rc rosewood panel", rose, 0.07, tint=(0.75, 0.42, 0.32, 1), coat=0.6, coat_rough=0.1,
                         rough_mul=0.7, normal_strength=0.3)
    M["satinwood"] = _pbr("rc satinwood stringing", maple, 0.2, tint=(1.0, 0.72, 0.38, 1), coat=0.6, coat_rough=0.1)
    M["velvet_red"] = _pbr("rc oxblood velvet", velvet, 0.25, tint=(0.42, 0.035, 0.04, 1), sheen=1.0,
                           sheen_tint=(1.0, 0.55, 0.5, 1), rough_add=0.2, space="object")
    M["velvet_green"] = _pbr("rc emerald velvet", velvet, 0.25, tint=(0.03, 0.16, 0.09, 1), sheen=1.0,
                             sheen_tint=(0.6, 1.0, 0.75, 1), rough_add=0.2, space="object")
    M["leather"] = _pbr("rc oxblood leather", leather, 0.35, tint=(0.75, 0.42, 0.40, 1), coat=0.25, coat_rough=0.35,
                        normal_strength=1.4)
    M["jacquard"] = _pbr("rc gold jacquard", jacq, 0.3, tint=(0.75, 0.45, 0.25, 1), sheen=0.6, space="object")
    M["marble"] = _pbr("rc carrara marble", marble, 0.06, tint=(0.95, 0.9, 0.82, 1), coat=0.4, coat_rough=0.08)
    M["marble_dark"] = _pbr("rc verde antico", marble, 0.06, tint=(0.08, 0.16, 0.12, 1), tint_mode="MULTIPLY",
                            coat=0.5, coat_rough=0.06)

    # Water gilding: warm gold with burnished/matte variation.
    g = G("rc water gilt")
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 6
    nz.inputs["Detail"].default_value = 10
    g.L(g.world_vec(1.0), nz.inputs["Vector"])
    g.set("Base Color", g.mix(nz.outputs["Fac"], (0.55, 0.36, 0.11, 1), (0.95, 0.70, 0.30, 1)))
    rr = g.n("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.42
    rr.inputs["To Max"].default_value = 0.16
    g.L(nz.outputs["Fac"], rr.inputs["Value"])
    g.set("Roughness", rr.outputs[0])
    g.b.inputs["Metallic"].default_value = 1.0
    M["gilt"] = runtime(g.m, kind="gilt", noise=6, dark=[0.55, 0.36, 0.11], light=[0.95, 0.70, 0.30], rough=[0.42, 0.16])

    def metal(name, col, rough, aniso=0.0):
        g = G(name)
        nz = g.n("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 40
        g.L(g.world_vec(1.0), nz.inputs["Vector"])
        g.b.inputs["Base Color"].default_value = col
        g.b.inputs["Metallic"].default_value = 1.0
        g.set("Roughness", g.math("ADD", g.math("MULTIPLY", nz.outputs["Fac"], 0.12), rough))
        g.b.inputs["Anisotropic"].default_value = aniso
        return runtime(g.m, kind="metal", color=_rgb(col), rough=rough, noise=40, noiseAmount=0.12)

    M["brass"] = metal("rc polished brass", (0.86, 0.62, 0.30, 1), 0.10)
    M["brass_aged"] = metal("rc aged brass", (0.62, 0.44, 0.20, 1), 0.28)
    M["nickel"] = metal("rc nickel plate", (0.80, 0.78, 0.74, 1), 0.08)
    M["silver"] = metal("rc sterling", (0.96, 0.95, 0.93, 1), 0.06)
    M["gold"] = metal("rc 18k gold", (1.0, 0.76, 0.36, 1), 0.07)
    M["iron"] = metal("rc blackened iron", (0.05, 0.05, 0.055, 1), 0.45)

    g = G("rc lead crystal")
    g.b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    g.b.inputs["Transmission Weight"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = 0.0
    g.b.inputs["IOR"].default_value = 1.56
    M["crystal"] = g.m
    g = G("rc window glass")
    g.b.inputs["Transmission Weight"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = 0.02
    g.b.inputs["IOR"].default_value = 1.5
    M["glass"] = g.m
    g = G("rc whisky")
    g.b.inputs["Base Color"].default_value = (0.9, 0.42, 0.08, 1)
    g.b.inputs["Transmission Weight"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = 0.0
    g.b.inputs["IOR"].default_value = 1.36
    vol = g.n("ShaderNodeVolumeAbsorption")
    vol.inputs["Color"].default_value = (0.85, 0.38, 0.06, 1)
    vol.inputs["Density"].default_value = 3.0
    g.L(vol.outputs[0], g.out.inputs["Volume"])
    M["whisky"] = g.m

    # Plain colours
    def plain(name, col, rough, sheen=0.0, metallic=0.0, emission=None, strength=0.0):
        g = G(name)
        g.b.inputs["Base Color"].default_value = col
        g.b.inputs["Roughness"].default_value = rough
        g.b.inputs["Sheen Weight"].default_value = sheen
        g.b.inputs["Metallic"].default_value = metallic
        if emission:
            g.b.inputs["Emission Color"].default_value = emission
            g.b.inputs["Emission Strength"].default_value = strength
        return g.m

    M["ivory"] = plain("rc ivory", (0.78, 0.70, 0.55, 1), 0.3)
    M["paper"] = plain("rc laid paper", (0.80, 0.74, 0.60, 1), 0.9)
    M["black_lacquer"] = plain("rc japanned black", (0.012, 0.010, 0.010, 1), 0.12)
    M["silk_shade"] = plain("rc lit silk shade", (0.85, 0.62, 0.38, 1), 0.8, emission=(1.0, 0.62, 0.32, 1), strength=1.4)
    M["mica_glow"] = plain("rc glowing mica", (0.2, 0.08, 0.02, 1), 0.4, emission=(1.0, 0.36, 0.08, 1), strength=0.55)

    # Lincrusta: embossed, gilt-bronzed wall covering (patented 1877).
    g = G("rc lincrusta frieze")
    mask_img = os.path.join(MAT_ASSETS, "damask-mask.png")
    sep = g.n("ShaderNodeSeparateXYZ")
    g.L(g.n("ShaderNodeNewGeometry").outputs["Position"], sep.inputs[0])
    uv = g.n("ShaderNodeCombineXYZ")
    g.L(g.math("DIVIDE", sep.outputs["X"], 1.5), uv.inputs["X"])
    g.L(g.math("DIVIDE", sep.outputs["Z"], 2.25), uv.inputs["Y"])
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(mask_img, check_existing=True)
    t.image.colorspace_settings.name = "Non-Color"
    g.L(uv.outputs[0], t.inputs["Vector"])
    g.set("Base Color", g.mix(t.outputs[0], (0.16, 0.06, 0.03, 1), (0.85, 0.58, 0.24, 1)))
    g.set("Metallic", t.outputs[0])
    g.set("Roughness", g.mixf(t.outputs[0], 0.6, 0.25))
    bump = g.n("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.05
    g.L(t.outputs[0], bump.inputs["Height"])
    g.set("Normal", bump.outputs[0])
    M["lincrusta"] = runtime(g.m, kind="damask", mask=mask_img, axes=[0, 2], div=[1.5, 2.25], dark=[0.16, 0.06, 0.03],
                             light=[0.85, 0.58, 0.24], rough=[0.6, 0.25], bump=0.6)

    # Painted clerestory ceiling: deep green with gilt stencil.
    g = G("rc stencilled ceiling")
    sep = g.n("ShaderNodeSeparateXYZ")
    g.L(g.n("ShaderNodeNewGeometry").outputs["Position"], sep.inputs[0])
    uv = g.n("ShaderNodeCombineXYZ")
    g.L(g.math("DIVIDE", sep.outputs["X"], 1.4), uv.inputs["X"])
    g.L(g.math("DIVIDE", sep.outputs["Y"], 2.1), uv.inputs["Y"])
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(mask_img, check_existing=True)
    g.L(uv.outputs[0], t.inputs["Vector"])
    g.set("Base Color", g.mix(t.outputs[0], (0.03, 0.07, 0.05, 1), (0.62, 0.42, 0.16, 1)))
    g.set("Metallic", t.outputs[0])
    g.set("Roughness", g.mixf(t.outputs[0], 0.55, 0.3))
    M["ceiling"] = runtime(g.m, kind="damask", mask=mask_img, axes=[0, 1], div=[1.4, 2.1], dark=[0.03, 0.07, 0.05],
                           light=[0.62, 0.42, 0.16], rough=[0.55, 0.3], bump=0.0)

    # Carpet with pile bump.
    g = G("rc persian carpet")
    tc = g.n("ShaderNodeTexCoord")
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(TEX, "persian-carpet.jpg"), check_existing=True)
    t.extension = "EXTEND"
    g.L(tc.outputs["UV"], t.inputs["Vector"])
    g.set("Base Color", g.mix(1.0, t.outputs[0], (0.85, 0.8, 0.78, 1), "MULTIPLY"))
    g.b.inputs["Roughness"].default_value = 0.95
    g.b.inputs["Sheen Weight"].default_value = 0.6
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 900
    nz.inputs["Detail"].default_value = 4
    g.L(g.world_vec(1.0), nz.inputs["Vector"])
    bump = g.n("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    g.L(nz.outputs["Fac"], bump.inputs["Height"])
    g.set("Normal", bump.outputs[0])
    M["carpet"] = g.m

    # Leaded quarry glazing (diamond lattice) in amber and pale gold, backlit by the sky.
    g = G("rc art glass")
    sep = g.n("ShaderNodeSeparateXYZ")
    g.L(g.n("ShaderNodeNewGeometry").outputs["Position"], sep.inputs[0])
    h = g.math("ADD", sep.outputs["X"], sep.outputs["Y"])
    u = g.math("MULTIPLY", g.math("ADD", h, sep.outputs["Z"]), 1.6)
    v = g.math("MULTIPLY", g.math("SUBTRACT", h, sep.outputs["Z"]), 1.6)
    fu = g.math("FRACT", u)
    fv = g.math("FRACT", v)
    lead = g.math("MAXIMUM", g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", fu, 0.5)), 0.035),
                  g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", fv, 0.5)), 0.035))
    parity = g.math("MODULO", g.math("ADD", g.math("FLOOR", u), g.math("FLOOR", v)), 2.0)
    pane = g.mix(parity, (0.95, 0.72, 0.32, 1), (0.98, 0.90, 0.66, 1))
    col = g.mix(lead, pane, (0.015, 0.015, 0.015, 1))
    g.set("Base Color", col)
    g.set("Emission Color", pane)
    g.set("Emission Strength", g.math("MULTIPLY", g.math("SUBTRACT", 1.0, lead), 0.55))
    g.b.inputs["Roughness"].default_value = 0.35
    M["art_glass"] = runtime(g.m, kind="artglass", freq=1.6, lead=0.035, paneA=[0.95, 0.72, 0.32], paneB=[0.98, 0.90, 0.66],
                             emission=0.55)
    return M
