"""History Outscaled 3D style test, STYLE C: heavy voxel / pixel-art block people and a voxel-built world.

Stacked cubes and stepped slabs (no bevels), layered clothing with belts and straps, per-voxel colour
bands and posterised light like pixel art in 3D, pixel-art slit-eye faces, warm brown palette.

15-second MKUltra opening, five shots, 450 frames at 30 fps, 720x1280. Built entirely by code.
  blender -b -P scene.py -- --stills 30,120,200 --res 540
  blender -b -P scene.py -- --start 1 --end 450 --res 720 --samples 16 --font F.ttf --out out
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, Euler, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg("--out", os.path.join(HERE, "out"))
RES = int(arg("--res", "720"))
START, END = int(arg("--start", "1")), int(arg("--end", "450"))
STILLS = arg("--stills")
SAMPLES = int(arg("--samples", "16"))
FONT = arg("--font", "/System/Library/Fonts/Supplemental/Arial Black.ttf")
LAST = 450
SHOTS = [(1, 90), (91, 180), (181, 285), (286, 375), (376, 450)]
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection


# ---------------------------------------------------------------- helpers
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hx(h):
    h = h.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


VOX = float(os.environ.get("VOX", "1.6"))      # strength of the per-voxel colour bands
POSTER = int(os.environ.get("POSTER", "7"))     # light quantised into N bands (0 = off)


def M(name, hexcol, rough=0.92, emit=0.0, cell=0.06, var=0.10):
    """Voxel material: every cell of a world-aligned cube grid gets its own shade (pixel-art facets),
    and the lit result is posterised into flat bands. The base colour sits in an RGB node called 'base'."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    out = N["Material Output"]
    rgb = N.new("ShaderNodeRGB"); rgb.name = "base"
    rgb.outputs[0].default_value = (*hx(hexcol), 1)
    tc = N.new("ShaderNodeTexCoord")
    sc = N.new("ShaderNodeVectorMath"); sc.operation = "SCALE"; sc.inputs["Scale"].default_value = 1.0 / cell
    L.new(tc.outputs["Object"], sc.inputs[0])
    off = N.new("ShaderNodeVectorMath"); off.operation = "ADD"; off.inputs[1].default_value = (0.37, 0.41, 0.29)
    L.new(sc.outputs[0], off.inputs[0])
    fl = N.new("ShaderNodeVectorMath"); fl.operation = "FLOOR"
    L.new(off.outputs[0], fl.inputs[0])
    wn = N.new("ShaderNodeTexWhiteNoise"); wn.noise_dimensions = "3D"
    L.new(fl.outputs[0], wn.inputs["Vector"])
    mr = N.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = 1 - var * VOX
    mr.inputs["To Max"].default_value = 1 + var * VOX
    L.new(wn.outputs["Value"], mr.inputs["Value"])
    mul = N.new("ShaderNodeVectorMath"); mul.operation = "SCALE"
    L.new(rgb.outputs[0], mul.inputs[0]); L.new(mr.outputs[0], mul.inputs["Scale"])
    L.new(mul.outputs[0], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.05
    if emit:
        b.inputs["Emission Color"].default_value = (*hx(hexcol), 1)
        b.inputs["Emission Strength"].default_value = emit
    if POSTER and not emit:
        s2r = N.new("ShaderNodeShaderToRGB")
        L.new(b.outputs[0], s2r.inputs[0])
        # quantise brightness only (keeps the hue): HSV value -> gamma -> N flat bands -> back
        sp = N.new("ShaderNodeSeparateColor"); sp.mode = "HSV"
        L.new(s2r.outputs["Color"], sp.inputs[0])
        q1 = N.new("ShaderNodeMath"); q1.operation = "POWER"; q1.inputs[1].default_value = 0.4545
        L.new(sp.outputs[2], q1.inputs[0])
        q2 = N.new("ShaderNodeMath"); q2.operation = "MULTIPLY_ADD"
        q2.inputs[1].default_value = POSTER; q2.inputs[2].default_value = 0.5
        L.new(q1.outputs[0], q2.inputs[0])
        q3 = N.new("ShaderNodeMath"); q3.operation = "FLOOR"
        L.new(q2.outputs[0], q3.inputs[0])
        q4 = N.new("ShaderNodeMath"); q4.operation = "DIVIDE"; q4.inputs[1].default_value = POSTER
        L.new(q3.outputs[0], q4.inputs[0])
        q5 = N.new("ShaderNodeMath"); q5.operation = "POWER"; q5.inputs[1].default_value = 2.2
        L.new(q4.outputs[0], q5.inputs[0])
        cb = N.new("ShaderNodeCombineColor"); cb.mode = "HSV"
        L.new(sp.outputs[0], cb.inputs[0]); L.new(sp.outputs[1], cb.inputs[1]); L.new(q5.outputs[0], cb.inputs[2])
        g2 = cb
        em = N.new("ShaderNodeEmission")
        L.new(g2.outputs[0], em.inputs["Color"])
        L.new(em.outputs[0], out.inputs["Surface"])
    return m


def link(o, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), mat=None):
    COL.objects.link(o)
    if parent:
        o.parent = parent
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    if o.type == "MESH" and mat:
        o.data.materials.append(mat)
    return o


def from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def empty(name, **kw):
    return link(bpy.data.objects.new(name, None), **kw)


def add_box(bm, c, s):
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r["verts"]:
        v.co = Vector((c[0] + v.co.x * s[0], c[1] + v.co.y * s[1], c[2] + v.co.z * s[2]))


def blk(name, size, taper=(1.0, 1.0), chamfer=0.0, jitter=0.0, top=False, **kw):
    """Voxel block: hard edges, no bevel. A taper is turned into a stepped top (a narrower slab on top),
    the voxel way of narrowing. top=True puts the origin at the top centre (limbs hanging from a pivot)."""
    bm = bmesh.new()
    dz = -size[2] / 2 if top else 0.0
    if taper != (1.0, 1.0) and size[2] > 0.05:
        h1 = size[2] * 0.7
        bm2 = (size[0] * (1 + taper[0]) / 2, size[1] * (1 + taper[1]) / 2, size[2] - h1)
        # lower 70 % full size, upper 30 % stepped to the taper
        add_box(bm, (0, 0, dz - size[2] / 2 + h1 / 2), (size[0], size[1], h1))
        add_box(bm, (0, 0, dz + size[2] / 2 - (size[2] - h1) / 2), bm2)
    else:
        add_box(bm, (0, 0, dz), size)
    return link(from_bm(name, bm), **kw)


def boxes(name, parts, **kw):
    """One mesh object from many boxes: parts = [((cx,cy,cz),(sx,sy,sz)), ...]."""
    bm = bmesh.new()
    for c, s in parts:
        add_box(bm, c, s)
    return link(from_bm(name, bm), **kw)


def cyl(name, r, depth, seg=8, r2=None, **kw):
    """Voxel 'cylinder': a square post, or a pixel-circle disc (cross of two boxes) when it is flat."""
    if depth < r:
        return boxes(name, [((0, 0, 0), (2 * r, 2 * r * 0.6, depth)), ((0, 0, 0), (2 * r * 0.6, 2 * r, depth)),
                            ((0, 0, 0), (2 * r * 0.86, 2 * r * 0.86, depth))], **kw)
    rr = r if r2 is None else max(r, r2)
    if r2 is not None and abs(r2 - r) > 0.01:
        return boxes(name, [((0, 0, -depth / 4), (2 * r, 2 * r, depth / 2)), ((0, 0, depth / 4), (2 * r2, 2 * r2, depth / 2))], **kw)
    return blk(name, (2 * rr, 2 * rr, depth), **kw)


def ico(name, r, sub=1, **kw):
    """Voxel ball: three crossed boxes."""
    a, b = 2 * r, 2 * r * 0.62
    return boxes(name, [((0, 0, 0), (b, b, a)), ((0, 0, 0), (a, b, b)), ((0, 0, 0), (b, a, b))], **kw)


def poly(name, pts, depth, **kw):
    """Extruded flat polygon from 2D points."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    if f.normal.z < 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert):
            v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return link(from_bm(name, bm), **kw)


def plane(name, w, h, **kw):
    """Vertical plane facing -y (UV 0..1)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UV")
    vs = [bm.verts.new((x * w / 2, 0, z * h / 2)) for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for l, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = c
    return link(from_bm(name, bm), **kw)


FONT3x5 = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
           "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001",
           "8": "111101111101111", "9": "111101111001111"}


def text(name, body, size, mat, extrude=0.02, **kw):
    """Pixel-font text built from cubes (3x5 digits), lying in local XY like a Blender text object."""
    c = size / 5.0
    n = len(body)
    wtot = (n * 4 - 1) * c
    parts = []
    for k, ch in enumerate(body):
        bits = FONT3x5.get(ch, "0" * 15)
        for j in range(5):
            for i in range(3):
                if bits[j * 3 + i] == "1":
                    x = -wtot / 2 + (k * 4 + i + 0.5) * c
                    y = (2 - j) * c
                    parts.append(((x, y, max(extrude, c * 0.5) / 2), (c * 0.98, c * 0.98, max(extrude, c * 0.5))))
    return boxes(name, parts, mat=mat, **kw)


def key(o, path, frame, value=None):
    if value is not None:
        setattr(o, path, value)
    o.keyframe_insert(path, frame=frame)


def vis(o, f_on, f_off):
    """Visible (render) only from f_on to f_off inclusive."""
    for ob in [o] + list(o.children_recursive):
        key(ob, "hide_render", 1, f_on > 1)
        if f_on > 1:
            key(ob, "hide_render", f_on, False)
        if f_off < LAST:
            key(ob, "hide_render", f_off + 1, True)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def vlerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def pop(o, f, s=1.0, over=1.35):
    key(o, "scale", f - 1, (0.001,) * 3)
    key(o, "scale", f + 2, (s * over,) * 3)
    key(o, "scale", f + 4, (s * 0.88,) * 3)
    key(o, "scale", f + 6, (s,) * 3)


# ---------------------------------------------------------------- palette (warm browns, banded shades)
SKIN = M("skin", "#e0a070", cell=0.045, var=0.05)
SKIN_D = M("skin_d", "#b8754c", cell=0.045, var=0.04)
SHIRT = M("shirt", "#f1e4c8", cell=0.04, var=0.05)
SHOE = M("shoe", "#2e1f17", cell=0.04)
SOLE = M("sole", "#1c130e", cell=0.04)
LEATHER = M("leather_belt", "#3a2416", cell=0.04)
BUCKLE = M("buckle", "#d4a648", cell=0.04, var=0.04)
OUTLINE = bpy.data.materials.new("outline")
OUTLINE.use_backface_culling = True
_ob = OUTLINE.node_tree.nodes["Principled BSDF"]
_ob.inputs["Base Color"].default_value = (*hx("#1e130d"), 1)
_ob.inputs["Emission Color"].default_value = (*hx("#1e130d"), 1)
_ob.inputs["Emission Strength"].default_value = 1.0
_ob.inputs["Roughness"].default_value = 1.0
PAL = dict(
    suit_agent="#7a5034", suit_boss="#4a3a30", trousers="#4a3426", vest="#c08a3f", tie="#9c3022",
    hair_dark="#2f2019", hair_brown="#6e4424", hair_grey="#b9b1a4", hat="#3a2a1e", lab="#e9dcc0",
)


def shade(hexcol, f):
    h = hexcol.lstrip("#")
    return "#" + "".join("%02x" % max(0, min(255, int(int(h[i:i + 2], 16) * f))) for i in (0, 2, 4))


def outline(o, t=0.014):
    """Inverted-hull ink line: a pixel-art outline on every block of a character."""
    if o.type != "MESH" or o.name.startswith(("face_", )) or "_face_" in o.name:
        return
    if len(o.data.materials) == 1:
        o.data.materials.append(OUTLINE)
        md = o.modifiers.new("ink", "SOLIDIFY")
        md.thickness, md.offset, md.use_flip_normals = t, 1.0, True
        md.material_offset = 1
        md.use_rim = False


# ---------------------------------------------------------------- characters
FACE_MATS = {}


def face_mat(expr):
    if expr in FACE_MATS:
        return FACE_MATS[expr]
    m = bpy.data.materials.new("face_" + expr)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(HERE, "faces", expr + ".png"))
    tex.extension = "CLIP"
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.35
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.95
    b.inputs["Specular IOR Level"].default_value = 0.0
    FACE_MATS[expr] = m
    return m


def person(name, suit, hair, faces, loc=(0, 0, 0), rz=0.0, s=1.0, legs=None, vest=None, bald=False, wide=1.0,
           hat=None, lab=False, strap=False):
    """Heavy voxel person facing -y, built from stacked cubes and stepped slabs, layered clothes.
    Same pivots as the other styles: pelvis (bob), hips/knees, shoulders/elbows, neck."""
    root = empty(name, loc=loc, rot=(0, 0, rz), scale=(s, s, s))
    pel = empty(name + "_pel", parent=root, loc=(0, 0, 0.80))
    legs = legs or shade(suit, 0.85)
    sm, lm = M(name + "_suit", suit, cell=0.09, var=0.06), M(name + "_legs", legs, cell=0.09, var=0.06)
    sm_l = M(name + "_suit_l", shade(suit, 1.22), cell=0.09, var=0.06)
    sm_d = M(name + "_suit_d", shade(suit, 0.72), cell=0.09, var=0.06)
    lm_d = M(name + "_legs_d", shade(legs, 0.7), cell=0.09, var=0.06)
    W = 0.52 * wide
    # torso: chest block + a wider stepped shoulder yoke + a coat skirt layered over the hips
    torso = blk(name + "_torso", (W, 0.31, 0.50), parent=pel, loc=(0, 0, 0.33), mat=sm)
    blk(name + "_yoke", (W + 0.06, 0.33, 0.10), parent=pel, loc=(0, 0, 0.55), mat=sm_l)
    blk(name + "_skirt", (W + 0.05, 0.35, 0.36 if lab else 0.22), parent=pel,
        loc=(0, 0, -0.06 if lab else 0.03), mat=sm_d if not lab else sm)
    # front: stepped shirt V, voxel tie, stair-stepped lapels in a darker band, a lighter placket band
    for i, (w_, z) in enumerate(((0.20, 0.555), (0.15, 0.50), (0.10, 0.445), (0.06, 0.39))):
        blk(name + "_shirtv%d" % i, (w_, 0.02, 0.055), parent=pel, loc=(0, -0.161, z), mat=SHIRT)
    TIE = M("tie", PAL["tie"], cell=0.03)
    blk(name + "_knot", (0.07, 0.03, 0.05), parent=pel, loc=(0, -0.172, 0.535), mat=TIE)
    blk(name + "_tie", (0.05, 0.03, 0.22), parent=pel, loc=(0, -0.172, 0.40), mat=TIE)
    for sx in (1, -1):
        for i in range(4):
            blk(name + "_lapel", (0.05, 0.02, 0.055), parent=pel,
                loc=(sx * (0.13 - i * 0.025), -0.162, 0.555 - i * 0.055), mat=sm if lab else sm_d)
        blk(name + "_band", (0.04, 0.02, 0.30), parent=pel, loc=(sx * (W / 2 - 0.05), -0.162, 0.30), mat=sm_l)
    blk(name + "_pocket", (0.07, 0.02, 0.03), parent=pel, loc=(0.15 * wide, -0.164, 0.47), mat=SHIRT)
    if vest:  # striped knit vest: alternating colour bands
        for i in range(4):
            blk(name + "_vest%d" % i, (0.30 * wide, 0.02, 0.055), parent=pel, loc=(0, -0.163, 0.20 + i * 0.055),
                mat=M(name + "_vest%d" % (i % 2), vest if i % 2 == 0 else shade(vest, 0.7), cell=0.04))
    if strap:  # shoulder-holster strap: a pixel diagonal of small cubes across the chest
        for i in range(6):
            blk(name + "_strap", (0.06, 0.02, 0.05), parent=pel, loc=(-0.20 + i * 0.045, -0.166, 0.52 - i * 0.05),
                mat=LEATHER)
    # belt over the coat with a brass buckle
    blk(name + "_belt", (W + 0.07, 0.37, 0.07), parent=pel, loc=(0, 0, 0.10), mat=LEATHER)
    blk(name + "_buckle", (0.09, 0.03, 0.08), parent=pel, loc=(0, -0.19, 0.10), mat=BUCKLE)
    legs_d = {}
    for side, sx in (("L", 1), ("R", -1)):
        hip = empty(name + "_hip" + side, parent=pel, loc=(sx * 0.135 * wide, 0, 0))
        blk(name + "_thigh" + side, (0.22, 0.24, 0.40), top=True, parent=hip, mat=lm)
        knee = empty(name + "_knee" + side, parent=hip, loc=(0, 0, -0.38))
        blk(name + "_shin" + side, (0.20, 0.22, 0.30), top=True, parent=knee, mat=lm)
        blk(name + "_cuffL" + side, (0.23, 0.25, 0.07), parent=knee, loc=(0, 0, -0.27), mat=lm_d)
        blk(name + "_boot" + side, (0.21, 0.30, 0.07), parent=knee, loc=(0, -0.05, -0.33), mat=SHOE)
        blk(name + "_sole" + side, (0.23, 0.33, 0.04), parent=knee, loc=(0, -0.055, -0.385), mat=SOLE)
        legs_d[side] = (hip, knee)
    arms = {}
    for side, sx in (("L", 1), ("R", -1)):
        sh = empty(name + "_sh" + side, parent=pel, loc=(sx * (W / 2 + 0.08), 0, 0.53))
        blk(name + "_pad" + side, (0.20, 0.22, 0.10), parent=sh, loc=(0, 0, 0.01), mat=sm_l)
        blk(name + "_ua" + side, (0.17, 0.18, 0.33), top=True, parent=sh, mat=sm)
        el = empty(name + "_el" + side, parent=sh, loc=(0, 0, -0.31))
        blk(name + "_fa" + side, (0.15, 0.16, 0.22), top=True, parent=el, mat=sm)
        blk(name + "_sleeve" + side, (0.19, 0.20, 0.07), parent=el, loc=(0, 0, -0.22), mat=sm_d)
        blk(name + "_cuff" + side, (0.13, 0.14, 0.04), parent=el, loc=(0, 0, -0.27), mat=SHIRT)
        hand = empty(name + "_hand" + side, parent=el, loc=(0, 0, -0.34))
        blk(name + "_handm" + side, (0.13, 0.14, 0.12), parent=hand, mat=SKIN)
        blk(name + "_thumb" + side, (0.04, 0.06, 0.06), parent=hand, loc=(-sx * 0.075, -0.03, 0.01), mat=SKIN)
        sh.rotation_euler = (0, sx * 0.08, 0)
        arms[side] = (sh, el, hand)
    neck = empty(name + "_neck", parent=pel, loc=(0, 0, 0.60))
    blk(name + "_neckm", (0.16, 0.16, 0.10), parent=neck, loc=(0, 0, 0.03), mat=SKIN_D)
    blk(name + "_collar", (0.24, 0.22, 0.05), parent=neck, loc=(0, 0, 0.01), mat=SHIRT)
    head = empty(name + "_head", parent=neck, loc=(0, 0, 0.26))
    # head: main cube + stepped crown + stepped jaw, cube ears with a darker inner cube
    blk(name + "_headm", (0.44, 0.40, 0.40), parent=head, loc=(0, 0, 0.0), mat=SKIN)
    blk(name + "_crown", (0.38, 0.34, 0.06), parent=head, loc=(0, 0, 0.23), mat=SKIN)
    blk(name + "_jaw", (0.36, 0.34, 0.05), parent=head, loc=(0, 0, -0.22), mat=SKIN_D)
    for sx in (1, -1):
        blk(name + "_ear", (0.05, 0.10, 0.12), parent=head, loc=(sx * 0.245, 0.02, -0.02), mat=SKIN)
        blk(name + "_eari", (0.02, 0.05, 0.06), parent=head, loc=(sx * 0.27, 0.02, -0.02), mat=SKIN_D)
    hm = M(name + "_hair", hair, cell=0.04, var=0.14)
    if bald:
        for sx in (1, -1):
            blk(name + "_hside", (0.04, 0.30, 0.16), parent=head, loc=(sx * 0.23, 0.06, 0.03), mat=hm)
        blk(name + "_hback", (0.44, 0.05, 0.18), parent=head, loc=(0, 0.215, 0.0), mat=hm)
    elif not hat:
        blk(name + "_htop", (0.46, 0.42, 0.08), parent=head, loc=(0, 0.0, 0.22), mat=hm)
        blk(name + "_htop2", (0.38, 0.34, 0.05), parent=head, loc=(0.0, 0.02, 0.28), mat=hm)
        for i, (x, w_) in enumerate(((-0.13, 0.20), (0.06, 0.18), (0.17, 0.10))):  # stepped fringe
            blk(name + "_hfr%d" % i, (w_, 0.05, 0.06 - i * 0.015), parent=head, loc=(x, -0.205, 0.165 - i * 0.01), mat=hm)
        blk(name + "_hback", (0.46, 0.06, 0.32), parent=head, loc=(0, 0.22, 0.06), mat=hm)
        for sx in (1, -1):
            blk(name + "_hside", (0.04, 0.30, 0.16), parent=head, loc=(sx * 0.235, 0.05, 0.10), mat=hm)
    if hat:  # fedora: brim slab + stepped crown + band
        HM = M(name + "_hat", hat, cell=0.04)
        for sx in (1, -1):
            blk(name + "_hside", (0.04, 0.30, 0.12), parent=head, loc=(sx * 0.235, 0.05, 0.10), mat=hm)
        blk(name + "_hback", (0.46, 0.06, 0.24), parent=head, loc=(0, 0.22, 0.06), mat=hm)
        blk(name + "_brim", (0.60, 0.56, 0.035), parent=head, loc=(0, 0.0, 0.215), mat=HM)
        blk(name + "_hcrown", (0.42, 0.38, 0.10), parent=head, loc=(0, 0.01, 0.28), mat=HM)
        blk(name + "_hband", (0.43, 0.39, 0.04), parent=head, loc=(0, 0.01, 0.25), mat=M("hatband", "#9c3022"))
        blk(name + "_hcrown2", (0.34, 0.24, 0.05), parent=head, loc=(0, 0.01, 0.355), mat=HM)
    fp = {}
    for i, f in enumerate(faces):
        o = plane(name + "_face_" + f, 0.40, 0.40, parent=head, loc=(0, -0.2015, 0.0), mat=face_mat(f))
        o.visible_shadow = False
        o.hide_render = i != 0
        fp[f] = o
    for o in root.children_recursive:
        outline(o)
    return dict(root=root, pel=pel, torso=torso, neck=neck, head=head, faces=fp, arms=arms, legs=legs_d,
                base=Vector(loc), rz=rz)


def show_face(ch, expr, frame):
    for f, o in ch["faces"].items():
        key(o, "hide_render", frame - 1)
        key(o, "hide_render", frame, f != expr)


def seat(ch):
    for side in ("L", "R"):
        hip, knee = ch["legs"][side]
        hip.rotation_euler = (-math.pi / 2, 0, 0)
        knee.rotation_euler = (math.pi / 2, 0, 0)


def rot(o, f, x=0.0, y=0.0, z=0.0):
    key(o, "rotation_euler", f, (x, y, z))


def breathe(ch, f0, f1, amp=0.012, per=40):
    for f in range(f0, f1 + 1, 4):
        key(ch["pel"], "location", f, (0, 0, 0.80 + amp * math.sin(f / per * 2 * math.pi)))


# ---------------------------------------------------------------- shared world
world = bpy.data.worlds.new("sky")
scene.world = world
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*hx("#f3e2c2"), 1)
bg.inputs["Strength"].default_value = 0.75

sun = bpy.data.lights.new("sun", "SUN")
sun.energy, sun.color, sun.angle = 3.6, hx("#ffe6c4"), math.radians(7)
link(bpy.data.objects.new("sun", sun), rot=(math.radians(48), 0, math.radians(-32)))


def fill_light(loc, energy, col="#ffe8cc", size=4):
    l = bpy.data.lights.new("fill", "AREA")
    l.energy, l.color, l.size = energy, hx(col), size
    o = link(bpy.data.objects.new("fill", l), loc=loc)
    return o, l


FLOOR = M("floor_wood", "#6a4128", cell=0.22, var=0.16)
WALL = M("wall_ochre", "#d9b07a", cell=0.16, var=0.06)
PANEL = M("panel", "#7c4b2b", cell=0.12, var=0.12)
TRIM = M("trim", "#5a3520")
CAB = M("cabinet", "#8d8068", cell=0.08)
CAB_D = M("cabinet_d", "#6f644f")
DESK = M("desk", "#8b5630", cell=0.08, var=0.12)
DESK_D = M("desk_d", "#6a3f22")
PAPER = M("paper", "#f2ead8")
MANILA = M("manila", "#e0bf7c")
BRASS = M("brass", "#c99a3c", rough=0.5)
RED = M("stamp_red", "#c7301f")
GLASS_L = M("glass_lit", "#fff1cf", emit=1.6)


def room(ox, oy, w=6.0, back=1.7, h=3.4, sides=True):
    """Floor + back wall with wood panelling (+ short side walls)."""
    blk("floor", (w + 4, 8, 0.1), parent=None, loc=(ox, oy - 2, -0.05), mat=FLOOR)
    for i in range(14):  # floor boards
        blk("board", (0.02, 8, 0.004), loc=(ox - 6 + i * 0.9, oy - 2, 0.001), mat=TRIM)
    blk("wall", (w + 4, 0.2, h), loc=(ox, oy + back, h / 2), mat=WALL)
    blk("wainscot", (w + 4, 0.06, 1.0), loc=(ox, oy + back - 0.12, 0.5), mat=PANEL)
    blk("rail", (w + 4, 0.1, 0.07), loc=(ox, oy + back - 0.14, 1.02), mat=TRIM)
    for i in range(12):
        blk("panel_line", (0.04, 0.02, 0.9), loc=(ox - 5 + i * 0.9, oy + back - 0.16, 0.5), mat=TRIM)
    if sides:
        for sx in (-1, 1):
            blk("side_wall", (0.2, 5, h), loc=(ox + sx * (w / 2 + 0.6), oy + back - 2.5, h / 2), mat=WALL)


def cabinet(x, y, ry=0.0):
    c = blk("cab", (0.55, 0.6, 1.35), chamfer=0.02, loc=(x, y, 0.675), rot=(0, 0, ry), mat=CAB)
    for i in range(4):
        blk("drawer", (0.47, 0.03, 0.27), chamfer=0.008, parent=c, loc=(0, -0.305, -0.48 + i * 0.32), mat=CAB_D)
        blk("handle", (0.14, 0.03, 0.03), parent=c, loc=(0, -0.33, -0.42 + i * 0.32), mat=BRASS)
    return c


def desk(x, y, w=1.5, d=0.75, h=0.76):
    top = blk("desk_top", (w, d, 0.06), chamfer=0.01, loc=(x, y, h - 0.03), mat=DESK)
    for sx in (-1, 1):
        blk("desk_ped", (0.42, d - 0.06, h - 0.06), loc=(x + sx * (w / 2 - 0.23), y, (h - 0.06) / 2), mat=DESK_D)
        for i in range(3):
            blk("desk_drw", (0.36, 0.02, 0.18), loc=(x + sx * (w / 2 - 0.23), y - d / 2 + 0.02, 0.14 + i * 0.22), mat=DESK)
    blk("desk_front", (w - 0.9, 0.04, 0.4), loc=(x, y - d / 2 + 0.06, h - 0.25), mat=DESK_D)
    return top


def seal(x, y, z, r=0.42):
    """Plain eagle seal: disc + a blocky eagle silhouette, no text."""
    d = cyl("seal", r, 0.05, seg=16, loc=(x, y, z), rot=(math.pi / 2, 0, 0), mat=BRASS)
    cyl("seal_in", r * 0.86, 0.06, seg=16, parent=d, loc=(0, 0, 0), mat=M("seal_blue", "#3f4a5a"))
    E = M("eagle", "#e9d9b4")
    e = empty("eagle", loc=(x, y - 0.05, z))
    blk("eagle_body", (0.11, 0.03, 0.26), taper=(0.7, 1), parent=e, loc=(0, 0, -0.02), mat=E)
    blk("eagle_head", (0.07, 0.03, 0.08), parent=e, loc=(0, 0, 0.15), mat=E)
    for sx in (1, -1):
        blk("eagle_wing", (0.20, 0.03, 0.09), taper=(1.0, 1), parent=e, loc=(sx * 0.14, 0, 0.06),
            rot=(0, -sx * 0.45, 0), mat=E)
        blk("eagle_wing2", (0.14, 0.03, 0.06), parent=e, loc=(sx * 0.22, 0, -0.04), rot=(0, -sx * 0.9, 0), mat=E)
    blk("eagle_tail", (0.12, 0.03, 0.07), taper=(1.6, 1), parent=e, loc=(0, 0, -0.17), mat=E)
    return d, e


def calendar(x, y, z, year):
    c = blk("cal", (0.42, 0.03, 0.52), loc=(x, y, z), mat=PAPER)
    blk("cal_top", (0.42, 0.035, 0.12), parent=c, loc=(0, -0.002, 0.2), mat=RED)
    text("cal_year", year, 0.11, M("ink", "#2a1d17"), extrude=0.005, parent=c, loc=(0, -0.02, 0.05),
         rot=(math.pi / 2, 0, 0))
    for r in range(3):
        for k in range(5):
            blk("cal_day", (0.05, 0.005, 0.04), parent=c, loc=(-0.14 + k * 0.07, -0.02, -0.08 - r * 0.06),
                mat=M("cal_grid", "#b9a98a"))
    return c


def window(x, y, z, w=1.0, h=1.3):
    f = blk("win_frame", (w + 0.12, 0.1, h + 0.12), loc=(x, y, z), mat=TRIM)
    blk("win_glass", (w, 0.12, h), parent=f, mat=M("sky_glass", "#f6dca6", emit=1.2))
    for i in range(9):  # venetian blinds
        blk("blind", (w, 0.13, 0.05), parent=f, loc=(0, -0.01, -h / 2 + 0.1 + i * 0.14), rot=(0.4, 0, 0),
            mat=M("blind", "#efe0bd"))
    return f


def books(x, y, z, n=5, rz=0.0):
    out = []
    cols = ["#8c2f22", "#3f5a4a", "#c08a3f", "#4b3a5a", "#7a4a24"]
    for i in range(n):
        b = blk("book", (0.22, 0.16, 0.045), chamfer=0.005, loc=(x, y, z + 0.025 + i * 0.047),
                rot=(0, 0, rz + random.uniform(-0.15, 0.15)), mat=M("book%d" % (i % 5), cols[i % 5]))
        out.append(b)
    return out


# ================================================================ SHOT 1 + 2: CIA office, 1953 (origin)
room(0, 0)
cabinet(-1.6, 1.25); cabinet(-1.0, 1.25)
cabinet(1.75, 1.25)
SEAL = seal(0.25, 1.58, 2.25)
calendar(-1.3, 1.58, 2.15, "1953")
window(1.35, 1.58, 2.0)
DESK_TOP = desk(-0.15, 0.2)
# back desk / shelf objects (they float in shot 2)
shelf = blk("shelf", (1.6, 0.35, 0.05), loc=(-0.35, 1.45, 1.55), mat=DESK)
floaters = []
floaters += books(-0.95, 1.45, 1.58, n=4, rz=0.1)
floaters += books(-0.5, 1.45, 1.58, n=3, rz=-0.2)
glob = ico("globe", 0.13, sub=1, loc=(0.05, 1.45, 1.72), mat=M("globe", "#6f8a7a"))
floaters.append(glob)
for i in range(3):
    floaters.append(blk("binder", (0.08, 0.26, 0.32), chamfer=0.01, loc=(0.35 + i * 0.1, 1.45, 1.74),
                        mat=M("binder%d" % i, ["#3f4a5a", "#8c2f22", "#c08a3f"][i])))
for i in range(2):
    floaters.append(blk("drawer_file", (0.3, 0.22, 0.03), loc=(-1.6 + i * 0.6, 1.2, 1.37 + 0.03), mat=MANILA))
# desk props
lamp = empty("lamp", loc=(-0.72, 0.38, 0.76))
cyl("lamp_base", 0.1, 0.03, seg=8, parent=lamp, loc=(0, 0, 0.015), mat=BRASS)
cyl("lamp_arm", 0.015, 0.4, seg=6, parent=lamp, loc=(0, 0, 0.2), mat=BRASS)
cyl("lamp_shade", 0.06, 0.14, seg=8, r2=0.12, parent=lamp, loc=(0, -0.05, 0.42), rot=(0.9, 0, 0),
    mat=M("lamp_shade", "#3f5a4a"))
papers = []
for i in range(3):
    papers.append(blk("paper", (0.24, 0.32, 0.006), loc=(-0.55 + i * 0.05, 0.05 + i * 0.02, 0.763 + i * 0.006),
                      rot=(0, 0, 0.3 + i * 0.12), mat=PAPER))
phone = blk("phone", (0.18, 0.2, 0.08), chamfer=0.02, loc=(0.4, 0.42, 0.80), mat=M("bakelite", "#241a15"))
blk("phone_rx", (0.24, 0.06, 0.05), chamfer=0.015, parent=phone, loc=(0, 0, 0.07), mat=M("bakelite", "#241a15"))
floaters += [lamp, phone]

# coffee cup on the desk (shot 1)
CUPM = M("cup", "#3e6a7a")
COFFEE = M("coffee", "#4a2a17")
CUP_POS = Vector((0.33, 0.04, 0.76))
cup1 = empty("cup1", loc=CUP_POS, scale=(1.35, 1.35, 1.35))
cyl("saucer", 0.09, 0.012, seg=10, parent=cup1, loc=(0, 0, 0.006), mat=CUPM)
cyl("cup_body", 0.05, 0.09, seg=8, r2=0.058, parent=cup1, loc=(0, 0, 0.057), mat=CUPM)
cyl("cup_coffee", 0.053, 0.004, seg=8, parent=cup1, loc=(0, 0, 0.095), mat=COFFEE)
blk("cup_handle", (0.03, 0.015, 0.05), parent=cup1, loc=(0.066, 0, 0.06), mat=CUPM)
vis(cup1, 1, 90)

# chair
chair = empty("chair", loc=(-0.25, 0.8, 0))
blk("chair_seat", (0.5, 0.48, 0.07), chamfer=0.01, parent=chair, loc=(0, 0, 0.45), mat=M("leather", "#5e2f1c"))
blk("chair_back", (0.5, 0.08, 0.6), chamfer=0.02, parent=chair, loc=(0, 0.22, 0.8), mat=M("leather", "#5e2f1c"))
cyl("chair_post", 0.03, 0.4, seg=6, parent=chair, loc=(0, 0, 0.22), mat=TRIM)

# colleague (scientist), seated behind the desk, sweater vest, looks away at papers
col = person("colleague", PAL["lab"], PAL["hair_brown"], ("reading", "sip", "wide", "spiral"), lab=True,
             loc=(-0.25, 0.68, -0.28), legs=PAL["trousers"], vest=PAL["vest"])
seat(col)
# agent, standing beside the desk, tips the dropper
agent = person("agent", PAL["suit_agent"], PAL["hair_dark"], ("sly",), loc=(0.95, 0.52, 0), rz=-0.55, hat=PAL["hat"], strap=True)
vis(agent["root"], 1, 90)

# ---- shot 1 animation (1-90)
cn = col["neck"]
rot(cn, 1, 0.32, 0, -0.75); rot(cn, 90, 0.38, 0, -0.85)
cs_l, ce_l, ch_l = col["arms"]["L"]
cs_r, ce_r, ch_r = col["arms"]["R"]
# reading: right hand on the papers, left hand turning a page
rot(cs_r, 1, -0.55, 0.25, 0); rot(ce_r, 1, -0.9, 0, 0)
for f in range(1, 91, 10):
    rot(cs_l, f, -0.55, -0.15 + 0.08 * math.sin(f * 0.3), 0)
    rot(ce_l, f, -1.0 + 0.12 * math.sin(f * 0.3), 0, 0)
breathe(col, 1, 90)
breathe(agent, 1, 90)
a_s, a_e, a_h = agent["arms"]["R"]
rot(a_s, 1, -0.35, -0.05, 0); rot(a_e, 1, -0.3, 0, 0)
AX, AY, AE = [float(v) for v in os.environ.get("APOSE", "-0.68 -0.28 -0.85").split()]
rot(a_s, 16, AX, AY, 0); rot(a_e, 16, AE, 0, 0)
for f in range(20, 91, 6):  # small dropper wiggle while squeezing
    rot(a_s, f, AX + 0.03 * math.sin(f * 0.7), AY, 0)
    rot(a_e, f, AE + 0.05 * math.sin(f * 0.9), 0, 0)
la_s, la_e, la_h = agent["arms"]["L"]
rot(la_s, 1, 0.1, 0.12, 0); rot(la_e, 1, -0.2, 0, 0)
rot(agent["neck"], 1, 0.25, 0, 0.15); rot(agent["neck"], 40, 0.28, 0, 0.0); rot(agent["neck"], 70, 0.25, 0, 0.35)
rot(agent["neck"], 90, 0.25, 0, 0.35)
# the dropper, held point-down
dropper = empty("dropper", parent=a_h)
GLASS = M("glass", "#d8ecef", rough=0.2)
bulb = blk("bulb", (0.075, 0.075, 0.10), chamfer=0.012, parent=dropper, loc=(0, 0, 0.0), mat=M("rubber", "#9c2a1e"))
cyl("pipette", 0.022, 0.22, seg=6, r2=0.01, parent=dropper, loc=(0, 0, -0.16), mat=GLASS)
tip = empty("dropper_tip", parent=dropper, loc=(0, 0, -0.27))
vis(dropper, 1, 90)
for f in range(1, 91, 3):  # keep the dropper vertical whatever the arm does (set after posing below)
    pass
for f in range(20, 91, 7):  # squeeze the bulb
    key(bulb, "scale", f, (1, 1, 1)); key(bulb, "scale", f + 2, (1.25, 1.25, 0.75)); key(bulb, "scale", f + 4, (1, 1, 1))

# ================================================================ SHOT 3: corridor (x = 100)
CX = 100.0
cor_w = 2.6
blk("cor_floor", (cor_w + 0.4, 60, 0.1), loc=(CX, -15, -0.05), mat=M("cor_floor", "#b88a55"))
for i in range(60):  # checker tiles
    for k in range(3):
        if (i + k) % 2 == 0:
            blk("tile", (cor_w / 3, 1.0, 0.004), loc=(CX - cor_w / 3 + k * cor_w / 3, -45 + i, 0.002),
                mat=M("tile_d", "#6f4a2c"))
CEIL = blk("cor_ceil", (cor_w + 0.4, 60, 0.1), loc=(CX, -15, 3.0), mat=M("ceil", "#f0e2c4"))
CEIL.visible_shadow = False
for sx in (-1, 1):
    w_ = blk("cor_wall", (0.2, 60, 3.1), loc=(CX + sx * (cor_w / 2 + 0.1), -15, 1.55), mat=WALL)
    w_.visible_shadow = False
    blk("cor_wains", (0.06, 60, 1.0), loc=(CX + sx * (cor_w / 2 - 0.02), -15, 0.5), mat=PANEL)
    blk("cor_rail", (0.1, 60, 0.07), loc=(CX + sx * (cor_w / 2 - 0.04), -15, 1.02), mat=TRIM)
    for j in range(16):
        y = -40 + j * 3.2 + (1.6 if sx > 0 else 0)
        d = blk("door", (0.08, 1.0, 2.15), chamfer=0.01, loc=(CX + sx * (cor_w / 2 - 0.04), y, 1.075), mat=DESK)
        blk("door_glass", (0.1, 0.6, 0.6), parent=d, loc=(0, 0, 0.55), mat=M("frost", "#f3e7c8", emit=0.6))
        blk("door_knob", (0.12, 0.06, 0.06), parent=d, loc=(0, 0.35, -0.05), mat=BRASS)
        blk("door_frame", (0.06, 1.16, 2.25), loc=(CX + sx * (cor_w / 2 - 0.01), y, 1.125), mat=TRIM)
        blk("plate", (0.1, 0.22, 0.08), loc=(CX + sx * (cor_w / 2 - 0.05), y - 0.75, 1.55), mat=BRASS)
for j in range(30):
    blk("ceil_light", (0.9, 0.5, 0.06), loc=(CX, -40 + j * 2.0, 2.96), mat=M("light_panel", "#fff4d6", emit=2.2))
blk("cor_end", (cor_w + 0.4, 0.2, 3.1), loc=(CX, 14, 1.55), mat=WALL)
window(CX, 13.85, 1.7, 1.2, 1.5)
for k in range(4):
    l = bpy.data.lights.new("cor_l", "POINT")
    l.energy, l.color, l.shadow_soft_size = 160, hx("#ffe3b8"), 0.6
    link(bpy.data.objects.new("cor_l", l), loc=(CX, 10 - k * 3.2, 2.6))

walker = person("walker", "#6b4a30", PAL["hair_dark"], ("stern",), loc=(CX, 8.0, 0), hat=PAL["hat"])
# folder with a big red stamp, held in his right hand, broad face to camera
w_s, w_e, w_h = walker["arms"]["R"]
folder = empty("folder", parent=w_h, loc=(-0.02, -0.02, -0.14))
blk("folder_m", (0.40, 0.03, 0.31), chamfer=0.006, parent=folder, mat=MANILA)
blk("folder_tab", (0.10, 0.032, 0.04), parent=folder, loc=(0.08, 0, 0.13), mat=MANILA)
stamp = empty("stamp", parent=folder, loc=(0, -0.018, 0), scale=(1.5, 1.5, 1.5))
for (sx, sz, x, z) in ((0.22, 0.02, 0, 0.065), (0.22, 0.02, 0, -0.065), (0.02, 0.15, -0.1, 0), (0.02, 0.15, 0.1, 0)):
    blk("stamp_frame", (sx, 0.005, sz), parent=stamp, loc=(x, 0, z), mat=RED)
blk("stamp_bar1", (0.16, 0.005, 0.035), parent=stamp, loc=(0, 0, 0.02), mat=RED)
blk("stamp_bar2", (0.12, 0.005, 0.025), parent=stamp, loc=(0, 0, -0.03), mat=RED)
stamp.rotation_euler = (0, -0.12, 0)

W_F0, W_F1 = 181, 285
PERIOD, SPEED = 22, 0.058
for f in range(W_F0 - 2, W_F1 + 3):
    t = f - W_F0
    ph = 2 * math.pi * t / PERIOD
    key(walker["root"], "location", f, (CX, 8.0 - SPEED * t, 0))
    key(walker["pel"], "location", f, (0, 0, 0.80 + 0.045 * math.cos(2 * ph) - 0.01))
    rot(walker["pel"], f, 0, 0.035 * math.sin(ph), 0.10 * math.sin(ph))
    for side, sg in (("L", 1), ("R", -1)):
        hip, knee = walker["legs"][side]
        s = math.sin(ph) * sg
        rot(hip, f, -0.48 * s, 0, 0)
        # knee bends while the leg swings forward
        rot(knee, f, 0.12 + 0.85 * max(0.0, sg * math.cos(ph)) ** 1.3, 0, 0)
    for side, sg in (("L", 1), ("R", -1)):
        sh, el, hd = walker["arms"][side]
        s = math.sin(ph) * sg
        amp = 0.5 if side == "L" else 0.32
        rot(sh, f, 0.55 * s * (amp / 0.5), sg * 0.10, 0)
        rot(el, f, -0.25 - 0.2 * max(0, -s), 0, 0)
    rot(walker["neck"], f, 0.05, 0, -0.09 * math.sin(ph))
    rot(folder, f, 0.3 * math.sin(ph + 0.6) * -1 * 0.4, 0, 0)

# ================================================================ SHOT 4: map table (x = 200)
MX = 200.0
blk("table", (12, 18, 0.2), loc=(MX, 0, -0.1), mat=DESK)
for i in range(13):
    blk("table_plank", (0.03, 18, 0.004), loc=(MX - 6 + i, 0, 0.001), mat=DESK_D)
blk("map_sheet", (8.6, 7.6, 0.02), loc=(MX, 0.2, 0.01), mat=M("sea", "#7b9aa0", cell=0.16, var=0.08))
blk("map_border", (8.9, 7.9, 0.012), loc=(MX, 0.2, 0.004), mat=M("map_border", "#efe2c4"))
NA = [(-165, 65), (-161, 70), (-150, 71), (-140, 70), (-128, 70), (-115, 69), (-105, 68), (-95, 69), (-88, 68),
      (-82, 70), (-75, 68), (-68, 63), (-62, 58), (-58, 53), (-56, 50), (-61, 46), (-65, 44), (-70, 42),
      (-74, 40), (-76, 37), (-76, 34), (-81, 31), (-80, 27), (-80.5, 25), (-82, 26), (-83, 29), (-86, 30),
      (-90, 29.5), (-94, 29.5), (-97, 27), (-97.5, 22), (-96, 19), (-92, 18.5), (-90.5, 21), (-87, 21.5),
      (-88, 16), (-84, 15), (-83.5, 11), (-80, 8.5), (-78, 8), (-80, 7.4), (-85.5, 10), (-88, 13), (-92, 14.5),
      (-96, 15.7), (-101, 17.5), (-105.5, 20), (-106, 23), (-109, 26), (-112, 29), (-113.5, 31), (-117, 32.5),
      (-120, 34.5), (-123.5, 38), (-124.2, 42), (-124, 46.5), (-125, 49), (-128, 51), (-131, 54.5),
      (-135, 57.5), (-140, 59.8), (-147, 60.5), (-152, 59), (-158, 57), (-163, 55), (-160, 58.5), (-164, 60),
      (-166, 62.5)]
HUDSON = [(-94.5, 59), (-92, 57), (-87, 55.5), (-82, 54.5), (-79, 56), (-78, 59), (-78, 62.5), (-82, 64),
          (-87, 64), (-92, 62.5)]
K = 0.072


def proj(lon, lat):
    return (MX + (lon + 105) * K * 0.78, 0.2 + (lat - 42) * K)


GL = [(-73, 60), (-55, 60), (-20, 70), (-30, 83), (-60, 82), (-72, 77)]  # Greenland edge
# poly("greenland", [proj(*p) for p in GL], 0.06, loc=(0, 0, 0.02), mat=M("land_l", "#e2bd7e"))
# a few low-poly hills on the land
for (lo, la_, h) in ((-112, 44, 0.12), (-108, 39, 0.14), (-116, 50, 0.12), (-120, 56, 0.1), (-104, 25, 0.1)):
    x, y = proj(lo, la_)
    pass  # cyl("mtn", 0.22, h, seg=5, r2=0.0, loc=(x, y, 0.08 + h / 2), mat=M("mtn", "#b98a4a"))


def inside(pt, poly_):
    x, y = pt
    c = False
    for i in range(len(poly_)):
        x1, y1 = poly_[i]; x2, y2 = poly_[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


# voxel land: the coastline rasterised into a grid of cubes, stepped up to three cubes high
LC = 0.16
random.seed(3)
land_parts, land_hi = [], []
for gx in range(-30, 31):
    for gy in range(-24, 25):
        x, y = MX + gx * LC, 0.2 + gy * LC
        lo, la_ = (x - MX) / (K * 0.78) - 105, (y - 0.2) / K + 42
        if inside((lo, la_), NA) and not inside((lo, la_), HUDSON):
            h = 0.05 + 0.04 * random.choice((0, 0, 0, 1, 1, 2)) + (0.04 if la_ > 55 else 0)
            (land_hi if h > 0.1 else land_parts).append(((x, y, 0.02 + h / 2), (LC, LC, h)))
boxes("land", land_parts, mat=M("land", "#c98d45", cell=LC, var=0.10))
boxes("land_hi", land_hi, mat=M("land_hi", "#a8733a", cell=LC, var=0.10))
pins_ll = []
random.seed(21)
tries = 0
while len(pins_ll) < 80:
    tries += 1
    gap = 6.8 if tries < 20000 else 3.0
    if len(pins_ll) < 70:
        lo, la_ = random.uniform(-122, -71), random.uniform(29, 48)
    else:
        lo, la_ = random.uniform(-123, -64), random.uniform(43, 53)
    if inside((lo, la_), NA) and all((lo - a) ** 2 + (la_ - b) ** 2 > gap for a, b in pins_ll):
        pins_ll.append((lo, la_))
# pop order: sweep from the east coast westward (feels like spreading)
pins_ll.sort(key=lambda p: -p[0] + random.uniform(-6, 6))
PIN_HEAD = M("pin_head", "#c7301f", rough=0.6)
PIN_POST = M("pin_post", "#2e1f17")
P_F0, P_F1 = 293, 352
pop_frames = []
for i, (lo, la_) in enumerate(pins_ll):
    x, y = proj(lo, la_)
    p = empty("pin", loc=(x, y, 0.08))
    cyl("pin_post", 0.018, 0.16, seg=5, parent=p, loc=(0, 0, 0.07), mat=PIN_POST)
    blk("pin_head", (0.12, 0.12, 0.12), chamfer=0.02, parent=p, loc=(0, 0, 0.19), mat=PIN_HEAD)
    f = int(round(P_F0 + (P_F1 - P_F0) * i / 79))
    pop(p, f, 1.0, 1.6)
    pop_frames.append(f + 1)
# the counter: a plaque with two digit wheels made of stepped text objects
plaque = blk("plaque", (2.2, 1.5, 0.16), chamfer=0.04, loc=(MX, 4.2, 0.08), mat=M("plaque", "#3b2a20"))
blk("plaque_rim", (2.35, 1.65, 0.1), chamfer=0.03, loc=(MX, 4.2, 0.05), mat=BRASS)
DIG = M("digit", "#fff1cf", emit=0.6)
digits = {}
for place, dx in (("t", -0.42), ("o", 0.42)):
    for n in range(10):
        o = text("d%s%d" % (place, n), str(n), 1.25, DIG, extrude=0.03, loc=(MX + dx, 4.2, 0.17))
        digits[(place, n)] = o
count_at = {}
for f in range(286, LAST + 1):
    count_at[f] = sum(1 for pf in pop_frames if pf <= f)
for (place, n), o in digits.items():
    key(o, "hide_render", 1, True)
    prev = None
    for f in range(286, 376):
        c = count_at[f]
        if place == "t":
            on = (c >= 10 and c // 10 == n)
        else:
            on = (c % 10 == n)
        if on != prev:
            key(o, "hide_render", f, not on)
            prev = on
    key(o, "hide_render", 376, True)
counter = empty("counter_pop", loc=(MX, 5.15, 0))
plaque.parent = None
# pop the plaque when the count hits 80
key(plaque, "scale", 352, (1, 1, 1)); key(plaque, "scale", 355, (1.15, 1.15, 1.3)); key(plaque, "scale", 359, (1, 1, 1))
for (place, n), o in digits.items():
    key(o, "scale", 352, (1, 1, 1)); key(o, "scale", 355, (1.25, 1.25, 1.25)); key(o, "scale", 359, (1, 1, 1))
fill_light((MX, 0, 9), 700, size=12)

# ================================================================ SHOT 5: the shredder, 1973 (x = 300)
SX = 300.0
room(SX, 0)
cabinet(SX - 1.7, 1.25); cabinet(SX - 1.1, 1.25); cabinet(SX + 1.8, 1.25)
calendar(SX + 1.0, 1.58, 2.15, "1973")
seal(SX - 0.4, 1.58, 2.35)
desk(SX - 0.42, 0.15, w=1.6)
stacks = []
for k in range(3):  # stacks of files waiting
    for i in range(7 + k * 2):
        stacks.append(blk("file", (0.30, 0.38, 0.035), chamfer=0.004,
                          loc=(SX - 0.85 + k * 0.36 + random.uniform(-0.02, 0.02), 0.12, 0.79 + i * 0.037),
                          rot=(0, 0, random.uniform(-0.08, 0.08)), mat=MANILA if i % 3 else M("manila2", "#cfa864")))
# shredder on a bin, beside the desk on his left (+x)
SHR = Vector((SX + 0.68, -0.32, 0))
bin_ = blk("bin", (0.5, 0.4, 0.62), taper=(1.06, 1.06), chamfer=0.02, loc=(SHR.x, SHR.y, 0.31), mat=M("bin", "#5e5a4e"))
head_ = blk("shred_head", (0.56, 0.44, 0.2), chamfer=0.03, loc=(SHR.x, SHR.y, 0.72), mat=M("shred", "#3a3530"))
blk("shred_slot", (0.40, 0.05, 0.02), loc=(SHR.x, SHR.y, 0.825), mat=M("slot", "#0e0b09"))
blk("shred_btn", (0.06, 0.04, 0.04), loc=(SHR.x + 0.2, SHR.y - 0.2, 0.75), mat=M("btn_red", "#c7301f", emit=1.5))
SLOT = Vector((SHR.x, SHR.y, 0.84))
# shredder shakes while it eats
for f in range(376, 451, 2):
    key(head_, "location", f, (SHR.x + random.uniform(-0.008, 0.008), SHR.y, 0.72 + random.uniform(-0.006, 0.006)))

boss = person("boss", PAL["suit_boss"], PAL["hair_grey"], ("grin",), loc=(SX + 0.38, 0.42, 0), rz=-0.32,
              s=1.04, bald=True, wide=1.12, legs="#2f2622")
breathe(boss, 376, 450, amp=0.018, per=18)
b_s, b_e, b_h = boss["arms"]["L"]
br_s, br_e, br_h = boss["arms"]["R"]
rot(br_s, 376, -0.55, -0.15, 0); rot(br_e, 376, -0.9, 0, 0)
for f in range(376, 451, 6):  # right hand grabs the next file from the stacks
    rot(br_s, f, -0.6 + 0.08 * math.sin(f * 0.4), -0.2, 0)
feed = empty("feed_file", parent=b_h, loc=(0, -0.05, -0.12))
ffile = blk("feed_file_m", (0.30, 0.03, 0.38), chamfer=0.004, parent=feed, rot=(0, 0, 0), mat=MANILA)
FEED = 15
for c in range(6):
    f = 376 + c * FEED - 3
    rot(b_s, f, -0.8, -0.5, 0); rot(b_e, f, -0.7, 0, 0)          # up, file raised
    DX, DY, DE = [float(v) for v in os.environ.get("DPOSE", "-0.35 -0.45 -0.6").split()]
    rot(b_s, f + 8, DX, DY, 0); rot(b_e, f + 8, DE, 0, 0)  # pushing down into the slot
    rot(b_s, f + FEED, -0.8, -0.5, 0); rot(b_e, f + FEED, -0.7, 0, 0)
    key(ffile, "scale", f + 6, (1, 1, 1)); key(ffile, "scale", f + 9, (1, 1, 0.15))
    key(ffile, "scale", f + 10, (0.001, 0.001, 0.001)); key(ffile, "scale", f + 12, (1, 1, 1))
rot(boss["neck"], 376, 0.25, 0, -0.05); rot(boss["neck"], 420, 0.2, 0, -0.1); rot(boss["neck"], 450, 0.05, 0, 0.12)
# paper strips shoot out toward the camera
STRIP = M("strip", "#f6eedb")
STRIP2 = M("strip2", "#e6c98c")
random.seed(5)
for i in range(42):
    o = blk("strip", (0.022, 0.006, 0.22), mat=STRIP if i % 3 else STRIP2)
    o.visible_shadow = False
    per = random.randint(18, 28)
    f = 376 - random.randint(0, per)
    dx, dy = random.uniform(0.1, 1.5), random.uniform(-2.6, -1.4)
    up = random.uniform(0.05, 0.35)
    r0 = Vector((random.uniform(0, 6), random.uniform(0, 6), random.uniform(0, 6)))
    while f <= LAST:
        p0 = SLOT + Vector((random.uniform(-0.15, 0.15), 0, 0))
        key(o, "location", f, p0); key(o, "scale", f, (0.2, 0.2, 0.2)); key(o, "rotation_euler", f, r0)
        key(o, "scale", f + 3, (1, 1, 1))
        key(o, "location", f + per // 2, p0 + Vector((dx * 0.5, dy * 0.5, up)))
        key(o, "location", f + per - 1, p0 + Vector((dx, dy, up * 0.4 - 0.2)))
        key(o, "rotation_euler", f + per - 1, r0 + Vector((7, 5, 3)))
        key(o, "scale", f + per - 1, (1, 1, 1)); key(o, "scale", f + per, (0.001,) * 3)
        f += per

# ================================================================ cameras: one per shot, keyed every frame
CAMS = []


def camera(name, f0, f1, fn):
    cd = bpy.data.cameras.new(name)
    cd.clip_start, cd.clip_end = 0.05, 300
    co = link(bpy.data.objects.new(name, cd))
    co.rotation_mode = "QUATERNION"
    for f in range(f0, f1 + 1):
        t = (f - f0) / max(1, f1 - f0)
        p, tg, roll, lens = fn(f, t)
        p, tg = Vector(p), Vector(tg)
        q = (tg - p).to_track_quat("-Z", "Y")
        q = q @ Quaternion((0, 0, 1), roll)
        key(co, "location", f, p)
        key(co, "rotation_quaternion", f, q)
        cd.lens = lens
        cd.keyframe_insert("lens", frame=f)
    m = scene.timeline_markers.new(name, frame=f0)
    m.camera = co
    CAMS.append((f0, co))
    return co


# shot 1: slow push-in on the spiking
camera("cam1", 1, 90, lambda f, t: (vlerp((0.9, -3.3, 1.85), (0.55, -2.25, 1.62), ease(t)),
                                    vlerp((0.0, 0.5, 1.12), (0.12, 0.4, 1.05), ease(t)), 0.0, 32))


# shot 2: close on the colleague, the room rolls about 20 degrees
def cam2(f, t):
    roll = math.radians(22) * ease((f - 118) / 50) + math.radians(3) * math.sin(f * 0.25) * ease((f - 140) / 20)
    p = vlerp((0.55, -1.15, 1.42), (0.42, -0.95, 1.38), ease(t))
    return p, (-0.22, 0.65, 1.18), roll, 30


camera("cam2", 91, 180, cam2)
# shot 3: camera tracks backward down the corridor ahead of the walker


def cam3(f, t):
    wy = 8.0 - SPEED * (f - W_F0)
    d = lerp(3.5, 2.6, ease(t))
    return (CX + 0.25, wy - d, 1.25), (CX, wy, 1.05), 0.0, 30


camera("cam3", 181, 285, cam3)


# shot 4: from close over the map, a fast pull-up
def cam4(f, t):
    a = ease_out((f - 286) / 22)
    z = lerp(2.4, 10.4, a) + 0.7 * t
    tx, ty = lerp(MX - 0.3, MX - 0.4, a), lerp(-0.4, 0.5, a)
    p = (tx, ty - 0.02 - 0.6 * a, z)
    return p, (tx, ty, 0), math.radians(lerp(-8, 0, a) + 2 * t), 30


camera("cam4", 286, 375, cam4)


# shot 5: shredder, then a quick zoom to the grin
def cam5(f, t):
    z = ease((f - 418) / 12)
    head = Vector((SX + 0.38, 0.42, 1.66))
    p = vlerp((SX + 0.35, -2.9, 1.5), (SX + 0.32, -2.55, 1.6), ease((f - 376) / 74))
    tg = vlerp((SX + 0.4, 0.3, 1.18), head + Vector((0, 0, -0.05)), z)
    return p, tg, 0.0, lerp(28, 70, z)


camera("cam5", 376, 450, cam5)

# ---------------------------------------------------------------- drops: follow the real dropper tip
scene.render.fps = 30
GLASSD = M("drop", "#cfe9f2", rough=0.1)
CUP_TOP = CUP_POS + Vector((0, 0, 0.125))
for i in range(5):
    d = ico("drop", 0.026, sub=1, loc=(0, 0, -50), mat=GLASSD)
    d.scale = (1, 1, 1.5)
    f = 22 + i * 7
    while f <= 86:
        scene.frame_set(f)
        tp = tip.matrix_world.translation.copy()
        key(d, "location", f - 1, (tp.x, tp.y, -50))
        key(d, "location", f, tp)
        key(d, "location", f + 6, (CUP_TOP.x, CUP_TOP.y, CUP_TOP.z + 0.01))
        key(d, "location", f + 7, (CUP_TOP.x, CUP_TOP.y, -50))
        f += 35
scene.frame_set(40)
print("TIPDBG", tuple(round(c, 3) for c in tip.matrix_world.translation), "CUP", tuple(round(c, 3) for c in CUP_TOP))
# keep the dropper upright: counter-rotate it against the hand's world rotation
for f in range(1, 91, 2):
    scene.frame_set(f)
    hm = a_h.matrix_world.to_quaternion()
    dropper.rotation_mode = "QUATERNION"
    dropper.rotation_quaternion = hm.inverted() @ Quaternion((0, 1, 0), 0.25)
    dropper.keyframe_insert("rotation_quaternion", frame=f)
for f in range(1, 91):
    pass
# ripple on the coffee
for f in range(28, 91, 7):
    pass

# ---------------------------------------------------------------- shot 2 animation (91-180)
# the cup is now in his left hand
cup2 = empty("cup2", parent=cs_l)
c2 = empty("cup2_in", parent=ch_l, loc=(0, -0.10, -0.02), scale=(1.4, 1.4, 1.4))
cyl("cup2_body", 0.05, 0.09, seg=8, r2=0.058, parent=c2, loc=(0, 0, 0.0), mat=CUPM)
cyl("cup2_coffee", 0.053, 0.004, seg=8, parent=c2, loc=(0, 0, 0.044), mat=COFFEE)
blk("cup2_handle", (0.03, 0.015, 0.05), parent=c2, loc=(0.066, 0, 0.0), mat=CUPM)
vis(c2, 91, 180)
rot(cn, 91, 0.05, 0, 0.12); rot(cn, 112, 0.0, 0, 0.12); rot(cn, 120, -0.06, 0, 0.0)
for f in range(124, 181, 4):
    rot(cn, f, -0.04 + 0.04 * math.sin(f * 0.5), 0.12 * math.sin(f * 0.35), 0.1 * math.sin(f * 0.27))
# lift: arm comes up to the chin, tilts, comes down
rot(cs_l, 91, -0.75, -0.35, 0); rot(ce_l, 91, -1.0, 0, 0)
rot(cs_l, 102, -0.85, -0.7, 0); rot(ce_l, 102, -2.45, 0, 0)
rot(cs_l, 111, -0.9, -0.7, 0); rot(ce_l, 111, -2.55, 0, 0)
rot(cs_l, 124, -0.75, -0.3, 0); rot(ce_l, 124, -1.0, 0, 0)
rot(cs_l, 180, -0.75, -0.3, 0); rot(ce_l, 180, -1.0, 0, 0)
key(c2, "rotation_euler", 91, (0, 0, 0)); key(c2, "rotation_euler", 104, (0.5, 0, 0))
key(c2, "rotation_euler", 111, (0.6, 0, 0)); key(c2, "rotation_euler", 124, (0, 0, 0))
rot(cs_r, 91, -0.55, 0.25, 0); rot(ce_r, 91, -0.9, 0, 0)
rot(cs_r, 124, -0.55, 0.25, 0)
for f in range(130, 181, 6):  # right hand grips the desk edge, trembling
    rot(cs_r, f, -0.6 + 0.05 * math.sin(f), 0.25, 0)
show_face(col, "sip", 91)
show_face(col, "wide", 121)
show_face(col, "spiral", 146)
breathe(col, 91, 180, amp=0.02, per=12)
# the room goes wrong: objects float up and turn, colours shift
for i, o in enumerate(floaters):
    base = o.location.copy()
    r0 = Vector(o.rotation_euler)
    f0 = 132 + (i * 3) % 18
    key(o, "location", 1, base); key(o, "location", f0, base)
    key(o, "rotation_euler", f0, r0)
    up = random.uniform(0.35, 0.8)
    key(o, "location", 180, base + Vector((random.uniform(-0.15, 0.15), -0.1, up)))
    key(o, "rotation_euler", 180, r0 + Vector((random.uniform(-0.8, 0.8), random.uniform(-0.8, 0.8), random.uniform(-1, 1))))
for p in papers:
    base = p.location.copy()
    key(p, "location", 140, base); key(p, "location", 180, base + Vector((0, 0, random.uniform(0.15, 0.3))))
    key(p, "rotation_euler", 140); p.rotation_euler.x += random.uniform(-0.6, 0.6); key(p, "rotation_euler", 180)
for f in range(140, 181, 4):
    key(SEAL[1], "rotation_euler", f, (0, 0.15 * math.sin(f * 0.3) * ease((f - 140) / 20), 0))
    key(SEAL[0], "location", f, (0.25, 1.58, 2.25 + 0.04 * math.sin(f * 0.4) * ease((f - 140) / 20)))


def colour_shift(mat, cols, frames):
    b = mat.node_tree.nodes["Principled BSDF"]
    for c, f in zip(cols, frames):
        b.inputs["Base Color"].default_value = (*hx(c), 1)
        b.inputs["Base Color"].keyframe_insert("default_value", frame=f)


colour_shift(WALL, ["#d9b07a", "#d9b07a", "#d98aa0", "#9fb27a", "#c88bd0", "#d9b07a"], [1, 128, 142, 156, 170, 181])
colour_shift(PANEL, ["#7c4b2b", "#7c4b2b", "#6a3f6e", "#3f6a55", "#7c4b2b"], [1, 132, 148, 164, 181])
colour_shift(FLOOR, ["#6a4128", "#6a4128", "#4a3a6a", "#6a4128"], [1, 136, 166, 181])
wob = fill_light((0.3, -1.4, 2.4), 0, "#ff7ad0", size=2)[1]
for f, e, c in ((1, 0, "#ff7ad0"), (128, 0, "#ff7ad0"), (145, 140, "#ff7ad0"), (160, 140, "#7affd8"),
                (175, 160, "#c47aff"), (181, 0, "#ff7ad0")):
    wob.energy, wob.color = e, hx(c)
    wob.keyframe_insert("energy", frame=f); wob.keyframe_insert("color", frame=f)
# warm fill for the office sets
fill_light((-0.5, -2.5, 2.8), 260)
fill_light((SX, -2.5, 2.8), 260)

if os.environ.get("HANDDBG"):
    for f in (379, 384, 387, 391):
        scene.frame_set(f)
        print("HANDDBG", f, tuple(round(c, 2) for c in ffile.matrix_world.translation), "SLOT", tuple(round(c, 2) for c in SLOT))
# ---------------------------------------------------------------- render setup
r = scene.render
r.engine = "BLENDER_EEVEE"
r.resolution_x, r.resolution_y, r.resolution_percentage = RES, RES * 16 // 9, 100
r.fps = 30
scene.frame_start, scene.frame_end = 1, LAST
scene.eevee.taa_render_samples = SAMPLES
scene.eevee.use_shadows = True
r.use_motion_blur = True
r.motion_blur_shutter = 0.35
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
os.makedirs(OUT, exist_ok=True)
r.image_settings.file_format = "JPEG"
r.image_settings.quality = 93


def cam_for(f):
    c = CAMS[0][1]
    for f0, co in CAMS:
        if f >= f0:
            c = co
    return c


if STILLS:
    import time
    for f in [int(x) for x in STILLS.split(",")]:
        t = time.time()
        scene.frame_set(f)
        scene.camera = cam_for(f)
        r.filepath = os.path.join(OUT, f"still_{f:04d}.jpg")
        bpy.ops.render.render(write_still=True)
        print(f"STILL {f} {time.time() - t:.1f}s")
else:
    import time
    t = time.time()
    scene.frame_start, scene.frame_end = START, END
    scene.camera = cam_for(START)
    r.filepath = os.path.join(OUT, "frames", "f_")
    bpy.ops.render.render(animation=True)
    print(f"ANIM {START}-{END} {time.time() - t:.1f}s  {(time.time() - t) / (END - START + 1):.2f}s/frame")
