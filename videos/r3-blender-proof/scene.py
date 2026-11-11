"""History Outscaled 3D proof scene: Crassus buys the burning houses of Rome.

Everything here is built by code: no AI video, no Higgsfield credits.
  blender -b -P scene.py -- --stills 1,60,104,130,170,200,265 --res 540
  blender -b -P scene.py -- --start 1 --end 270 --res 720      (frames to out/frames)
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg("--out", os.path.join(HERE, "out"))
RES = int(arg("--res", "720"))
START, END = int(arg("--start", "1")), int(arg("--end", "270"))
STILLS = arg("--stills")
SAMPLES = int(arg("--samples", "24"))
FONT = arg("--font", "/System/Library/Fonts/Supplemental/Arial Black.ttf")
LAST = 270
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection


# ---------------------------------------------------------------- helpers
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hx(h):
    h = h.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def M(name, hexcol, rough=0.85, spec=0.15, emit=0.0, emit_hex=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*hx(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if emit > 0:
        b.inputs["Emission Color"].default_value = (*hx(emit_hex or hexcol), 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def link(o, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), mat=None, smooth=True, la=None):
    COL.objects.link(o)
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    if parent:
        o.parent = parent
    if o.type == "MESH":
        if mat:
            o.data.materials.append(mat)
        if smooth:
            for p in o.data.polygons:
                p.use_smooth = True
            o.data.set_sharp_from_angle(angle=math.radians(40))
    if la:
        o.lineart.usage = la
    return o


def from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def empty(name, **kw):
    return link(bpy.data.objects.new(name, None), **kw)


def sphere(name, r=1.0, seg=28, rings=14, **kw):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return link(from_bm(name, bm), **kw)


def ico(name, r=1.0, sub=2, **kw):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return link(from_bm(name, bm), **kw)


def box(name, size, bevel=0.03, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES", profile=0.5)
    return link(from_bm(name, bm), **kw)


def cyl(name, r, depth, seg=20, r2=None, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    return link(from_bm(name, bm), **kw)


def limb(name, p0, p1, r, mat, parent):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    o = cyl(name, r, d.length, seg=12, parent=parent, loc=(p0 + p1) / 2, mat=mat)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def torus(name, R, r, **kw):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=32, minor_segments=10)
    o = bpy.context.active_object
    o.name = name
    COL.objects.unlink(o) if o.name in COL.objects else None
    for c in list(o.users_collection):
        c.objects.unlink(o)
    return link(o, **kw)


def key(o, path, frame, value=None):
    if value is not None:
        setattr(o, path, value)
    o.keyframe_insert(path, frame=frame)


# ---------------------------------------------------------------- characters
LIMB = None
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
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.35
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.9
    m.use_transparent_shadow = True
    FACE_MATS[expr] = m
    return m


def face_patch(name, R, expr, parent):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=R * 1.012)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.30 * R], context="VERTS")
    uv = bm.loops.layers.uv.new("UV")
    k = 0.92 * R
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (0.5 + l.vert.co.x / (2 * k), 0.5 + l.vert.co.z / (2 * k))
    return link(from_bm(name, bm), parent=parent, mat=face_mat(expr), la="EXCLUDE")


def hair_cap(name, R, mat, parent, front=0.10, slope=0.35):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=R * 1.05)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < front * R / 0.3 + (-v.co.y) * slope], context="VERTS")
    return link(from_bm(name, bm), parent=parent, mat=mat)


def character(name, tunic, hair=None, faces=("bored",), loc=(0, 0, 0), rz=0.0, s=1.0, skin="#f6f3ec"):
    global LIMB
    LIMB = LIMB or M("limb", "#1b1920", rough=0.6, spec=0.3)
    root = empty(name, loc=loc, rot=(0, 0, rz), scale=(s, s, s))
    body = sphere(name + "_body", 1.0, parent=root, loc=(0, 0, 0.95), scale=(0.27, 0.22, 0.40), mat=tunic)
    for sx in (-1, 1):
        limb(name + "_leg", (sx * 0.10, 0, 0.62), (sx * 0.10, 0, 0.07), 0.03, LIMB, root)
        sphere(name + "_shoe", 1.0, seg=16, rings=8, parent=root, loc=(sx * 0.10, -0.05, 0.055),
               scale=(0.085, 0.14, 0.055), mat=LIMB)
    neck = empty(name + "_neck", parent=root, loc=(0, 0, 1.33))
    head = sphere(name + "_head", 0.30, seg=40, rings=20, parent=neck, loc=(0, 0, 0.27),
                  mat=M("skin_" + skin, skin, rough=0.55, spec=0.3))
    fp = {f: face_patch(name + "_face_" + f, 0.30, f, head) for f in faces}
    for i, f in enumerate(faces):
        fp[f].hide_render = i != 0
    if hair:
        hair_cap(name + "_hair", 0.30, hair, head)
    arms = {}
    for side, sx in (("L", -1), ("R", 1)):
        S = empty(name + "_sh" + side, parent=root, loc=(sx * 0.25, 0, 1.16))
        limb(name + "_ua" + side, (0, 0, 0), (0, 0, -0.30), 0.028, LIMB, S)
        E = empty(name + "_el" + side, parent=S, loc=(0, 0, -0.30))
        limb(name + "_fa" + side, (0, 0, 0), (0, 0, -0.27), 0.028, LIMB, E)
        H = sphere(name + "_hand" + side, 0.062, seg=16, rings=8, parent=E, loc=(0, 0, -0.30), mat=LIMB)
        S.rotation_euler = (0, -sx * 0.22, 0)
        arms[side] = (S, E, H)
    return dict(root=root, body=body, neck=neck, head=head, faces=fp, arms=arms, base=Vector(loc))


def show_face(ch, expr, frame):
    """Swap the visible expression at `frame` (boolean keys are stepped)."""
    for f, o in ch["faces"].items():
        key(o, "hide_render", frame - 1)
        key(o, "hide_render", frame, f != expr)


def bob(ch, amp=0.03, speed=0.26, phase=0.0, f0=1, f1=LAST):
    for f in range(f0, f1 + 1, 5):
        z = ch["base"].z + amp * abs(math.sin(f * speed + phase))
        key(ch["root"], "location", f, (ch["base"].x, ch["base"].y, z))


# ---------------------------------------------------------------- city
ROOF = None
WIN_DARK = None
WIN_LIT = None
BUILDINGS = []


def insula(name, x, y, w, d, floors, wall_hex, lit=0.3, street_side=0):
    global ROOF, WIN_DARK, WIN_LIT
    WIN_DARK = WIN_DARK or M("win_dark", "#241a3a", rough=0.4, spec=0.5)
    WIN_LIT = WIN_LIT or M("win_lit", "#ffd27a", emit=1.8, emit_hex="#ffc45c")
    h = floors * 1.5 + 0.5
    root = empty(name, loc=(x, y, 0))
    wall = bpy.data.materials.new(name + "_wall")
    wb = wall.node_tree.nodes["Principled BSDF"]
    wb.inputs["Base Color"].default_value = (*hx(wall_hex), 1)
    wb.inputs["Roughness"].default_value = 0.9
    roofm = bpy.data.materials.new(name + "_roof")
    rb = roofm.node_tree.nodes["Principled BSDF"]
    rb.inputs["Base Color"].default_value = (*hx("#c4552d"), 1)
    rb.inputs["Roughness"].default_value = 0.8
    box(name + "_b", (w, d, h), bevel=0.07, parent=root, loc=(0, 0, h / 2), mat=wall)
    box(name + "_r", (w + 0.5, d + 0.5, 0.24), bevel=0.05, parent=root, loc=(0, 0, h + 0.12), mat=roofm)
    box(name + "_r2", (w * 0.55, d * 0.55, 0.5), bevel=0.05, parent=root, loc=(0, 0, h + 0.45), mat=roofm)
    bm_l, bm_d = bmesh.new(), bmesh.new()

    def win(loc, size):
        bm = bm_l if random.random() < lit else bm_d
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((*size, 1)))

    cols_x, cols_y = max(2, int(w // 1.25)), max(2, int(d // 1.25))
    for fl in range(floors):
        z = 0.5 + fl * 1.5 + 0.8
        for c in range(cols_x):
            xx = (c - (cols_x - 1) / 2) * (w / cols_x)
            if fl == 0 and c == cols_x // 2:
                bmesh.ops.create_cube(bm_d, size=1, matrix=Matrix.Translation((xx, -d / 2 - 0.02, 0.75)) @ Matrix.Diagonal((0.8, 0.1, 1.5, 1)))
            else:
                win((xx, -d / 2 - 0.02, z), (0.5, 0.1, 0.72))
        if street_side:
            for c in range(cols_y):
                yy = (c - (cols_y - 1) / 2) * (d / cols_y)
                win((street_side * (w / 2 + 0.02), yy, z), (0.1, 0.5, 0.72))
    link(from_bm(name + "_wl", bm_l), parent=root, mat=WIN_LIT, smooth=False)
    link(from_bm(name + "_wd", bm_d), parent=root, mat=WIN_DARK, smooth=False)
    b = dict(root=root, wall=wb, roof=rb, h=h, x=x, y=y, w=w, d=d)
    BUILDINGS.append(b)
    return b


def cypress(x, y, h=3.2):
    t = M("trunk", "#4a2f22")
    g = M("cypress", "#1f6b4a", rough=0.9)
    cyl("trunk", 0.09, 0.7, seg=8, loc=(x, y, 0.35), mat=t)
    cyl("cyp", 0.55, h, seg=10, r2=0.02, loc=(x, y, 0.7 + h / 2), mat=g)


def torch(x, y, z=2.2):
    cyl("torch_pole", 0.04, z, seg=8, loc=(x, y, z / 2), mat=M("iron", "#2a2530", rough=0.5))
    ico("torch_fire", 0.13, loc=(x, y, z + 0.1), mat=M("torch", "#ffb347", emit=5.0), la="EXCLUDE")
    l = bpy.data.lights.new("torch_l", "POINT")
    l.energy, l.color, l.shadow_soft_size = 90, hx("#ffad5a"), 0.3
    link(bpy.data.objects.new("torch_l", l), loc=(x, y, z + 0.2))


# ground
ground_m = bpy.data.materials.new("ground")
gnt = ground_m.node_tree
gb = gnt.nodes["Principled BSDF"]
brick = gnt.nodes.new("ShaderNodeTexBrick")
tc = gnt.nodes.new("ShaderNodeTexCoord")
gnt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
brick.inputs["Color1"].default_value = (*hx("#3d316f"), 1)
brick.inputs["Color2"].default_value = (*hx("#483a82"), 1)
brick.inputs["Mortar"].default_value = (*hx("#2a2152"), 1)
brick.inputs["Scale"].default_value = 1.6
brick.inputs["Mortar Size"].default_value = 0.012
gnt.links.new(brick.outputs["Color"], gb.inputs["Base Color"])
gb.inputs["Roughness"].default_value = 0.75
g = box("ground", (260, 260, 0.2), bevel=0, loc=(0, 40, -0.1), mat=ground_m, smooth=False, la="EXCLUDE")

# the city grid: 6 columns x 7 rows of apartment blocks
WALLS = ["#e8b98a", "#d9a06f", "#f0cfa3", "#c98d6b", "#e6c29a", "#d4a47c"]
XS = [-17.5, -11.5, -5.5, 5.5, 11.5, 17.5]
FIRE_B = None
for ri, y in enumerate(range(0, 42, 6)):
    for ci, x in enumerate(XS):
        burning = (x == 5.5 and y == 6)
        floors = 6 if burning else random.choice([3, 4, 4, 5])
        side = -1 if x == 5.5 else (1 if x == -5.5 else 0)
        b = insula(f"ins_{ri}_{ci}", x, y, 5.0, 5.0, floors, random.choice(WALLS),
                   lit=0.15 if burning else 0.35, street_side=side)
        if burning:
            FIRE_B = b

for y in (-3, 3, 9, 15, 21, 27, 33):
    cypress(-2.7, y, random.uniform(2.6, 3.6))
    if y != 9 and y != 3:
        cypress(2.7, y, random.uniform(2.6, 3.6))
for y in (-1.5, 10.5, 22.5):
    torch(-2.3, y)
    torch(2.3, y + 6)

# sky: stars and a moon
star_m = M("star", "#ffffff", emit=6.0)
for i in range(140):
    a, e = random.uniform(-1.2, 1.2), random.uniform(0.05, 1.0)
    R = 190
    ico("star", random.uniform(0.25, 0.6), sub=1, la="EXCLUDE", mat=star_m,
        loc=(R * math.sin(a) * math.cos(e), R * math.cos(a) * math.cos(e), R * math.sin(e)))
sphere("moon", 9, la="EXCLUDE", loc=(-48, 170, 78), mat=M("moon", "#f3ecd0", emit=2.2))

# ---------------------------------------------------------------- fire
fx, fy, fh = FIRE_B["x"], FIRE_B["y"], FIRE_B["h"]
face_x = fx - 2.5
emitters = []
for fl in (3, 4, 5):
    z = 0.5 + fl * 1.5 + 1.0
    for yy in (-1.9, -0.6, 0.6, 1.9):
        emitters.append((face_x - 0.15, fy + yy, z))
for i in range(7):
    emitters.append((fx + random.uniform(-2.2, 2.0), fy + random.uniform(-2.2, 2.2), fh + 0.5))
for yy in (-1.2, 0.8):  # front face, toward camera
    emitters.append((fx + yy, fy - 2.65, 0.5 + 4 * 1.5 + 1.0))

FLAME = [M("flame_r", "#ff3d14", emit=3.2), M("flame_o", "#ff8412", emit=4.2), M("flame_y", "#ffd23f", emit=5.5)]
SMOKE = M("smoke", "#51477a", rough=1.0, spec=0.0)


def puff(name):
    bm = bmesh.new()
    for k in range(5):
        off = Vector((random.uniform(-0.7, 0.7), random.uniform(-0.7, 0.7), random.uniform(-0.5, 0.5)))
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=random.uniform(0.55, 1.0),
                                  matrix=Matrix.Translation(off))
    o = link(from_bm(name, bm), mat=SMOKE, la="EXCLUDE")
    o.visible_shadow = False
    return o


def looped(o, origin, rise, drift, s0, period, phase, fade_to=0.03):
    f = 1 - phase
    while f <= LAST:
        key(o, "location", f, origin)
        key(o, "scale", f, (0.05,) * 3)
        key(o, "scale", f + 3, (s0,) * 3)
        mid = (origin[0] + drift[0] * 0.5, origin[1] + drift[1] * 0.5, origin[2] + rise * 0.55)
        key(o, "location", f + period // 2, mid)
        key(o, "scale", f + period // 2, (s0 * 0.75,) * 3)
        top = (origin[0] + drift[0], origin[1] + drift[1], origin[2] + rise)
        key(o, "location", f + period - 1, top)
        key(o, "scale", f + period - 1, (fade_to,) * 3)
        f += period


for e in emitters:
    for j in range(4):
        o = ico("flame", 1.0, sub=2, mat=FLAME[j % 3], la="EXCLUDE")
        o.visible_shadow = False
        looped(o, (e[0] + random.uniform(-0.25, 0.25), e[1] + random.uniform(-0.3, 0.3), e[2]),
               rise=random.uniform(1.3, 2.4), drift=(random.uniform(-0.7, 0.1), random.uniform(-0.3, 0.3)),
               s0=random.uniform(0.38, 0.7) * (1.0 - 0.18 * (j % 3)), period=random.randint(16, 26),
               phase=random.randint(0, 25))
    s = puff("smoke")
    looped(s, (e[0], e[1], e[2] + 1.2), rise=random.uniform(4.5, 7.5),
           drift=(random.uniform(-2.5, -0.5), random.uniform(-0.6, 0.6)),
           s0=random.uniform(0.55, 0.95), period=random.randint(50, 75), phase=random.randint(0, 70), fade_to=0.4)
SPARK = M("spark", "#ffe08a", emit=14.0)
for i in range(40):
    e = random.choice(emitters)
    o = ico("spark", 1.0, sub=1, mat=SPARK, la="EXCLUDE")
    o.visible_shadow = False
    looped(o, e, rise=random.uniform(3, 6.5), drift=(random.uniform(-3.5, 0.5), random.uniform(-1.5, 1.5)),
           s0=random.uniform(0.035, 0.07), period=random.randint(24, 40), phase=random.randint(0, 40), fade_to=0.01)

fire_l = bpy.data.lights.new("fire_l", "POINT")
fire_l.color, fire_l.shadow_soft_size = hx("#ff8a3c"), 1.2
fl_o = link(bpy.data.objects.new("fire_l", fire_l), loc=(face_x - 1.4, fy - 0.5, 7.5))
for f in range(1, LAST + 1, 3):
    fire_l.energy = random.uniform(2200, 3600)
    fire_l.keyframe_insert("energy", frame=f)

# ---------------------------------------------------------------- cast
TOGA = M("toga", "#f3eee2", rough=0.8)
PURPLE = M("purple", "#7a2a9a", rough=0.6)
GOLD = M("gold", "#ffc93c", rough=0.3, spec=0.8, emit=0.6, emit_hex="#ffb300")
HAIR_D = M("hair_dark", "#3a2a22", rough=0.7)
HAIR_B = M("hair_brown", "#8a5a34", rough=0.7)

crassus = character("crassus", TOGA, hair=HAIR_D, faces=("smug", "grin"), loc=(1.2, 2.0, 0), rz=0.25)
torus("sash", 0.265, 0.05, parent=crassus["root"], loc=(0, 0, 0.98), rot=(0.25, 0.95, 0), scale=(1, 0.86, 1), mat=PURPLE)
torus("laurel", 0.285, 0.035, parent=crassus["head"], loc=(0, 0.02, 0.10), rot=(-0.28, 0, 0), mat=GOLD)
S, E, H = crassus["arms"]["R"]
bag = sphere("bag", 1.0, parent=E, loc=(0, 0, -0.46), scale=(0.15, 0.15, 0.17), mat=M("bag", "#9a6a3a", rough=0.9))
cyl("bag_neck", 0.05, 0.09, seg=10, r2=0.075, parent=E, loc=(0, 0, -0.33), mat=M("bag", "#9a6a3a"))
ico("bag_coin", 0.05, sub=1, parent=E, loc=(0, -0.13, -0.46), scale=(1, 0.3, 1), mat=GOLD)

owner = character("owner", M("tunic_teal", "#2aa7a0"), hair=HAIR_B, faces=("panic",), loc=(2.75, 3.3, 0), rz=-0.5)

crew = []
for i, (x, y) in enumerate([(-1.5, 4.2), (-0.75, 4.9), (-2.2, 5.1)]):
    c = character(f"slave{i}", M("tunic_grey", "#8d8aa3"), hair=HAIR_D if i % 2 else HAIR_B,
                  faces=("bored",), loc=(x, y, 0), rz=0.9, s=0.94)
    Sx, Ex, Hx = c["arms"]["L"]
    cyl("bucket", 0.085, 0.2, seg=14, r2=0.115, parent=Ex, loc=(0, 0, -0.44), mat=M("wood", "#a8743f"))
    crew.append(c)

# idle life
bob(crassus, amp=0.02, speed=0.2)
bob(owner, amp=0.16, speed=0.55)
for i, c in enumerate(crew):
    bob(c, amp=0.02, speed=0.18, phase=i * 1.3)

# the owner panics: arms flail the whole time
for side, sx in (("L", -1), ("R", 1)):
    Sx, Ex, Hx = owner["arms"][side]
    for f in range(1, LAST + 1, 4):
        a = 2.5 + 0.45 * math.sin(f * 0.8 + sx)
        key(Sx, "rotation_euler", f, (0, -sx * a, 0))
        key(Ex, "rotation_euler", f, (0, -sx * (0.3 + 0.3 * math.sin(f * 0.9)), 0))
for f in range(1, LAST + 1, 6):
    key(owner["neck"], "rotation_euler", f, (0, 0, 0.5 * math.sin(f * 0.35)))

# Crassus: calm, then lifts the money bag and grins (shot B)
key(S, "rotation_euler", 112, (0, -0.22, 0))
key(S, "rotation_euler", 126, (0, -2.6, 0))
key(S, "rotation_euler", 131, (0, -2.4, 0))
key(E, "rotation_euler", 112, (0, 0, 0))
key(E, "rotation_euler", 126, (0, 0.5, 0))
for f in range(132, 181, 5):
    key(E, "rotation_euler", f, (0, 0.5 + 0.22 * math.sin(f * 0.9), 0))
show_face(crassus, "grin", 124)
key(crassus["neck"], "rotation_euler", 106, (0, 0, 0))
key(crassus["neck"], "rotation_euler", 124, (0.0, 0, -0.12))
key(crassus["neck"], "rotation_euler", 130, (-0.18, 0, 0.1))

# coins rain on him in shot B
COIN = M("coin", "#ffd54a", rough=0.25, spec=0.9, emit=1.2, emit_hex="#ffb300")
for i in range(70):
    c = cyl("coin", 0.07, 0.018, seg=14, mat=COIN)
    x, y = 1.2 + random.uniform(-1.3, 1.1), 2.0 + random.uniform(-1.6, 1.2)
    f0 = 118 + random.randint(0, 46)
    z0 = random.uniform(3.6, 5.0)
    key(c, "hide_render", 1, True)
    key(c, "hide_render", f0, False)
    r0 = (random.uniform(0, 6), random.uniform(0, 6), random.uniform(0, 6))
    key(c, "location", f0, (x, y, z0)); key(c, "rotation_euler", f0, r0)
    key(c, "location", f0 + 7, (x, y, z0 * 0.72))
    key(c, "location", f0 + 13, (x, y, 0.03)); key(c, "rotation_euler", f0 + 13, (r0[0] + 9, r0[1] + 7, r0[2]))
    key(c, "location", f0 + 17, (x + 0.05, y, 0.22))
    key(c, "location", f0 + 21, (x + 0.08, y, 0.012)); key(c, "rotation_euler", f0 + 21, (0, 0, r0[2]))
    key(c, "hide_render", 181, True)

# shot C: Crassus buys block after block: each one turns gold with a pop
order = sorted(BUILDINGS, key=lambda b: (b["x"] - fx) ** 2 + (b["y"] - fy) ** 2)
GOLD_WALL, GOLD_ROOF = (*hx("#ffcf40"), 1), (*hx("#ffa51e"), 1)
for i, b in enumerate(order):
    if b is FIRE_B:
        continue
    f = 194 + int(i * 1.25)
    for node, target in ((b["wall"], GOLD_WALL), (b["roof"], GOLD_ROOF)):
        node.inputs["Base Color"].keyframe_insert("default_value", frame=f)
        node.inputs["Base Color"].default_value = target
        node.inputs["Base Color"].keyframe_insert("default_value", frame=f + 3)
        node.inputs["Emission Color"].default_value = target
        node.inputs["Emission Strength"].default_value = 0.0
        node.inputs["Emission Strength"].keyframe_insert("default_value", frame=f)
        node.inputs["Emission Strength"].default_value = 0.35
        node.inputs["Emission Strength"].keyframe_insert("default_value", frame=f + 3)
    r = b["root"]
    key(r, "scale", f, (1, 1, 1)); key(r, "scale", f + 3, (1.05, 1.05, 1.22)); key(r, "scale", f + 8, (1, 1, 1))

# big number over the city
cu = bpy.data.curves.new("talents", "FONT")
cu.body = "7,100 TALENTS"
cu.align_x, cu.align_y = "CENTER", "CENTER"
cu.size, cu.extrude, cu.bevel_depth = 5.0, 0.6, 0.07
if os.path.exists(FONT):
    cu.font = bpy.data.fonts.load(FONT)
txt = link(bpy.data.objects.new("talents", cu), loc=(0, 42, 12.5), rot=(math.radians(71), 0, 0))
cu.materials.append(M("txt_gold", "#fff4c8", emit=1.1, emit_hex="#ffd24a"))
key(txt, "scale", 1, (0, 0, 0)); key(txt, "scale", 224, (0, 0, 0))
key(txt, "scale", 232, (1.18, 1.18, 1.18)); key(txt, "scale", 238, (1, 1, 1))

# ---------------------------------------------------------------- lights
world = bpy.data.worlds.new("sky")
scene.world = world
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*hx("#2a1a66"), 1)
bg.inputs["Strength"].default_value = 1.0

moon_l = bpy.data.lights.new("moonlight", "SUN")
moon_l.energy, moon_l.color, moon_l.angle = 2.6, hx("#a8b8ff"), math.radians(4)
link(bpy.data.objects.new("moonlight", moon_l), rot=(math.radians(52), 0, math.radians(-28)))
keyl = bpy.data.lights.new("key", "AREA")
keyl.energy, keyl.color, keyl.size = 320, hx("#ffe2c0"), 3.0
ko = link(bpy.data.objects.new("key", keyl), loc=(-1.8, -2.2, 4.0))
kt = empty("key_t", loc=(1.2, 2.0, 1.3))
kc = ko.constraints.new("TRACK_TO"); kc.target = kt

# ---------------------------------------------------------------- cameras, one per shot
def camera(name, lens, f0, f1, p0, p1, t0, t1, fstop=None):
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_end = lens, 800
    co = link(bpy.data.objects.new(name, cd), loc=p0)
    tg = empty(name + "_t", loc=t0)
    c = co.constraints.new("TRACK_TO"); c.target = tg
    key(co, "location", f0, p0); key(co, "location", f1, p1)
    key(tg, "location", f0, t0); key(tg, "location", f1, t1)
    if fstop:
        cd.dof.use_dof, cd.dof.focus_object, cd.dof.aperture_fstop = True, tg, fstop
    m = scene.timeline_markers.new(name, frame=f0)
    m.camera = co
    return co


CAMS = [
    (1, camera("camA", 30, 1, 105, (-0.9, -15.5, 7.0), (0.75, -2.9, 1.5), (3.6, 6.0, 8.0), (1.25, 2.0, 1.4), fstop=4.0)),
    (106, camera("camB", 42, 106, 180, (0.25, -1.5, 1.42), (0.5, -0.85, 1.5), (1.3, 2.0, 1.42), (1.3, 2.0, 1.5), fstop=1.8)),
    (181, camera("camC", 24, 181, 270, (2.2, -9.0, 6.5), (0.0, -15.0, 31.0), (4.0, 6.0, 6.0), (0.0, 17.0, 0.0))),
]

# ---------------------------------------------------------------- ink outlines
gp = bpy.data.grease_pencils.new("ink")
gobj = link(bpy.data.objects.new("ink", gp))
layer = gp.layers.new("Lines")
layer.frames.new(1)
ink = bpy.data.materials.new("ink")
bpy.data.materials.create_gpencil_data(ink)
ink.grease_pencil.color = (0.03, 0.02, 0.05, 1)
gp.materials.append(ink)
la = gobj.modifiers.new("lineart", "LINEART")
la.source_type, la.target_layer, la.target_material = "SCENE", "Lines", ink
la.radius = float(arg("--ink", "0.012"))
la.use_crease, la.crease_threshold = True, math.radians(140)
la.use_intersection = False
la.use_loose = False
gobj.show_in_front = True

# ---------------------------------------------------------------- render setup
r = scene.render
r.engine = "BLENDER_EEVEE"
r.resolution_x, r.resolution_y, r.resolution_percentage = RES, RES * 16 // 9, 100
r.fps = 30
scene.frame_start, scene.frame_end = 1, LAST
scene.eevee.taa_render_samples = SAMPLES
scene.eevee.use_shadows = True
r.use_motion_blur = True
r.motion_blur_shutter = 0.4
scene.view_settings.view_transform = "Standard"

try:  # bloom
    ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
    scene.compositing_node_group = ng
    rl = ng.nodes.new("CompositorNodeRLayers"); rl.scene = scene
    gl = ng.nodes.new("CompositorNodeGlare")
    gl.inputs["Type"].default_value = "Bloom"
    gl.inputs["Threshold"].default_value = 1.5
    gl.inputs["Strength"].default_value = 0.45
    gl.inputs["Size"].default_value = 0.55
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs["Image"], go.inputs["Image"])
    r.use_compositing = True
except Exception as ex:  # keep rendering without bloom
    print("BLOOM OFF:", ex)

os.makedirs(OUT, exist_ok=True)
r.image_settings.file_format = "JPEG"
r.image_settings.quality = 93


def cam_for(f):
    c = CAMS[0][1]
    for f0, co in CAMS:
        if f >= f0:
            c = co
    return c


if "--debug" in argv:
    pass
elif STILLS:
    import time
    for f in [int(x) for x in STILLS.split(",")]:
        t = time.time()
        scene.frame_set(f)
        scene.camera = cam_for(f)
        r.filepath = os.path.join(OUT, f"still_{f:04d}.jpg")
        bpy.ops.render.render(write_still=True)
        print(f"STILL {f} {time.time() - t:.1f}s")
elif arg("--save"):
    scene.camera = CAMS[0][1]
    bpy.ops.wm.save_as_mainfile(filepath=arg("--save"))
else:
    import time
    t = time.time()
    scene.frame_start, scene.frame_end = START, END
    scene.camera = cam_for(START)
    r.filepath = os.path.join(OUT, "frames", "f_")
    bpy.ops.render.render(animation=True)
    print(f"ANIM {START}-{END} {time.time() - t:.1f}s  {(time.time() - t) / (END - START + 1):.2f}s/frame")

if "--debug" in argv:
    scene.frame_set(104); scene.camera = cam_for(104)
    dg = bpy.context.evaluated_depsgraph_get()
    eo = gobj.evaluated_get(dg)
    for L in eo.data.layers:
        fr = L.get_frame_at(104) or L.current_frame()
        d = fr.drawing if fr else None
        print("INKDBG layer", L.name, "frame", fr, "drawing", d, [a for a in dir(d) if not a.startswith("_")][:30] if d else None)
        if d:
            try: print("INKDBG strokes", len(d.strokes))
            except Exception as e: print("INKDBG err", e)
    print("INKDBG mod", la.radius, la.source_type, la.target_layer, la.target_material, la.show_render, "gp mats", [m.name for m in gp.materials], "hide", gobj.hide_render)
