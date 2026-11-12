"""History Outscaled r5: MKUltra 58 s vertical short, painted-set projection + rigged low-poly characters.

  blender -b -P scene.py -- --start 1 --end 1740 --res 1080 --samples 16 --out out
  blender -b -P scene.py -- --stills --res 540 --samples 8 --out out          (one still per shot, middle frame)
  blender -b -P scene.py -- --frames 400,410 --shots 8 --res 540 --out out     (extra test frames to out/test)

Everything is data driven: SHOTS (bottom of the file) lists start/end seconds, plate, camera, and actions.
All paths are relative to this file. Blender 5.2 (EEVEE), no addons, no network.
"""
import bpy, bmesh, math, random, sys, os, json, time
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg("--out", os.path.join(HERE, "out"))
RES = int(arg("--res", "1080"))
START, END = int(arg("--start", "1")), int(arg("--end", "1740"))
SAMPLES = int(arg("--samples", "16"))
STILLS = "--stills" in argv
FRAMES = [int(x) for x in arg("--frames", "").split(",") if x]
ONLY = [int(x) for x in arg("--shots", "").split(",") if x]
FPS = 30
LAST = 1740
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
PREF = bpy.context.preferences.edit


def F(t):
    return int(round(t * FPS)) + 1


# ---------------------------------------------------------------- colour + keyframe helpers
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hx(h):
    h = h.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


REG = {}        # id name -> (id, {(data_path, idx): {frame: interp}})
LINEAR_IDS = []  # ids whose keys are all linear (armatures)


def _reg(obj, path, idx, frame, interp):
    idd = obj.id_data
    full = path if obj == idd else obj.path_from_id(path)
    ent = REG.setdefault((type(idd).__name__, idd.name_full), (idd, {}))
    ent[1].setdefault((full, idx), {})[int(frame)] = interp


def key(obj, path, frame, value, idx=-1, interp="BEZIER"):
    PREF.keyframe_new_interpolation_type = interp
    if idx == -1:
        setattr(obj, path, value)
    else:
        getattr(obj, path)[idx] = value
    obj.keyframe_insert(path, index=idx, frame=frame)
    _reg(obj, path, idx, frame, interp)


def skey(sock, frame, value, interp="LINEAR"):
    PREF.keyframe_new_interpolation_type = interp
    sock.default_value = value
    sock.keyframe_insert("default_value", frame=frame)
    _reg(sock, "default_value", -1, frame, interp)


def all_fcurves(act):
    try:
        return list(act.fcurves)
    except Exception:
        out = []
        for L in act.layers:
            for st in L.strips:
                for cb in st.channelbags:
                    out += list(cb.fcurves)
        return out


def finalize_interp():
    n = 0
    for ident, (idd, m) in REG.items():
        ad = idd.animation_data
        if not ad or not ad.action:
            continue
        for fc in all_fcurves(ad.action):
            fm = m.get((fc.data_path, fc.array_index))
            fa = m.get((fc.data_path, -1))
            for kp in fc.keyframe_points:
                fr = int(round(kp.co[0]))
                ip = (fm or {}).get(fr) or (fa or {}).get(fr)
                if ip:
                    kp.interpolation = ip
                    n += 1
    for idd in LINEAR_IDS:
        ad = idd.animation_data
        if ad and ad.action:
            for fc in all_fcurves(ad.action):
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
    print("INTERP fixed", n)


def sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- materials
_img = {}


def load_img(rel):
    p = os.path.join(HERE, rel)
    if p not in _img:
        _img[p] = bpy.data.images.load(p, check_existing=True)
    return _img[p]


def new_mat(name, blended=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    if blended:
        m.surface_render_method = "BLENDED"
    return m


def bsdf(m):
    return m.node_tree.nodes["Principled BSDF"]


def M(name, hexcol, rough=0.85, spec=0.15, emit=0.0, emit_hex=None, alpha=1.0, blended=False):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = new_mat(name, blended or alpha < 1)
    b = bsdf(m)
    b.inputs["Base Color"].default_value = (*hx(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Alpha"].default_value = alpha
    if emit > 0:
        b.inputs["Emission Color"].default_value = (*hx(emit_hex or hexcol), 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def emit_mat(name, hexcol, strength, alpha=1.0):
    m = new_mat(name, alpha < 1)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*hx(hexcol), 1)
    em.inputs["Strength"].default_value = strength
    if alpha < 1:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader")
        mx.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
    else:
        nt.links.new(em.outputs[0], out.inputs[0])
    return m


def card_mat(rel, emit=0.6):
    k = f"card:{rel}:{emit}"
    m = bpy.data.materials.get(k)
    if m:
        return m
    m = new_mat(k, True)
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes
    out = N.new("ShaderNodeOutputMaterial"); em = N.new("ShaderNodeEmission"); tr = N.new("ShaderNodeBsdfTransparent"); mx = N.new("ShaderNodeMixShader")
    t = N.new("ShaderNodeTexImage")
    t.image = load_img(rel)
    t.extension = "CLIP"
    nt.links.new(t.outputs["Color"], em.inputs["Color"]); nt.links.new(t.outputs["Alpha"], mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs[0])
    em.inputs["Strength"].default_value = emit * 1.25
    return m


def grad_alpha_mat(name, hexcol, strength, mode):
    """blended emissive gradient. mode: blob (radial) | shaft (vertical beam) | noise (grain) | vig (vignette) | flat"""
    m = new_mat(name, True)
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*hx(hexcol), 1)
    em.inputs["Strength"].default_value = strength
    tr = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    uv = N.new("ShaderNodeTexCoord")
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    if mode in ("blob", "vig"):
        mp = N.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (2, 2, 2); mp.inputs["Location"].default_value = (-1, -1, 0)
        g = N.new("ShaderNodeTexGradient"); g.gradient_type = "QUADRATIC_SPHERE"
        nt.links.new(uv.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs[0], g.inputs["Vector"])
        if mode == "blob":
            nt.links.new(g.outputs["Fac"], mx.inputs[0])
        else:  # vignette: dark where gradient is low
            mr = N.new("ShaderNodeMapRange")
            mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 0.55
            mr.inputs["To Min"].default_value = 0.62; mr.inputs["To Max"].default_value = 0.0
            nt.links.new(g.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs[0], mx.inputs[0])
    elif mode == "shaft":
        sp = N.new("ShaderNodeSeparateXYZ")
        nt.links.new(uv.outputs["UV"], sp.inputs[0])
        a = N.new("ShaderNodeMath"); a.operation = "SUBTRACT"; a.inputs[1].default_value = 0.5
        nt.links.new(sp.outputs["X"], a.inputs[0])
        b = N.new("ShaderNodeMath"); b.operation = "ABSOLUTE"
        nt.links.new(a.outputs[0], b.inputs[0])
        c = N.new("ShaderNodeMath"); c.operation = "MULTIPLY"; c.inputs[1].default_value = 2.0
        nt.links.new(b.outputs[0], c.inputs[0])
        d = N.new("ShaderNodeMath"); d.operation = "SUBTRACT"; d.inputs[0].default_value = 1.0
        nt.links.new(c.outputs[0], d.inputs[1])
        e = N.new("ShaderNodeMath"); e.operation = "POWER"; e.inputs[1].default_value = 1.6
        nt.links.new(d.outputs[0], e.inputs[0])
        v = N.new("ShaderNodeMath"); v.operation = "POWER"; v.inputs[1].default_value = 1.3
        nt.links.new(sp.outputs["Y"], v.inputs[0])
        f = N.new("ShaderNodeMath"); f.operation = "MULTIPLY"
        nt.links.new(e.outputs[0], f.inputs[0]); nt.links.new(v.outputs[0], f.inputs[1])
        nt.links.new(f.outputs[0], mx.inputs[0])
    elif mode == "noise":
        nz = N.new("ShaderNodeTexNoise"); nz.noise_dimensions = "4D"
        nz.inputs["Scale"].default_value = 520; nz.inputs["Detail"].default_value = 0.0
        nt.links.new(uv.outputs["UV"], nz.inputs["Vector"])
        dr = nz.inputs["W"].driver_add("default_value").driver
        dr.type = "SCRIPTED"; dr.expression = "frame * 3.77"
        mr = N.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.3; mr.inputs["From Max"].default_value = 0.7
        mr.inputs["To Min"].default_value = 0.02; mr.inputs["To Max"].default_value = 0.5
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        cm = N.new("ShaderNodeCombineXYZ")
        for i in range(3):
            nt.links.new(mr.outputs[0], cm.inputs[i])
        nt.links.new(cm.outputs[0], em.inputs["Color"])
        mx.inputs[0].default_value = 0.06
    else:
        mx.inputs[0].default_value = 1.0
    return m


# ---------------------------------------------------------------- scene objects
CUR = None  # current shot collection


def link(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None, mat=None):
    CUR.objects.link(o)
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    if parent:
        o.parent = parent
    if mat and o.type == "MESH":
        o.data.materials.append(mat)
    return o


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    return link(bpy.data.objects.new(name, None), loc, rot, parent=parent)


def make_quad(name, w, h, plane="xz", tw=None, ox=0, oz=0):
    me = bpy.data.meshes.new(name)
    tw = w if tw is None else tw
    if plane == "xz":  # faces -Y
        vs = [(-w / 2 + ox, 0, -h / 2 + oz), (w / 2 + ox, 0, -h / 2 + oz), (tw / 2 + ox, 0, h / 2 + oz), (-tw / 2 + ox, 0, h / 2 + oz)]
    else:  # xy, faces +Z
        vs = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
    me.from_pydata(vs, [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name="UV")
    for i, uv in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uvl.data[i].uv = uv
    return me


def plane(name, w, h, mat, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, shadow=False, **kw):
    o = link(bpy.data.objects.new(name, make_quad(name, w, h, **kw)), loc, rot, parent=parent, mat=mat)
    o.visible_shadow = shadow
    return o


def bm_obj(name, bm, mat=None, flat=True, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if flat:
        for p in me.polygons:
            p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    return link(o, loc, rot, scale, parent, mat)


def prim(bm, kind, size, off=(0, 0, 0), rot=(0, 0, 0), seg=8, r2=None):
    """add a primitive to bmesh. box size=(x,y,z); cyl size=(radius, height) along z; ico size=r"""
    mat = Matrix.Translation(off) @ Euler(tuple(math.radians(a) for a in rot)).to_matrix().to_4x4()
    if kind == "box":
        v = bmesh.ops.create_cube(bm, size=1.0)["verts"]
        bmesh.ops.scale(bm, vec=size, verts=v)
    elif kind == "cyl":
        v = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=size[0], radius2=size[0] if r2 is None else r2, depth=size[1])["verts"]
    else:
        v = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=size)["verts"]
        if r2:
            bmesh.ops.scale(bm, vec=r2, verts=v)
    bmesh.ops.transform(bm, matrix=mat, verts=v)


def ensure(o, mat):
    if not o.data.materials:
        o.data.materials.append(mat)


# ---------------------------------------------------------------- lights
def light(kind, pos, target, hexcol, energy, size=1.0, spot=60, blend=0.6, shadow=True, name="L"):
    l = bpy.data.lights.new(name, kind)
    l.energy, l.color = energy, hx(hexcol)
    if kind == "AREA":
        l.size = size
    elif kind == "SPOT":
        l.spot_size, l.spot_blend, l.shadow_soft_size = math.radians(spot), blend, size
    elif kind == "POINT":
        l.shadow_soft_size = size
    l.use_shadow = shadow
    o = link(bpy.data.objects.new(name, l), loc=pos)
    if kind != "POINT" and target is not None:
        d = Vector(target) - Vector(pos)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


def flicker(l, f0, f1, base, amp=0.35, step=2):
    for f in range(f0, f1 + 1, step):
        PREF.keyframe_new_interpolation_type = "LINEAR"
        l.data.energy = base * (1 + amp * (random.random() - 0.5) * 2)
        l.data.keyframe_insert("energy", frame=f)
        _reg(l.data, "energy", -1, f, "LINEAR")


# ---------------------------------------------------------------- camera / stage
class Cam:
    def __init__(s, ox, sp):
        s.ox = ox
        s.p0, s.p1 = Vector(sp["p0"]), Vector(sp.get("p1", sp["p0"]))
        s.pit0, s.pit1 = sp.get("pit0", 0), sp.get("pit1", sp.get("pit0", 0))
        s.yaw0, s.yaw1 = sp.get("yaw0", 0), sp.get("yaw1", sp.get("yaw0", 0))
        s.lens = sp.get("lens", 35)
        s.th = 12.0 / s.lens  # tan(vfov/2), sensor height 24

    def pos(s, a):
        return s.p0.lerp(s.p1, a) + Vector((s.ox, 0, 0))

    def mat(s, a):
        pit = s.pit0 + (s.pit1 - s.pit0) * a
        yaw = s.yaw0 + (s.yaw1 - s.yaw0) * a
        r = Euler((math.radians(90 + pit), 0, math.radians(yaw)), "XYZ").to_matrix().to_4x4()
        return Matrix.Translation(s.pos(a)) @ r

    def ray(s, a, u, v):
        m = s.mat(a)
        d = Vector(((u - 0.5) * 2 * s.th * 9 / 16, (0.5 - v) * 2 * s.th, -1.0))
        return m.translation.copy(), (m.to_3x3() @ d).normalized()

    def pt(s, u, v, depth, a=0.0):
        m = s.mat(a)
        return m @ Vector(((u - 0.5) * 2 * s.th * depth * 9 / 16, (0.5 - v) * 2 * s.th * depth, -depth))

    def frame_w(s, depth):
        return 2 * s.th * depth * 9 / 16


class Ctx:
    pass


SHOT_COLS = []
PY = 10.0  # plate plane y (world)


def build_camera(ctx, sh):
    sp = sh["cam"]
    cd = bpy.data.cameras.new(f"cam{sh['id']:02d}")
    cd.sensor_fit, cd.sensor_height, cd.lens = "VERTICAL", 24.0, ctx.cam.lens
    cd.clip_start, cd.clip_end = 0.05, 300
    co = link(bpy.data.objects.new(f"cam{sh['id']:02d}", cd))
    ease = sp.get("ease", "BEZIER")
    for a, f in ((0, ctx.f0), (1, ctx.f1)):
        key(co, "location", f, tuple(ctx.cam.pos(a)), interp=ease)
        key(co, "rotation_euler", f, tuple(ctx.cam.mat(a).to_euler()), interp=ease)
    if sp.get("dof"):
        fd0, fd1, fs = sp["dof"]
        cd.dof.use_dof, cd.dof.aperture_fstop = True, fs
        cd.dof.focus_distance = fd0
        cd.keyframe_insert("dof.focus_distance", frame=ctx.f0) if False else None
        PREF.keyframe_new_interpolation_type = "BEZIER"
        cd.dof.focus_distance = fd0; cd.dof.keyframe_insert("focus_distance", frame=ctx.f0)
        cd.dof.focus_distance = fd1; cd.dof.keyframe_insert("focus_distance", frame=ctx.f1)
    mk = scene.timeline_markers.new(cd.name, frame=ctx.f0)
    mk.camera = co
    ctx.camobj = co
    ctx.hud_depth = min(sp['dof'][0], 4.5) if sp.get('dof') else 3.0
    # overlays: vignette + grain (+ fade / flash) parented to the camera at the focus distance
    gd = min(sp["dof"][0], 4.5) if sp.get("dof") else 3.0
    ctx.hud_depth = gd
    h = 2 * ctx.cam.th * gd * 1.03
    w = h * 9 / 16
    def ov(name, mat, alpha_keys=None):
        o = plane(name, w, h, mat, loc=(0, 0, -gd), parent=co, plane="xy")
        return o
    ov("vig", V_MAT)
    ov("grain", G_MAT)
    if sh.get("fade"):
        fm = emit_mat("fade", "#000000", 1.0, alpha=0.0)
        fo = ov("fade", fm)
        ff = F(sh["t1"]) - 15
        mixn = [n for n in fm.node_tree.nodes if n.type == "MIX_SHADER"][0]
        skey(mixn.inputs[0], ctx.f0, 0.0); skey(mixn.inputs[0], ff, 0.0); skey(mixn.inputs[0], ctx.f1, 1.0)
    ctx.ov_size = (w, h, gd)


def flash_overlay(ctx, times):
    w, h, gd = ctx.ov_size
    fm = emit_mat("flash", "#fff6e0", 1.0, alpha=0.0)
    o = plane("flash", w, h, fm, loc=(0, 0, -gd + 0.01), parent=ctx.camobj, plane="xy")
    mixn = [n for n in fm.node_tree.nodes if n.type == "MIX_SHADER"][0]
    skey(mixn.inputs[0], ctx.f0, 0.0)
    for t in times:
        f = F(t)
        skey(mixn.inputs[0], f - 1, 0.0); skey(mixn.inputs[0], f, 0.16); skey(mixn.inputs[0], f + 2, 0.08); skey(mixn.inputs[0], f + 6, 0.0)


# ---------------------------------------------------------------- plates
def build_plate(ctx, sh):
    img = load_img(f"plates/{sh['plate']}.jpg")
    asp = img.size[0] / img.size[1]
    xs, zs = [], []
    for a in (0, 0.5, 1):
        for u, v in ((0, 0), (1, 0), (0, 1), (1, 1)):
            o, d = ctx.cam.ray(a, u, v)
            t = (PY - o.y) / d.y
            hit = o + d * t
            xs.append(hit.x); zs.append(hit.z)
    pw = max((max(xs) - min(xs)) * 1.12, (max(zs) - min(zs)) * 1.12 * asp)
    ph = pw / asp
    cx, cz = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2
    ctx.plate = dict(cx=cx, cz=cz, pw=pw, ph=ph, asp=asp, img=img)
    ctx.plate_socks = []
    ctx.plate_tint = sh.get("tint")
    ctx.plate_k = sh.get("plate_k", 1.0)
    o = plane("plate", pw, ph, plate_mat(ctx), loc=(cx, PY, cz))
    ctx.plate_obj = o


def plate_mat(ctx, mask=None):
    m = new_mat("plate")
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    t = N.new("ShaderNodeTexImage")
    t.image = ctx.plate["img"]
    col = t.outputs["Color"]
    if ctx.plate_tint:
        mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        mx.inputs[7].default_value = (*hx(ctx.plate_tint), 1)
        nt.links.new(col, mx.inputs[6])
        col = mx.outputs[2]
    nt.links.new(col, em.inputs["Color"])
    em.inputs["Strength"].default_value = ctx.plate_k
    ctx.plate_socks.append(em.inputs["Strength"])
    if mask:
        uvn = N.new("ShaderNodeTexCoord")
        sp = N.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs["UV"], sp.inputs[0])
        u0, u1, v0, v1, fe = mask
        def ramp(src, a, b):
            r = N.new("ShaderNodeMapRange")
            r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = a, b
            r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = 0, 1
            nt.links.new(src, r.inputs["Value"])
            return r.outputs[0]
        # image uv: x from left, y from bottom; mask given in plate coords (pv from top)
        parts = [ramp(sp.outputs["X"], u0, u0 + fe), ramp(sp.outputs["X"], u1, u1 - fe),
                 ramp(sp.outputs["Y"], 1 - v0, 1 - v0 - fe), ramp(sp.outputs["Y"], 1 - v1, 1 - v1 + fe)]
        cur = parts[0]
        for p in parts[1:]:
            mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"
            nt.links.new(cur, mm.inputs[0]); nt.links.new(p, mm.inputs[1])
            cur = mm.outputs[0]
        tr = N.new("ShaderNodeBsdfTransparent"); mix = N.new("ShaderNodeMixShader")
        nt.links.new(cur, mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        m.surface_render_method = "BLENDED"
    else:
        nt.links.new(em.outputs[0], out.inputs[0])
    return m


def pl(ctx, pu, pv):
    p = ctx.plate
    return Vector((p["cx"] + (pu - 0.5) * p["pw"], PY, p["cz"] + (0.5 - pv) * p["ph"]))


def pl_near(ctx, pu, pv, frac):
    c = ctx.cam.pos(0)
    return c + (pl(ctx, pu, pv) - c) * frac


# ---------------------------------------------------------------- generic actions
def card(ctx, rel, u, v, wf, depth, rx=0.0, rz=0.0, t=None, emit=0.6, parent=None, name="card", pop=True, flip=None, hud=True):
    mat = card_mat(rel, emit)
    iw, ih = mat.node_tree.nodes["Image Texture"].image.size
    if hud:
        depth = ctx.hud_depth
    w = wf * ctx.cam.frame_w(depth)
    h = w * ih / iw
    if hud:
        fh = 2 * ctx.cam.th * depth
        o = plane(name, w, h, mat, loc=((u - 0.5) * fh * 9 / 16, (0.5 - v) * fh, -depth), rot=(math.radians(rx), 0, math.radians(rz)), parent=ctx.camobj, plane="xy")
        o["hud"] = 1
    else:
        pos = ctx.cam.pt(u, v, depth)
        o = plane(name, w, h, mat, loc=pos, rot=(math.radians(rx), 0, math.radians(rz)), parent=parent)
    o["w"], o["h"] = w, h
    if t is not None and pop:
        pop_in(o, F(t), ctx.f0, math.radians(rz), rx_from=flip)
    return o


def child_plane(parent, name, w, h, mat, lx, lz, rz=0.0):
    if parent.get("hud"):
        return plane(name, w, h, mat, loc=(lx * parent["w"], lz * parent["h"], 0.004), rot=(0, 0, math.radians(rz)), parent=parent, plane="xy")
    return plane(name, w, h, mat, loc=(lx * parent["w"], -0.004, lz * parent["h"]), rot=(0, 0, math.radians(rz)), parent=parent)


def pop_in(o, f, f0, rz0=0.0, sc=1.0, rx_from=None):
    f = max(f, f0 + 2)
    key(o, "scale", f0, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", f - 1, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", f + 3, (1.18 * sc,) * 3)
    key(o, "scale", f + 6, (0.95 * sc,) * 3)
    key(o, "scale", f + 9, (sc,) * 3)
    rot = list(o.rotation_euler)
    key(o, "rotation_euler", f0, tuple(rot), interp="CONSTANT")
    r = rot[:]; r[2] = rz0 + 0.1
    key(o, "rotation_euler", f - 1, tuple(r), interp="CONSTANT")
    r = rot[:]; r[2] = rz0 - 0.05
    if rx_from is not None:
        r = rot[:]; r[0] = math.radians(rx_from)
        key(o, "rotation_euler", f - 1, tuple(r), interp="CONSTANT")
        r = rot[:]; r[2] = rz0 - 0.05
        key(o, "rotation_euler", f + 5, tuple(r))
    else:
        key(o, "rotation_euler", f + 5, tuple(r))
    key(o, "rotation_euler", f + 9, tuple(rot))


def stamp(ctx, rel, parent, lx, lz, wf, t, rz=0.0, emit=1.0):
    mat = card_mat(rel, emit)
    iw, ih = mat.node_tree.nodes["Image Texture"].image.size
    w = wf * parent["w"]
    o = child_plane(parent, "stamp", w, w * ih / iw, mat, lx, lz, rz)
    f = F(t)
    key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", f - 1, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", f, (1.5,) * 3)
    key(o, "scale", f + 3, (1.0,) * 3)
    return o


def a_card(ctx, rel, u, v, wf, depth=3.0, t=None, rx=0, rz=0, stamp_=None, emit=0.6, flip=None):
    o = card(ctx, rel, u, v, wf, depth, rx, rz, t, emit, flip=flip)
    if stamp_:
        rel2, lx, lz, swf, st, srz = stamp_
        stamp(ctx, rel2, o, lx, lz, swf, st, srz)
    return o


def a_folder(ctx, rel="cards/folder_cover.png", u=0.5, v=0.52, wf=0.5, depth=3.0, t=0.4, rx=-30, rz=-4):
    o = card(ctx, rel, u, v, wf, depth, rx, rz, None, hud=False)
    f = F(t)
    p_end = ctx.cam.pt(u, v, depth)
    p_top = ctx.cam.pt(u, v - 0.75, depth)
    p_b = ctx.cam.pt(u, v - 0.06, depth)
    key(o, "location", ctx.f0, tuple(p_top), interp="CONSTANT")
    key(o, "location", f, tuple(p_top), interp="LINEAR")
    key(o, "location", f + 7, tuple(p_end), interp="LINEAR")
    key(o, "location", f + 11, tuple(p_b), interp="BEZIER")
    key(o, "location", f + 15, tuple(p_end), interp="BEZIER")
    key(o, "location", f + 18, tuple(p_end - Vector((0, 0, 0.0))), interp="BEZIER")
    r0 = o.rotation_euler.copy()
    key(o, "rotation_euler", ctx.f0, (r0[0] + 0.5, r0[1], r0[2] + 0.4), interp="BEZIER")
    key(o, "rotation_euler", f, (r0[0] + 0.5, r0[1], r0[2] + 0.4), interp="BEZIER")
    key(o, "rotation_euler", f + 7, tuple(r0), interp="BEZIER")
    # blob shadow on the "desk" under the folder
    ctx.folder = o


def a_dust(ctx, n=40, depth=(1.5, 7), hexcol="#ffc57a", size=(0.002, 0.005), emit=1.6, rise=0.0, up=0.15):
    me = bpy.data.meshes.new("mote")
    bm = bmesh.new(); prim(bm, "ico", 1.0); bm.to_mesh(me); bm.free()
    mat = emit_mat(f"mote{hexcol}{emit}", hexcol, emit)
    n = max(6, n // 2)
    for i in range(n):
        u, v, dp = random.uniform(-0.05, 1.05), random.uniform(0.02, 1.0), random.uniform(*depth)
        p = ctx.cam.pt(u, v, dp, 0.5)
        o = link(bpy.data.objects.new("mote", me), loc=p, scale=(random.uniform(*size),) * 3, mat=None)
        o.data.materials.append(mat) if not o.data.materials else None
        o.visible_shadow = False
        d = Vector((random.uniform(-0.35, 0.35), random.uniform(-0.2, 0.2), random.uniform(-0.1, up) + rise))
        key(o, "location", ctx.f0, tuple(p), interp="LINEAR")
        key(o, "location", ctx.f1, tuple(p + d * (ctx.f1 - ctx.f0) / 90), interp="LINEAR")


def a_embers(ctx, pu, pv, n=40, spread=0.5, hexcol="#ff9a2e"):
    me = bpy.data.meshes.new("ember")
    bm = bmesh.new(); prim(bm, "ico", 1.0); bm.to_mesh(me); bm.free()
    mat = emit_mat("ember", hexcol, 9.0)
    base = pl_near(ctx, pu, pv, 0.9)
    for i in range(n):
        o = link(bpy.data.objects.new("ember", me), scale=(random.uniform(0.012, 0.03),) * 3)
        ensure(o, mat)
        o.visible_shadow = False
        x0 = random.uniform(-0.25, 0.25) * spread * 2
        period = random.randint(40, 70)
        ph = random.randint(0, period)
        f = ctx.f0 - ph
        while f <= ctx.f1 + period:
            ff = max(f, ctx.f0)
            frac = (ff - f) / period
            p = base + Vector((x0 + 0.5 * frac * random.uniform(-1, 1) * 0.3 + 0.2 * frac, 0, 0.1 + 2.2 * frac))
            key(o, "location", ff, tuple(p), interp="LINEAR")
            key(o, "scale", ff, ((0.02) * (1 - frac) + 0.003,) * 3, interp="LINEAR")
            f += period
            if f > ctx.f1 + period:
                break


def a_rain(ctx, n=60):
    me = bpy.data.meshes.new("rain")
    bm = bmesh.new(); prim(bm, "box", (0.003, 0.003, 0.3)); bm.to_mesh(me); bm.free()
    mat = emit_mat("rain", "#cfe0ff", 3.0, alpha=0.3)
    for i in range(n):
        u, v, dp = random.uniform(0, 1), random.uniform(-0.1, 1), random.uniform(2, 9)
        p = ctx.cam.pt(u, v, dp, 0.5)
        o = link(bpy.data.objects.new("rain", me), loc=p, rot=(0, math.radians(8), 0))
        ensure(o, mat)
        o.visible_shadow = False
        ph = random.randint(0, 7)
        f = ctx.f0 - ph
        while f <= ctx.f1 + 8:
            ff = max(f, ctx.f0)
            fr = (ff - f) / 8.0
            key(o, "location", ff, (p.x - 0.3 * fr, p.y, p.z + 1.2 - 3.2 * fr), interp="LINEAR")
            f += 8


def a_shaft(ctx, top, bot, width, hexcol="#ffd8a0", strength=0.5, flick=False):
    """top/bot in plate coordinates (pu,pv); beam placed a little in front of the plate"""
    pt, pb = pl_near(ctx, *top, 0.97), pl_near(ctx, *bot, 0.97)
    h = pt.z - pb.z
    wscale = ctx.plate["pw"] * width
    me = make_quad("shaft", wscale, h, "xz", tw=wscale * 0.12)
    m = grad_alpha_mat(f"shaft{hexcol}{strength}", hexcol, strength * 6, "shaft")
    o = link(bpy.data.objects.new("shaft", me), loc=((pt.x + pb.x) / 2, pt.y, (pt.z + pb.z) / 2), mat=m)
    o.visible_shadow = False
    return o


def a_flicker_plate(ctx, amp=0.07, step=3, base=None):
    base = ctx.plate_k if base is None else base
    for f in range(ctx.f0, ctx.f1 + 1, step):
        v = base * (1 + amp * (random.random() * 2 - 1))
        for s in ctx.plate_socks:
            skey(s, f, v)


def a_plate_k(ctx, pairs):
    """pairs [(t, strength)] keyframe plate brightness (night / darken / pulse)"""
    for t, k in pairs:
        for s in ctx.plate_socks:
            skey(s, max(F(t), ctx.f0), k, "BEZIER")


def a_flash(ctx, times, glows):
    flash_overlay(ctx, times)
    for gp in glows:
        p = pl_near(ctx, gp[0], gp[1], 0.97)
        me = bpy.data.meshes.new("glow")
        bm = bmesh.new(); prim(bm, "ico", 1.0); bm.to_mesh(me); bm.free()
        mat = emit_mat("glow", "#fff4d0", 40.0)
        o = link(bpy.data.objects.new("glow", me), loc=p, scale=(0.001,) * 3, mat=None)
        ensure(o, mat)
        o.visible_shadow = False
        key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        for t in times:
            f = F(t)
            key(o, "scale", f - 1, (0.001,) * 3, interp="CONSTANT")
            key(o, "scale", f, (0.16,) * 3, interp="LINEAR")
            key(o, "scale", f + 4, (0.05,) * 3, interp="LINEAR")
            key(o, "scale", f + 7, (0.001,) * 3, interp="CONSTANT")
    for t in times:
        f = F(t)
        for s in ctx.plate_socks:
            skey(s, f - 1, ctx.plate_k); skey(s, f, ctx.plate_k * 2.0); skey(s, f + 2, ctx.plate_k * 1.4); skey(s, f + 7, ctx.plate_k)


# ---------------------------------------------------------------- characters
CH = {"c1": ("chars/c1-cia.glb", 1.85), "c2": ("chars/c2-olson.glb", 1.80), "c3": ("chars/c3-patient.glb", 1.75)}
BLOB = None


def mixp(*ds):
    out = {}
    for d in ds:
        for k, v in d.items():
            o = out.get(k, (0, 0, 0))
            out[k] = (o[0] + v[0], o[1] + v[1], o[2] + v[2])
    return out


def armp(side, fwd=0, elbow=0, adduct=0, out=0):
    s = 1 if side == "Left" else -1
    return {side + "Arm": (-fwd, adduct * s, out * s * 0), side + "ForeArm": (-elbow, 0, 0)}


BASE = {"LeftArm": (0, 44, 0), "RightArm": (0, -44, 0)}
SIT = {"LeftUpLeg": (-88, 0, 5), "RightUpLeg": (-88, 0, -5), "LeftLeg": (88, 0, 0), "RightLeg": (88, 0, 0), "Spine01": (-3, 0, 0)}


def head(rx=0, rz=0, ry=0, neck=0.4):
    return {"Head": (rx * (1 - neck), ry * (1 - neck), rz * (1 - neck)), "neck": (rx * neck, ry * neck, rz * neck)}


def idle(t, ph):
    s1 = math.sin(2 * math.pi * t / 3.6 + ph)
    s2 = math.sin(2 * math.pi * t / 5.3 + ph * 1.7)
    s3 = math.sin(2 * math.pi * t / 7.1 + ph * 0.6)
    return {"Spine01": (0.9 * s1, 0.4 * s3, 0.6 * s3), "Spine": (0.7 * s1, 0, 0), "Head": (0.9 * s2, 0.8 * s3, 1.8 * s3),
            "LeftShoulder": (0, 0, 0.8 * s1), "RightShoulder": (0, 0, -0.8 * s1),
            "LeftArm": (0.6 * s2, 0, 0), "RightArm": (0.6 * s3, 0, 0)}


def pose_at(keys, t):
    if t <= keys[0][0]:
        return keys[0][1], keys[0][2]
    if t >= keys[-1][0]:
        return keys[-1][1], keys[-1][2]
    for (t0, p0, h0), (t1, p1, h1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            w = sm((t - t0) / max(1e-6, t1 - t0))
            d = {}
            for k in set(p0) | set(p1):
                a, b = p0.get(k, (0, 0, 0)), p1.get(k, (0, 0, 0))
                d[k] = tuple(a[i] + (b[i] - a[i]) * w for i in range(3))
            hh = tuple(h0[i] + (h1[i] - h0[i]) * w for i in range(3))
            return d, hh


def solve_pose(arm, deltas, hips_off):
    pm, out = {}, {}
    for b in ARM_ORDER[arm.name]:
        rest = b.matrix_local
        if b.parent:
            base = pm[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest)
        else:
            base = rest.copy()
        cur = base
        d = deltas.get(b.name)
        if d:
            R = Euler(tuple(math.radians(x) for x in d), "XYZ").to_matrix().to_4x4()
            h = cur.translation.copy()
            cur = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ cur
        if b.name == "Hips":
            cur = Matrix.Translation(hips_off) @ cur
        pm[b.name] = cur
        loc, q, _ = (base.inverted() @ cur).decompose()
        out[b.name] = (q, loc)
    return out


ARM_ORDER = {}


def attach(ctx, arm, bone, k, off_m, parts_parent_objs, rest_align=True):
    """follow a bone: empty with Copy Transforms, objects parented at an armature-space metre offset"""
    bn = arm.data.bones[bone]
    A = empty(f"att_{bone}")
    c = A.constraints.new("COPY_TRANSFORMS")
    c.target, c.subtarget = arm, bone
    Rr = bn.matrix_local.to_3x3()
    for o in parts_parent_objs:
        o.parent = A
        o.location = Rr.inverted() @ (Vector(off_m) / k)
        o.rotation_euler = Rr.inverted().to_euler()
        o.scale = (1 / k,) * 3
    return A


def make_char(ctx, cid, u, vf, h, yaw=0.0, keys=None, sit=0.0, lamp=1, key_col="#ffd2a0", key_e=300, rim_col="#8fb4ff", rim_e=380,
              props=(), t_phase=0.0, depth=None, hips=None, roll=0.0):
    path, target = CH[cid]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, path))
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True); new.remove(o)
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        CUR.objects.link(o)
    arm = [o for o in new if o.type == "ARMATURE"][0]
    mesh = [o for o in new if o.type == "MESH"][0]
    root = empty(f"{cid}_root")
    norm = empty(f"{cid}_norm", parent=root)
    arm.parent = norm
    # material: matte, a little self-glow of the base colour, flat facets
    for mt in mesh.data.materials:
        nt = mt.node_tree
        b = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
        im = [n for n in nt.nodes if n.type == "TEX_IMAGE"]
        b.inputs["Roughness"].default_value = 0.92
        b.inputs["Specular IOR Level"].default_value = 0.08
        b.inputs["Metallic"].default_value = 0.0
        if im:
            nt.links.new(im[0].outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = 0.06
    for p in mesh.data.polygons:
        p.use_smooth = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mw = np.array(ev.matrix_world)
    wco = co @ mw[:3, :3].T + mw[:3, 3]
    ev.to_mesh_clear()
    zmin, zmax = wco[:, 2].min(), wco[:, 2].max()
    cx, cy = (wco[:, 0].min() + wco[:, 0].max()) / 2, (wco[:, 1].min() + wco[:, 1].max()) / 2
    s = target / (zmax - zmin)
    norm.scale = (s, s, s)
    norm.location = (-cx * s, -cy * s, -zmin * s)
    bpy.context.view_layer.update()
    k = arm.matrix_world.to_scale()[0]
    if depth is None:
        depth = target / (h * 2 * ctx.cam.th)
    if hips:  # place by the pelvis: root sits at the hip target, body hangs from it, leaned by roll
        pos = ctx.cam.pt(hips[0], hips[1], depth)
        hz = norm.location.z + arm.data.bones["Hips"].head_local.z * k - sit
        norm.location.z -= hz
    else:
        pos = ctx.cam.pt(u, vf, depth)
    root.location = pos
    root.rotation_euler = (0, math.radians(roll), math.radians(yaw))
    ctx.last_depth = depth
    # pose animation
    ARM_ORDER[arm.name] = sorted(arm.data.bones, key=lambda b: len(b.parent_recursive))
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    keys = keys or [(0, {}, (0, 0, 0))]
    hips_sit = (0, 0, -sit)
    prev = {}
    PREF.keyframe_new_interpolation_type = "LINEAR"
    t_start = (ctx.f0 - 1) / FPS
    for f in range(ctx.f0, ctx.f1 + 2, 2):
        t = (f - 1) / FPS
        d, hh = pose_at(keys, t)
        dd = mixp(BASE, d, idle(t - t_start, t_phase))
        ho = Vector(hh) + Vector(hips_sit) + Vector((0, 0.004 * math.sin(t * 1.3 + t_phase), 0.003 * math.sin(2 * math.pi * t / 3.6 + t_phase)))
        res = solve_pose(arm, dd, ho / k)
        for name, (q, loc) in res.items():
            pb = arm.pose.bones[name]
            pq = prev.get(name)
            if pq is not None and q.dot(pq) < 0:
                q = -q
            prev[name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if name == "Hips":
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    LINEAR_IDS.append(arm)
    # props follow bones
    for (bone, mk_fn, off) in props:
        objs = mk_fn()
        attach(ctx, arm, bone, k, off, objs)
        if os.environ.get("PROPBIG"):
            for o_ in objs:
                o_.scale = o_.scale * 4
        if os.environ.get("PROPDBG"):
            scene.frame_set((ctx.f0 + ctx.f1) // 2)
            bpy.context.view_layer.update()
            pb = arm.pose.bones[bone]
            print("PROPDBG", bone, "k", k, "bone_w", tuple(round(x, 2) for x in (arm.matrix_world @ pb.head)), "prop_w", tuple(round(x, 2) for x in objs[0].matrix_world.translation), "scale", tuple(round(x, 3) for x in objs[0].matrix_world.to_scale()), "root", tuple(round(x, 2) for x in root.location))
    # contact shadow + faint offset shadow
    wb = ctx.cam.frame_w(depth) * 0.0 + (0.55 * target / 1.85)
    for (dx, dy, sc, st) in (() if hips else ((0, 0.0, 1.0, 0.75), (-0.22 * lamp, 0.08, 1.7, 0.30))):
        plane("blob", 1.6 * wb * sc, 0.95 * wb * sc, BLOB[0], loc=(pos.x + dx * target, pos.y + dy, pos.z + 0.006), rot=(math.radians(-90), 0, 0), plane="xz")
    # rig lights
    c = Vector(pos) + Vector((0, 0, 0.9 * target / 1.85))
    light("AREA", c + Vector((1.9 * lamp, -2.6, 2.4)), c, key_col, key_e, size=1.6, name="key")
    light("AREA", c + Vector((-1.8 * lamp, 2.2, 1.6)), c, rim_col, rim_e, size=1.2, shadow=False, name="rim")
    light("AREA", c + Vector((-1.0 * lamp, -3.0, 0.4)), c, "#ffcf9a", key_e * 0.05, size=2.5, shadow=False, name="fill")
    return dict(arm=arm, root=root, k=k, depth=depth, pos=pos)


# ---------------------------------------------------------------- props (low poly, faceted)
def p_cup(parts=None):
    bm = bmesh.new()
    prim(bm, "cyl", (0.055, 0.12), (0, 0, 0.06), seg=10, r2=0.064)
    prim(bm, "box", (0.018, 0.018, 0.07), (0.08, 0, 0.065))
    o1 = bm_obj("cup", bm, M("ceramic", "#9a4a32", 0.5, 0.2))
    bm = bmesh.new(); prim(bm, "cyl", (0.058, 0.004), (0, 0, 0.118), seg=10)
    o2 = bm_obj("coffee", bm, M("coffee", "#2a160c", 0.3, 0.3), parent=o1)
    return [o1]


def p_glass():
    bm = bmesh.new(); prim(bm, "cyl", (0.042, 0.12), (0, 0, 0.06), seg=8, r2=0.052)
    o1 = bm_obj("glass", bm, M("glass", "#cfe6ee", 0.1, 0.6, alpha=0.35))
    bm = bmesh.new(); prim(bm, "cyl", (0.038, 0.06), (0, 0, 0.035), seg=8, r2=0.044)
    bm_obj("whisky", bm, M("whisky", "#d98a2b", 0.2, 0.3, emit=0.25), parent=o1)
    return [o1]


def p_headphones():
    bm = bmesh.new()
    R = 0.125
    for i in range(9):
        a0, a1 = math.pi * i / 9, math.pi * (i + 1) / 9
        am = (a0 + a1) / 2
        prim(bm, "box", (0.022, 0.03, 2 * R * math.sin((a1 - a0) / 2) * 1.1), (R * math.cos(am), 0, R * math.sin(am)), rot=(0, -math.degrees(am) + 0, 0))
    for sx in (-1, 1):
        prim(bm, "cyl", (0.07, 0.05), (sx * (R + 0.004), 0, 0.0), rot=(0, 90, 0), seg=10)
    return [bm_obj("headphones", bm, M("phones", "#1a1512", 0.55, 0.25))]


def p_bottle_obj():
    bm = bmesh.new()
    prim(bm, "cyl", (0.034, 0.085), (0, 0, 0.0425), seg=6, r2=0.03)
    prim(bm, "cyl", (0.02, 0.025), (0, 0, 0.0975), seg=6, r2=0.014)
    o1 = bm_obj("vial", bm, M("vialglass", "#7a5a38", 0.12, 0.7, alpha=0.78))
    bm = bmesh.new(); prim(bm, "cyl", (0.019, 0.07), (0, 0, 0.04), seg=6, r2=0.026)
    bm_obj("vialliq", bm, M("olive", "#7d9440", 0.3, 0.2, emit=0.35), parent=o1)
    bm = bmesh.new(); prim(bm, "cyl", (0.016, 0.026), (0, 0, 0.123), seg=6, r2=0.013)
    bm_obj("cork", bm, M("cork", "#2a1d14", 0.8, 0.05), parent=o1)
    bm = bmesh.new(); prim(bm, "box", (0.045, 0.004, 0.04), (0, -0.032, 0.04))
    bm_obj("vlabel", bm, M("vlabel", "#d8cba4", 0.9, 0.05, emit=0.25), parent=o1)
    return o1


def p_hand():
    bm = bmesh.new()
    prim(bm, "box", (0.085, 0.045, 0.095), (0, 0, 0))
    prim(bm, "box", (0.085, 0.05, 0.04), (0, -0.03, 0.065))   # curled fingers
    prim(bm, "box", (0.03, 0.05, 0.065), (-0.06, -0.02, 0.01), rot=(0, 25, 0))  # thumb
    prim(bm, "box", (0.07, 0.07, 0.15), (0, 0.05, -0.12))  # sleeve cuff
    return bm_obj("hand", bm, M("skin", "#c58f67", 0.8, 0.1))


def p_dropper():
    bm = bmesh.new()
    prim(bm, "cyl", (0.008, 0.11), (0, 0, 0.0), seg=6)
    prim(bm, "cyl", (0.0018, 0.03), (0, 0, -0.07), seg=6, r2=0.0035)
    o1 = bm_obj("dropper", bm, M("dropglass", "#dfe8e0", 0.1, 0.7, alpha=0.4))
    bm = bmesh.new(); prim(bm, "ico", 0.02, (0, 0, 0.075), r2=(1, 1, 1.6))
    bm_obj("bulb", bm, M("rubber", "#4a1512", 0.6, 0.15, emit=0.15), parent=o1)
    bm = bmesh.new(); prim(bm, "cyl", (0.012, 0.05), (0, 0, 0.056), seg=6)
    bm_obj("collar", bm, M("collar", "#1a1512", 0.6, 0.2), parent=o1)
    return o1


def p_reel(name):
    bm = bmesh.new()
    prim(bm, "cyl", (0.1, 0.012), (0, 0, 0), rot=(90, 0, 0), seg=14)
    ring = bm
    o = bm_obj(name, ring, M("reel", "#7b6a56", 0.5, 0.5, emit=0.8))
    bm = bmesh.new()
    for a in (0, 60, 120):
        prim(bm, "box", (0.17, 0.016, 0.018), (0, -0.01, 0), rot=(0, a, 0))
    prim(bm, "cyl", (0.022, 0.02), (0, -0.01, 0), rot=(90, 0, 0), seg=8)
    bm_obj(name + "_sp", bm, M("reelsp", "#2a231c", 0.6, 0.4, emit=0.5), parent=o)
    # three dark cut-outs
    bm = bmesh.new()
    for a in (30, 150, 270):
        c = Vector((0.052 * math.cos(math.radians(a)), -0.008, 0.052 * math.sin(math.radians(a))))
        prim(bm, "cyl", (0.03, 0.006), tuple(c), rot=(90, 0, 0), seg=6)
    bm_obj(name + "_h", bm, M("reelh", "#120f0c", 0.9, 0.0), parent=o)
    return o


def a_reels(ctx, pos_pl, rad, t0, t1, speed=(0.7, 0.55)):
    """spinning reels overlaid on the painted ones. pos_pl: [(pu,pv),..]; rad = radius as fraction of plate width"""
    for i, pp in enumerate(pos_pl):
        o = p_reel(f"reel{i}")
        p = pl_near(ctx, pp[0], pp[1], 0.985)
        r = rad * ctx.plate["pw"] * 0.985
        o.location = p
        o.scale = (r / 0.1,) * 3
        o.visible_shadow = False
        n = ctx.f1 - ctx.f0
        key(o, "rotation_euler", ctx.f0, (0, 0, 0), interp="LINEAR")
        key(o, "rotation_euler", ctx.f1, (0, -speed[i % 2] * n * 0.5 * (1 if i else -1), 0), interp="LINEAR")


def a_char(ctx, cid, u, v, h, yaw=0, keys=None, sit=0, lamp=1, props=(), **kw):
    return make_char(ctx, cid, u, v, h, yaw, keys, sit, lamp, props=props, **kw)


def a_bottles(ctx, n=5, x0=-0.32, x1=0.32, y0=0.0, y1=0.35):
    for i in range(n):
        fr = i / (n - 1)
        o = p_bottle_obj()
        o.location = (ctx.ox + x0 + (x1 - x0) * fr, y0 + (y1 - y0) * fr, 0)
        o.rotation_euler = (0, 0, math.radians(random.uniform(-20, 20)))
        o.scale = (1.05, 1.05, 1.05)
        o.visible_shadow = True
    ctx.ground(0.0)
    c = Vector((ctx.ox, 0.1, 0.1))
    light("AREA", (ctx.ox - 0.8, -1.2, 1.1), c, "#ffd6a0", 90, size=0.8, name="key")
    light("AREA", (ctx.ox + 0.6, 1.0, 0.8), c, "#ffb066", 12, size=0.6, shadow=False, name="rimg")


def a_ground(ctx, z=0.0, hexcol="#3a2314", rough=0.45, y0=-1.5, y1=2.2, big=8.0):
    """a table-top plane with a far-edge fade"""
    m = new_mat("ground", True)
    nt = m.node_tree
    b = bsdf(m)
    wv = nt.nodes.new("ShaderNodeTexWave"); wv.wave_type = "BANDS"
    wv.inputs["Scale"].default_value = 6; wv.inputs["Distortion"].default_value = 4.0; wv.inputs["Detail"].default_value = 3
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (*hx(hexcol), 1); cr.color_ramp.elements[1].color = (*hx("#6b4326"), 1)
    nt.links.new(wv.outputs["Color"], cr.inputs["Fac"]); nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.4
    uv = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sp.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.98, 0.45
    nt.links.new(sp.outputs["Y"], mr.inputs["Value"]); nt.links.new(mr.outputs[0], b.inputs["Alpha"])
    me = bpy.data.meshes.new("ground")
    me.from_pydata([(-big, y0, 0), (big, y0, 0), (big, y1, 0), (-big, y1, 0)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name="UV")
    for i, q in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uvl.data[i].uv = q
    o = link(bpy.data.objects.new("ground", me), loc=(ctx.ox, 0, z), mat=m)
    return o


def a_drops(ctx, t_list, glass_pos=(0, 0.0, 0), tip_z=0.22):
    gx = ctx.ox + glass_pos[0]
    gy = glass_pos[1]
    ctx.ground(0.0)
    # small stemmed liqueur glass, clear, amber liquid
    bm = bmesh.new()
    prim(bm, "cyl", (0.05, 0.004), (0, 0, 0.002), seg=8)
    prim(bm, "cyl", (0.005, 0.07), (0, 0, 0.039), seg=6)
    prim(bm, "cyl", (0.016, 0.07), (0, 0, 0.109), seg=8, r2=0.03)
    g = bm_obj("liqueur", bm, M("clearglass", "#dfeee8", 0.08, 0.8, alpha=0.3), loc=(gx, gy, 0), scale=(1.6, 1.6, 1.6))
    bm = bmesh.new(); prim(bm, "cyl", (0.012, 0.045), (0, 0, 0.1), seg=8, r2=0.025)
    liq = bm_obj("amber", bm, M("amberliq", "#c9772a", 0.2, 0.4, emit=0.25), parent=g)
    surf = 0.1 * 1.6 + 0.0225 * 1.6
    dr = p_dropper()
    dr.location = (gx, gy, tip_z + 0.085 * 1.5)
    dr.scale = (1.5,) * 3
    dr.rotation_euler = (0, math.radians(6), 0)
    key(dr, "location", ctx.f0, tuple(dr.location), interp="BEZIER")
    key(dr, "location", ctx.f1, (dr.location[0] + 0.008, dr.location[1], dr.location[2] - 0.012), interp="BEZIER")
    me = bpy.data.meshes.new("drop")
    bm = bmesh.new(); prim(bm, "ico", 0.009, r2=(1, 1, 1.4)); bm.to_mesh(me); bm.free()
    dm = emit_mat("dropm", "#9ab04e", 1.8)
    for i, t in enumerate(t_list):
        f = F(t)
        o = link(bpy.data.objects.new("drop", me), loc=(gx, gy, tip_z), scale=(0.001,) * 3)
        ensure(o, dm)
        o.visible_shadow = False
        key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        key(o, "scale", f, (1.0,) * 3, interp="CONSTANT")
        zs = [tip_z, tip_z - 0.02, tip_z - 0.06, tip_z - 0.11, surf + 0.002]
        for ff, zz in zip([f, f + 3, f + 6, f + 9, f + 11], zs):
            key(o, "location", ff, (gx, gy, zz), interp="LINEAR")
        key(o, "scale", f + 11, (0.001,) * 3, interp="CONSTANT")
        rm = bpy.data.meshes.new("ring")
        bm = bmesh.new(); prim(bm, "cyl", (1.0, 0.0015), seg=14); bm.to_mesh(rm); bm.free()
        ro = link(bpy.data.objects.new("ripple", rm), loc=(gx, gy, surf), scale=(0.001, 0.001, 1))
        ensure(ro, emit_mat("ripple", "#b8c870", 1.2, alpha=0.4))
        ro.visible_shadow = False
        key(ro, "scale", ctx.f0, (0.001, 0.001, 1), interp="CONSTANT")
        key(ro, "scale", f + 11, (0.004, 0.004, 1), interp="CONSTANT")
        key(ro, "scale", f + 26, (0.032, 0.032, 1), interp="LINEAR")
        key(ro, "scale", f + 27, (0.001, 0.001, 1), interp="CONSTANT")
    light("AREA", (gx - 0.7, -1.0, 0.9), (gx, 0, 0.1), "#ffcf99", 45, size=0.8, name="key")
    light("AREA", (gx + 0.5, 0.9, 0.5), (gx, 0, 0.1), "#ffb066", 10, size=0.5, shadow=False, name="rimg")


def a_curtain(ctx, pu, pv, wf, hf):
    p = pl_near(ctx, pu, pv, 0.985)
    w, h = wf * ctx.plate["pw"], hf * ctx.plate["pw"]
    me = bpy.data.meshes.new("curtain")
    bm = bmesh.new()
    nx, nz = 6, 10
    vs = [[bm.verts.new(((i / nx - 0.5) * w, 0, (j / nz - 0.5) * h)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bm.to_mesh(me); bm.free()
    m = M("curtain", "#e9dccb", 0.9, 0.05, emit=0.9, alpha=0.82)
    o = link(bpy.data.objects.new("curtain", me), loc=p, mat=m)
    o.visible_shadow = False
    md = o.modifiers.new("wave", "WAVE")
    md.use_x, md.use_y = True, False
    md.height, md.width, md.narrowness, md.speed, md.time_offset = 0.05 * w, 0.35 * w, 3.0, 0.07, -ctx.f0 * 0.07
    md.use_normal = True
    md.use_normal_y = True
    md.start_position_x, md.start_position_y = 0, 0
    md.use_cyclic = True
    # drift outward of the window
    key(o, "location", ctx.f0, tuple(p), interp="BEZIER")
    key(o, "location", ctx.f1, (p.x + 0.12 * w, p.y - 0.4, p.z), interp="BEZIER")


def a_calflip(ctx, t0=0.0, step=0.16, u=0.5, v=0.42, wf=0.62, depth=3.0):
    days = list(range(19, 29))
    for idx, d in enumerate(days):
        rel = f"cards/cal_{d}.png"
        mat = card_mat(rel, 0.6)
        iw, ih = mat.node_tree.nodes["Image Texture"].image.size
        w = wf * ctx.cam.frame_w(depth)
        h = w * ih / iw
        top = ctx.cam.pt(u, v, depth) + Vector((0, -0.003 * (len(days) - idx), h / 2))
        piv = empty(f"piv{d}", loc=tuple(top))
        o = plane(f"cal{d}", w, h, mat, loc=(0, 0, -h / 2), parent=piv)
        plane(f"calback{d}", w, h, emit_mat("calback", "#cfc6ae", 0.8), loc=(0, 0.003, -h / 2), parent=piv)
        if idx < len(days) - 1:
            f = F(t0 + idx * step)
            key(piv, "rotation_euler", ctx.f0, (0, 0, 0), interp="CONSTANT")
            key(piv, "rotation_euler", f, (0, 0, 0), interp="LINEAR")
            key(piv, "rotation_euler", f + 6, (math.radians(-170), 0, 0), interp="LINEAR")
            key(piv, "scale", ctx.f0, (1, 1, 1), interp="CONSTANT")
            key(piv, "scale", f + 6, (1, 1, 1), interp="CONSTANT")
            key(piv, "scale", f + 7, (0.001,) * 3, interp="CONSTANT")
    # first page pops in
    # (the stack is simply there at shot start)


def a_days(ctx, t0, t1, n=30, u=0.5, v=0.2, wf=0.5, depth=3.0):
    objs = []
    for i in range(1, n + 1):
        o = card(ctx, f"cards/day_{i:02d}.png", u, v, wf, depth, 0, 0, None)
        objs.append(o)
        fa = F(t0 + (t1 - t0) * (i - 1) / n)
        fb = F(t0 + (t1 - t0) * i / n)
        key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        key(o, "scale", fa, (1.0,) * 3, interp="CONSTANT")
        if i < n:
            key(o, "scale", fb, (0.001,) * 3, interp="CONSTANT")


def a_papers(ctx, pu, pv, t0, n=14, gap=0.13, size=0.26):
    for i in range(n):
        rel = f"cards/page_{1 + i % 4}.png"
        mat = card_mat(rel, 0.7)
        iw, ih = mat.node_tree.nodes["Image Texture"].image.size
        o = plane("sheet", size * ctx.plate["pw"] * 0.2, size * ctx.plate["pw"] * 0.2 * ih / iw, mat)
        fa = F(t0 + gap * i + random.uniform(0, 0.05))
        fb = fa + 22
        start = pl_near(ctx, pu + random.uniform(-0.12, 0.04), pv - 0.28, 0.93)
        end = pl_near(ctx, pu + random.uniform(-0.02, 0.02), pv + 0.02, 0.93)
        mid = start.lerp(end, 0.55) + Vector((random.uniform(-0.2, 0.2), -0.2, 0))
        r0 = [random.uniform(0, 6) for _ in range(3)]
        key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        key(o, "scale", fa, (1,) * 3, interp="CONSTANT")
        key(o, "scale", fb - 1, (1,) * 3, interp="CONSTANT")
        key(o, "scale", fb, (0.001,) * 3, interp="CONSTANT")
        key(o, "location", fa, tuple(start), interp="LINEAR")
        key(o, "location", fa + 12, tuple(mid), interp="LINEAR")
        key(o, "location", fb - 1, tuple(end), interp="LINEAR")
        key(o, "rotation_euler", fa, tuple(r0), interp="LINEAR")
        key(o, "rotation_euler", fb - 1, tuple(r + random.uniform(-9, 9) for r in r0), interp="LINEAR")
        o.visible_shadow = False


def a_box(ctx, t0, t1, p0, p1, size=0.55):
    """cardboard box sliding along the camera ray: p0/p1 = (u, v, depth)"""
    bm = bmesh.new()
    prim(bm, "box", (size, size * 0.9, size * 0.62))
    prim(bm, "box", (size * 1.04, size * 0.95, size * 0.07), (0, 0, size * 0.31))
    o = bm_obj("box", bm, M("cardboard", "#b88a55", 0.9, 0.08, emit=0.25))
    lm = card_mat("cards/label_financial.png", 0.8)
    liw, lih = lm.node_tree.nodes["Image Texture"].image.size
    lw = size * 0.8
    plane("label", lw, lw * lih / liw, lm, loc=(0, -size * 0.455 - 0.004, 0.02), parent=o)
    fa, fb = F(t0), F(t1)
    key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", fa, (1,) * 3, interp="CONSTANT")
    for fr, f in ((0, fa), (1, fb)):
        pp = ctx.cam.pt(p0[0] + (p1[0] - p0[0]) * fr, p0[1] + (p1[1] - p0[1]) * fr, p0[2] + (p1[2] - p0[2]) * fr)
        key(o, "location", f, tuple(pp), interp="BEZIER")
    key(o, "rotation_euler", fa, (0, 0, math.radians(-30)), interp="BEZIER")
    key(o, "rotation_euler", fb, (0, 0, math.radians(-16)), interp="BEZIER")
    ctx.box = o


def a_fgcrop(ctx, rect, frac, fe=0.02):
    """duplicate of the plate cropped to rect (pu0,pu1,pv0,pv1) and moved nearer the camera, so 3D stuff can sit behind it"""
    c = ctx.cam.pos(0)
    p = ctx.plate
    pc = Vector((p["cx"], PY, p["cz"]))
    pos = c + (pc - c) * frac
    plane("fgcrop", p["pw"] * frac, p["ph"] * frac, plate_mat(ctx, (rect[0], rect[1], rect[2], rect[3], fe)), loc=pos)


def a_wood(ctx, z=0.0):
    m = new_mat("deskwood")
    nt = m.node_tree
    b = bsdf(m)
    wv = nt.nodes.new("ShaderNodeTexWave"); wv.wave_type = "BANDS"
    wv.inputs["Scale"].default_value = 2.5; wv.inputs["Distortion"].default_value = 9.0; wv.inputs["Detail"].default_value = 2
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1, 0.15, 1)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs[0], wv.inputs["Vector"])
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (*hx("#40230f"), 1); cr.color_ramp.elements[1].color = (*hx("#5c371c"), 1)
    nt.links.new(wv.outputs["Color"], cr.inputs["Fac"]); nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.5
    me = bpy.data.meshes.new("desk")
    me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    link(bpy.data.objects.new("desk", me), loc=(ctx.ox, 0, z), mat=m)


def a_pages(ctx, t0, step=0.5, depth=3.6):
    """top-down: folder opens, four pages slide out one at a time"""
    cam_z = ctx.cam.p0.z
    a_wood(ctx)
    fo = bpy.data.objects.new("x", None)
    mat = card_mat("cards/folder_open.png", 0.55)
    iw, ih = mat.node_tree.nodes["Image Texture"].image.size
    w = 1.15
    o = plane("folder_open", w, w * ih / iw, mat, loc=(ctx.ox, 0.0, 0.01), rot=(math.radians(-90), 0, 0))
    key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
    key(o, "scale", ctx.f0 + 1, (1.0,) * 3, interp="CONSTANT")
    tgt = [(-0.36, 0.62, 7), (0.34, 0.55, -8), (-0.3, -0.62, -6), (0.33, -0.58, 9)]
    for i, (tx, ty, rz) in enumerate(tgt):
        rel = f"cards/page_{i + 1}.png"
        pm = card_mat(rel, 0.6)
        pw_, ph_ = pm.node_tree.nodes["Image Texture"].image.size
        pw = 0.56
        po = plane(f"page{i}", pw, pw * ph_ / pw_, pm, loc=(ctx.ox, 0, 0.02 + 0.008 * i), rot=(math.radians(-90), 0, 0))
        fa = F(t0 + step * i)
        key(po, "location", ctx.f0, (ctx.ox, 0.0, 0.02 + 0.008 * i), interp="CONSTANT")
        key(po, "location", fa, (ctx.ox + 0.02 * (1 if tx > 0 else -1), 0.02, 0.02 + 0.008 * i), interp="BEZIER")
        key(po, "location", fa + 10, (ctx.ox + tx, ty, 0.02 + 0.008 * i), interp="BEZIER")
        po.rotation_euler = (math.radians(-90), 0, 0)
        key(po, "rotation_euler", ctx.f0, (math.radians(-90), 0, 0), interp="CONSTANT")
        key(po, "rotation_euler", fa, (math.radians(-90), 0, 0), interp="BEZIER")
        key(po, "rotation_euler", fa + 10, (math.radians(-90), 0, math.radians(rz)), interp="BEZIER")
        key(po, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        key(po, "scale", fa, (0.85,) * 3, interp="CONSTANT")
        key(po, "scale", fa + 10, (1.0,) * 3, interp="BEZIER")
    # lamp pool
    sp = light("SPOT", (ctx.ox - 1.2, -1.0, 2.6), (ctx.ox, 0, 0), "#ffd2a0", 1800, size=0.4, spot=80, blend=1.0, name="lamp")
    ctx.lamp = sp


def a_sig(ctx, memo, t0, lx=0.15, lz=-0.33, wf=0.55):
    """signature drawn on: 20 frames, each its own plane shown for one frame step"""
    w = wf * memo["w"]
    n = 20
    for k in range(n):
        m = card_mat(f"cards/signature_frames/sig_{k:02d}.png", 0.5)
        o = child_plane(memo, f"sig{k}", w, w * 600 / 1600, m, lx, lz)
        f = F(t0) + k * 2
        key(o, "scale", ctx.f0, (0.001,) * 3, interp="CONSTANT")
        key(o, "scale", f, (1, 1, 1), interp="CONSTANT")
        if k < n - 1:
            key(o, "scale", f + 2, (0.001,) * 3, interp="CONSTANT")


def a_pen(ctx, pos, rot=0):
    bm = bmesh.new()
    prim(bm, "cyl", (0.007, 0.16), seg=6, rot=(0, 90, 0))
    prim(bm, "cyl", (0.002, 0.02), (0.09, 0, 0), seg=6, rot=(0, 90, 0))
    bm_obj("pen", bm, M("pen", "#1b1b22", 0.3, 0.5), loc=pos, rot=(0, 0, math.radians(rot)))


def a_light(ctx, kind, pos, target, col, e, size=1.0, spot=60, flick=0.0, name="L"):
    l = light(kind, (ctx.ox + pos[0], pos[1], pos[2]), None if target is None else (ctx.ox + target[0], target[1], target[2]), col, e, size, spot, name=name)
    if flick:
        flicker(l, ctx.f0, ctx.f1, e, flick)
    return l


def a_pulse(ctx, hexcol="#6fff3a", e=400, pos=(0, -2, 2.6), period=1.0):
    l = light("POINT", (ctx.ox + pos[0], pos[1], pos[2]), None, hexcol, e, size=0.6, name="pulse")
    f = ctx.f0
    n = int(period * FPS)
    while f <= ctx.f1 + n:
        skey(l.data.__class__ and l.data, f, 1) if False else None
        PREF.keyframe_new_interpolation_type = "BEZIER"
        l.data.energy = e * 0.2; l.data.keyframe_insert("energy", frame=f)
        l.data.energy = e * 1.3; l.data.keyframe_insert("energy", frame=f + n // 2)
        f += n


ACTIONS = dict(card=a_card, folder=a_folder, dust=a_dust, embers=a_embers, rain=a_rain, shaft=a_shaft, flicker_plate=a_flicker_plate,
               plate_k=a_plate_k, flash=a_flash, char=a_char, bottles=a_bottles, drops=a_drops, curtain=a_curtain, calflip=a_calflip,
               days=a_days, papers=a_papers, box=a_box, fgcrop=a_fgcrop, pages=a_pages, reels=a_reels, light=a_light, pulse=a_pulse, pen=a_pen)


# ---------------------------------------------------------------- build
def build_shot(sh):
    global CUR
    sid = sh["id"]
    col = bpy.data.collections.new(f"shot{sid:02d}")
    scene.collection.children.link(col)
    CUR = col
    ctx = Ctx()
    ctx.sh, ctx.col = sh, col
    ctx.ox = sid * 40.0
    ctx.f0, ctx.f1 = sh["f0"], sh["f1"]
    ctx.cam = Cam(ctx.ox, sh["cam"])
    ctx.ground = lambda z=0.0, **kw: a_ground(ctx, z, **kw)
    SHOT_COLS.append((col, ctx.f0, ctx.f1))
    if sh.get("plate"):
        build_plate(ctx, sh)
    build_camera(ctx, sh)
    for a in sh.get("actions", []):
        name, kw = a[0], dict(a[1]) if len(a) > 1 else {}
        if name == "card" and "rel" not in kw:
            pass
        # card paths
        if name in ("card",) and "rel" in kw and not kw["rel"].startswith("cards/"):
            kw["rel"] = "cards/" + kw["rel"]
        if name == "card" and "stamp_" in kw and kw["stamp_"]:
            s = kw["stamp_"]
            kw["stamp_"] = ("cards/" + s[0],) + tuple(s[1:])
        r = ACTIONS[name](ctx, **kw)
        if name == "card" and kw.get("name_ret"):
            pass
        if name == "card" and kw.get("sig") is not None:
            pass
    return ctx


CARD_SIG = {}


def finish_shot_extra(ctx, sh):
    pass


# ---------------------------------------------------------------- SHOTS data
# cam: p0/p1 position (x, y, z) relative to the shot origin, pit (deg, + looks up), yaw, lens (35 => vfov 37.8 deg), dof=(focus0, focus1, fstop)
# actions: ("name", {params}) ; times are absolute video seconds. u,v = screen coords at the shot's first frame (0..1, v from top)
KEY_WARM = "#ffd2a0"
SHOTS = [
    dict(id=1, t0=0.0, t1=2.2, plate="p1-archive", cam=dict(p0=(0, -6, 1.4), p1=(0, -5.2, 1.4)),
         actions=[("shaft", dict(top=(0.47, 0.1), bot=(0.38, 0.62), width=0.34, strength=0.5)),
                  ("folder", dict(u=0.5, v=0.5, wf=0.5, depth=3.0, t=0.35)),
                  ("dust", dict(n=40))]),
    dict(id=2, t0=2.2, t1=4.3, plate="p1-archive", cam=dict(p0=(0, -3.5, 0.55), p1=(0, -3.0, 0.8), pit0=3, pit1=9, dof=(3.2, 2.7, 2.8)),
         actions=[("char", dict(cid="c1", u=0.42, v=1.02, h=0.82, yaw=-16, lamp=1,
                                keys=[(2.2, mixp(head(0, -32, 0)), (0, 0, 0)), (3.3, mixp(head(2, 6, 0), {"Spine": (0, 0, 4)}), (0, 0, 0)), (4.3, mixp(head(2, 14, 0), {"Spine": (0, 0, 6)}), (0, 0, 0))])),
                  ("shaft", dict(top=(0.47, 0.1), bot=(0.4, 0.62), width=0.34, strength=0.4)),
                  ("dust", dict(n=36, depth=(1.2, 6)))]),
    dict(id=3, t0=4.3, t1=7.2, plate=None, cam=dict(p0=(0, 0, 4.0), p1=(0, 0, 3.4), pit0=-90, pit1=-90),
         actions=[("pages", dict(t0=4.9, step=0.55)), ("dust", dict(n=30, depth=(0.5, 3.5)))]),
    dict(id=4, t0=7.2, t1=9.6, plate="p1-archive", cam=dict(p0=(0, -3.0, 1.4), p1=(0, -2.6, 1.4), dof=(2.2, 2.2, 2.4)),
         actions=[("card", dict(rel="memo_mkultra.png", u=0.5, v=0.45, wf=0.62, depth=2.2, t=7.3, rx=0, flip=-70,
                                stamp_=("stamp_topsecret.png", 0.22, 0.34, 0.5, 8.4, -6)))]),
    dict(id=5, t0=9.6, t1=13.2, plate="p2-office", cam=dict(p0=(-0.35, -4.0, 1.2), p1=(0.35, -3.7, 1.25), dof=(2.6, 2.6, 2.2)),
         actions=[("card", dict(rel="memo_mkultra.png", u=0.5, v=0.5, wf=0.6, depth=2.6, t=9.7, rx=-12, rz=0,
                                stamp_=None)),
                  ("card", dict(rel="date_13apr1953.png", u=0.5, v=0.2, wf=0.62, depth=2.2, t=11.6, rz=-2))]),
    dict(id=6, t0=13.2, t1=15.7, plate="p2-office", cam=dict(p0=(0.1, -4.4, 1.3), p1=(-0.1, -3.9, 1.3), dof=(3.6, 3.2, 2.8)),
         actions=[("char", dict(cid="c1", u=0.5, v=0.9, h=0.62, yaw=0, lamp=-1,
                                keys=[(13.2, mixp(head(0, 0, 0)), (0, 0, 0)),
                                      (14.0, mixp({"Spine02": (8, 0, 0), "Spine01": (8, 0, 0)}, armp("Left", 38, 22, 2), armp("Right", 38, 22, 2), head(4, -12, 0)), (0, 0, 0)),
                                      (15.7, mixp({"Spine02": (11, 0, 0), "Spine01": (10, 0, 0)}, armp("Left", 40, 20, 2), armp("Right", 40, 20, 2), head(2, 12, 0)), (0, 0, 0))])),
                  ("fgcrop", dict(rect=(0.0, 1.0, 0.585, 1.0), frac=0.2)),
                  ("card", dict(rel="name_gottlieb.png", u=0.5, v=0.15, wf=0.62, depth=2.4, t=14.3, rz=1.5)),
                  ("dust", dict(n=30))]),
    dict(id=7, t0=15.7, t1=17.3, plate="p2-office", cam=dict(p0=(-0.3, -1.15, 0.22), p1=(0.3, -1.15, 0.22), pit0=-6, pit1=-6, dof=(1.15, 1.3, 3.0)),
         actions=[("bottles", dict(n=5, x0=-0.42, x1=0.42, y0=-0.05, y1=0.3)), ("dust", dict(n=24, depth=(0.5, 2.0), size=(0.0015, 0.004)))]),
    dict(id=8, t0=17.3, t1=19.7, plate="p2-office", cam=dict(p0=(0.0, -4.6, 1.3), p1=(0.1, -4.2, 1.3), dof=(3.8, 3.5, 2.8)),
         actions=[("char", dict(cid="c1", u=0.68, v=0.74, h=0.46, yaw=-10, lamp=-1, keys=[(17.3, {}, (0, 0, 0))])),
                  ("char", dict(cid="c2", u=0.36, v=0.98, h=0.72, yaw=12, lamp=-1, key_e=75,
                                keys=[(17.3, mixp(head(0, 0, 0)), (0, 0, 0)),
                                      (17.9, mixp(armp("Left", 18, 40, 10), head(0, 0, 0)), (0, 0, 0)),
                                      (18.7, mixp(armp("Left", 36, 128, 22), {"Spine01": (-2, 0, 0)}, head(-6, 8, 0)), (0, 0, 0)),
                                      (19.7, mixp(armp("Left", 36, 128, 22), {"Spine01": (-2, 0, 0)}, head(-8, 8, 0)), (0, 0, 0))],
                                props=[("LeftHand", p_cup, (0.0, -0.06, 0.03))])),
                  ("dust", dict(n=30))]),
    dict(id=9, t0=19.7, t1=23.5, plate="p3-cabin", cam=dict(p0=(-0.2, -6.0, 1.4), p1=(0.3, -4.7, 1.3)),
         actions=[("flicker_plate", dict(amp=0.08)),
                  ("light", dict(kind="POINT", pos=(-1.5, -3, 1.2), target=None, col="#ff9640", e=300, flick=0.35)),
                  ("card", dict(rel="date_nov1953.png", u=0.5, v=0.2, wf=0.62, depth=3.0, t=20.1, rz=-1.5)),
                  ("dust", dict(n=40))]),
    dict(id=10, t0=23.5, t1=25.7, plate="p3-cabin", cam=dict(p0=(0.03, -1.0, 0.2), p1=(0.0, -0.85, 0.2), pit0=-1, pit1=-1, dof=(1.0, 0.85, 2.8)),
         actions=[("drops", dict(t_list=[24.1, 24.55, 25.0], glass_pos=(0, 0, 0), tip_z=0.27)), ("flicker_plate", dict(amp=0.06, base=0.85)), ("dust", dict(n=20, depth=(0.4, 2), size=(0.0015, 0.004)))]),
    dict(id=11, t0=25.7, t1=27.8, plate="p3-cabin", cam=dict(p0=(0.3, -5.0, 1.3), p1=(0.1, -4.4, 1.3), dof=(4.3, 4.0, 2.8)),
         actions=[("flicker_plate", dict(amp=0.07)),
                  ("char", dict(cid="c2", u=0.77, v=0.9, h=0.6, yaw=-14, sit=0.5, lamp=-1, key_col="#ff9c52",
                                keys=[(25.7, mixp(SIT, head(2, 0, 0), armp("Right", 20, 45, 6)), (0, 0, 0)),
                                      (26.6, mixp(SIT, head(0, -8, 0), armp("Right", 38, 108, 14)), (0, 0, 0)),
                                      (27.8, mixp(SIT, head(-4, -8, 0), armp("Right", 40, 112, 14)), (0, 0, 0))],
                                props=[("RightHand", p_glass, (0.0, -0.05, 0.03))])),
                  ("card", dict(rel="name_olson.png", u=0.5, v=0.2, wf=0.7, depth=3.0, t=26.4, rz=1.5))]),
    dict(id=12, t0=27.8, t1=29.4, plate="p3-cabin", cam=dict(p0=(0, -5.5, 1.4), p1=(0, -5.0, 1.4), dof=(3.0, 3.0, 1.6)),
         actions=[("plate_k", dict(pairs=[(27.8, 1.0), (28.0, 0.32), (29.4, 0.3)])), ("calflip", dict(t0=27.95, step=0.15))]),
    dict(id=13, t0=29.4, t1=31.8, plate="p4-hotel", cam=dict(p0=(0, -6.0, 1.0), p1=(0, -5.3, 1.9), pit0=2, pit1=13),
         actions=[("curtain", dict(pu=0.72, pv=0.27, wf=0.05, hf=0.07)), ("rain", dict(n=70)), ("dust", dict(n=14, hexcol="#bcd0ff", depth=(2, 8)))]),
    dict(id=14, t0=31.8, t1=34.9, plate="p5-lab", cam=dict(p0=(-0.9, -5.6, 1.4), p1=(-1.5, -4.2, 1.4)),
         actions=[("shaft", dict(top=(0.5, 0.1), bot=(0.5, 0.55), width=0.3, hexcol="#78ff6a", strength=0.6)),
                  ("reels", dict(pos_pl=[(0.176, 0.405), (0.275, 0.395)], rad=0.055, t0=31.8, t1=34.9)),
                  ("card", dict(rel="place_montreal.png", u=0.5, v=0.2, wf=0.7, depth=3.0, t=32.6, rz=1))]),
    dict(id=15, t0=34.9, t1=37.6, plate="p5-lab", cam=dict(p0=(0.3, -5.0, 1.3), p1=(0.5, -4.4, 1.3), dof=(4.3, 4.0, 2.8)),
         actions=[("reels", dict(pos_pl=[(0.176, 0.405), (0.275, 0.395)], rad=0.055, t0=34.9, t1=37.6)),
                  ("char", dict(cid="c3", u=0.5, v=0.9, h=0.66, yaw=0, sit=0.46, lamp=-1, hips=(0.47, 0.64), roll=22, key_col="#e6dcc0", key_e=150, rim_col="#8aa070", rim_e=300,
                                keys=[(34.9, mixp(SIT, head(0, 0, 0), armp("Left", 12, 30, 4), armp("Right", 12, 30, 4)), (0, 0, 0)),
                                      (36.5, mixp(SIT, head(-24, 0, 0, 0.5), armp("Left", 12, 30, 4), armp("Right", 12, 30, 4)), (0, 0, 0)),
                                      (37.6, mixp(SIT, head(-26, 0, 0, 0.5), armp("Left", 12, 30, 4), armp("Right", 12, 30, 4)), (0, 0, 0))],
                                props=[("Head", p_headphones, (0, 0.0, 0.135))])),
                  ("pulse", dict(e=40, period=1.4, hexcol="#9ab070"))]),
    dict(id=16, t0=37.6, t1=40.4, plate="p5-lab", cam=dict(p0=(0.5, -4.4, 1.3), p1=(0.35, -4.9, 1.3), dof=(4.0, 4.3, 2.8)),
         actions=[("plate_k", dict(pairs=[(37.6, 0.95), (39.0, 0.75), (40.4, 0.9)])),
                  ("reels", dict(pos_pl=[(0.176, 0.405), (0.275, 0.395)], rad=0.055, t0=37.6, t1=40.4)),
                  ("char", dict(cid="c3", u=0.5, v=0.9, h=0.66, yaw=0, sit=0.46, lamp=-1, hips=(0.47, 0.64), roll=22, key_col="#e6dcc0", key_e=150, rim_col="#8aa070", rim_e=300,
                                keys=[(37.6, mixp(SIT, head(-24, 0, 0, 0.5), armp("Left", 12, 30, 4), armp("Right", 12, 30, 4)), (0, 0, 0)),
                                      (39.2, mixp(SIT, head(30, 0, 0, 0.5), {"Spine01": (22, 0, 0), "Spine": (12, 0, 0)}, armp("Left", 8, 30, 4), armp("Right", 8, 30, 4)), (0, 0, 0)),
                                      (40.4, mixp(SIT, head(34, 0, 0, 0.5), {"Spine01": (26, 0, 0), "Spine": (14, 0, 0)}, armp("Left", 8, 30, 4), armp("Right", 8, 30, 4)), (0, 0, 0))],
                                props=[("Head", p_headphones, (0, 0.0, 0.135))])),
                  ("days", dict(t0=37.7, t1=40.3, u=0.5, v=0.2, wf=0.5, depth=3.0)),
                  ("pulse", dict(e=90, period=0.5, hexcol="#9ab070"))]),
    dict(id=17, t0=40.4, t1=44.3, plate="p2-office", tint="#6a7aa8", plate_k=0.55, cam=dict(p0=(0.2, -5.2, 1.3), p1=(-0.1, -4.4, 1.3), dof=(2.4, 2.4, 2.4)),
         actions=[("card", dict(rel="memo_destroy.png", u=0.5, v=0.46, wf=0.6, depth=2.4, t=40.6, rz=-1.5,
                                stamp_=("stamp_destroy.png", 0.0, -0.05, 0.62, 44.0, 5))),
                  ("card", dict(rel="date_1973.png", u=0.5, v=0.15, wf=0.5, depth=2.4, t=41.2, rz=1.5)),
                  ("card", dict(rel="name_helms.png", u=0.5, v=0.7, wf=0.62, depth=2.4, t=42.4, rz=-1)),
                  ("dust", dict(n=26, hexcol="#aebfff"))]),
    dict(id=18, t0=44.3, t1=47.0, plate="p6-basement", cam=dict(p0=(1.9, -6.0, 1.3), p1=(2.2, -5.2, 1.4)),
         actions=[("flicker_plate", dict(amp=0.1, step=2)),
                  ("light", dict(kind="POINT", pos=(3.2, -3.0, 1.0), target=None, col="#ff8a30", e=500, flick=0.4)),
                  ("papers", dict(pu=0.86, pv=0.46, t0=44.5, n=15)),
                  ("embers", dict(pu=0.86, pv=0.46, n=44))]),
    dict(id=19, t0=47.0, t1=49.0, plate="p7-records", cam=dict(p0=(0, -6.0, 1.3), p1=(0, -1.2, 1.3), ease="BEZIER"),
         actions=[("card", dict(rel="number_20000.png", u=0.5, v=0.22, wf=0.7, depth=1.8, t=47.5, rz=-1.5)),
                  ("dust", dict(n=44, depth=(1, 8)))]),
    dict(id=20, t0=49.0, t1=51.9, plate="p7-records", cam=dict(p0=(0.2, -5.0, 1.4), p1=(0.0, -4.4, 1.4), dof=(3.6, 3.6, 2.8)),
         actions=[("light", dict(kind="AREA", pos=(1.6, -3.2, 2.6), target=(0, -1.3, 1.1), col="#ffd2a0", e=110, size=1.5)),
                  ("light", dict(kind="AREA", pos=(-1.8, 0.5, 1.8), target=(0, -1.3, 1.1), col="#9cb4ff", e=50, size=1.2)),
                  ("box", dict(t0=49.2, t1=50.6, p0=(0.7, 0.42, 9.0), p1=(0.5, 0.55, 3.4), size=0.7)),
                  ("dust", dict(n=34))]),
    dict(id=21, t0=51.9, t1=54.7, plate="p8-senate", cam=dict(p0=(0, -6.0, 1.3), p1=(0, -4.4, 1.3)),
         actions=[("flash", dict(times=[52.5, 53.3, 54.1], glows=[(0.06, 0.55), (0.95, 0.49), (0.04, 0.62)])),
                  ("card", dict(rel="date_1977.png", u=0.5, v=0.2, wf=0.5, depth=3.0, t=52.2, rz=1.5)),
                  ("dust", dict(n=30))]),
    dict(id=22, t0=54.7, t1=58.0, fade=True, plate="p8-senate", cam=dict(p0=(0, -3.6, 1.4), p1=(0, -5.2, 1.5), dof=(3.0, 3.6, 1.5)),
         actions=[("folder", dict(u=0.5, v=0.58, wf=0.5, depth=3.0, t=55.2, rx=-35, rz=3)), ("dust", dict(n=24))]),
]
SIGS = {5: dict(rel="memo", t=10.4)}

# ---------------------------------------------------------------- shared materials + world
V_MAT = grad_alpha_mat("vignette", "#000000", 1.0, "vig")
G_MAT = grad_alpha_mat("grain", "#808080", 1.0, "noise")
BLOB = [grad_alpha_mat("blob", "#000000", 1.0, "blob")]

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*hx("#4a3020"), 1)
bg.inputs["Strength"].default_value = 0.55

for sh in SHOTS:
    sh["f0"] = F(sh["t0"])
    sh["f1"] = F(sh["t1"]) - 1 if sh["id"] < 22 else LAST

t_build = time.time()
CTXS = {}
for sh in SHOTS:
    if ONLY and sh["id"] not in ONLY:
        continue
    ctx = build_shot(sh)
    CTXS[sh["id"]] = ctx
    # per-shot extras that need the built card objects (signature on memo of shot 5)
    if sh["id"] == 5:
        memo = [o for o in ctx.col.objects if o.name.startswith("card") and o.get("w")]
        memo = [o for o in memo if o.data.materials[0].name.endswith("memo_mkultra.png:0.6")][0]
        a_sig(ctx, memo, 10.4)
    if sh["id"] == 22 or sh["id"] == 1:
        pass
finalize_interp()
print(f"BUILD {time.time() - t_build:.1f}s")


# ---------------------------------------------------------------- visibility handler + render setup
def vis(*a):
    f = scene.frame_current
    for col, f0, f1 in SHOT_COLS:
        col.hide_render = not (f0 <= f <= f1)


bpy.app.handlers.frame_change_pre.append(vis)
bpy.app.handlers.render_pre.append(vis)

r = scene.render
r.engine = "BLENDER_EEVEE"
r.resolution_x, r.resolution_y, r.resolution_percentage = RES, RES * 16 // 9, 100
r.fps = FPS
scene.frame_start, scene.frame_end = 1, LAST
ee = scene.eevee
ee.taa_render_samples = SAMPLES
ee.use_shadows = True
try:
    ee.use_raytracing = False
    ee.shadow_ray_count, ee.shadow_step_count = 1, 3
    ee.use_fast_gi = False
except Exception as ex:
    print("EEVEE opts:", ex)
r.use_motion_blur = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.display_settings.display_device = "sRGB"
r.image_settings.file_format = "JPEG"
r.image_settings.quality = 90

try:  # bloom + warm gain
    ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
    scene.compositing_node_group = ng
    rl = ng.nodes.new("CompositorNodeRLayers"); rl.scene = scene
    gl = ng.nodes.new("CompositorNodeGlare")
    gl.inputs["Type"].default_value = "Bloom"
    gl.inputs["Threshold"].default_value = 1.0
    gl.inputs["Strength"].default_value = 0.5
    gl.inputs["Size"].default_value = 0.6
    cb = ng.nodes.new("CompositorNodeColorBalance")
    try:
        cb.correction_method = "LIFT_GAMMA_GAIN"
        cb.gain = (1.04, 1.0, 0.94, 1.0)
        cb.lift = (1.0, 0.99, 0.97, 1.0)
    except Exception as ex:
        print("CB opts:", ex)
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs["Image"], cb.inputs["Image"])
    ng.links.new(cb.outputs["Image"], go.inputs["Image"])
    r.use_compositing = True
except Exception as ex:
    print("COMP OFF:", ex)


def cam_at(f):
    c = None
    for sid, ctx in CTXS.items():
        if ctx.f0 <= f <= ctx.f1:
            c = ctx.camobj
    return c


def render_frame(f, path):
    scene.frame_set(f)
    scene.camera = cam_at(f)
    r.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


os.makedirs(OUT, exist_ok=True)
if STILLS:
    os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)
    for sid, ctx in CTXS.items():
        f = (ctx.f0 + ctx.f1) // 2
        dt = render_frame(f, os.path.join(OUT, "stills", f"s_{sid:02d}.jpg"))
        print(f"STILL shot {sid} frame {f} {dt:.1f}s")
elif FRAMES:
    os.makedirs(os.path.join(OUT, "test"), exist_ok=True)
    for f in FRAMES:
        dt = render_frame(f, os.path.join(OUT, "test", f"f_{f:04d}.jpg"))
        print(f"FRAME {f} {dt:.1f}s")
else:
    t = time.time()
    scene.frame_start, scene.frame_end = START, END
    scene.camera = cam_at(START)
    r.filepath = os.path.join(OUT, "frames", "f_")
    bpy.ops.render.render(animation=True)
    print(f"ANIM {START}-{END} {time.time() - t:.1f}s  {(time.time() - t) / (END - START + 1):.2f}s/frame")
