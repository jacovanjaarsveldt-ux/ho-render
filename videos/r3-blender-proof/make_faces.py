#!/usr/bin/env python3
"""Draw the 2D face expressions as transparent PNGs (no credits, no AI).

Each face is a 512 px decal that the Blender scene wraps onto the front of a
character's head. Drawn 4x oversize and scaled down for clean edges.
  python3 make_faces.py            -> faces/*.png
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "faces")
S = 2048  # working size
INK = (25, 22, 30, 255)
GREY = (110, 108, 118, 255)
WHITE = (255, 255, 255, 255)
TOOTH = (250, 250, 245, 255)
BLUE = (90, 170, 255, 255)


def new():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, name + ".png"))


def P(x, y):  # coordinates in a 0..100 box
    return (x / 100 * S, y / 100 * S)


def box(x0, y0, x1, y1):
    return [P(x0, y0), P(x1, y1)]


W = lambda w: int(w / 100 * S)


def smug():
    im, d = new()
    for cx in (33, 67):  # half-lidded eyes: grey lower half moon under a flat lid
        d.pieslice(box(cx - 13, 37, cx + 13, 59), 0, 180, fill=GREY)
        d.line([P(cx - 15, 48), P(cx + 15, 48)], fill=INK, width=W(2.2))
    d.line([P(20, 35), P(44, 31)], fill=GREY, width=W(2.6))   # brows, one raised
    d.line([P(56, 27), P(81, 31)], fill=GREY, width=W(2.6))
    d.arc(box(40, 58, 68, 78), 20, 150, fill=INK, width=W(2.4))  # smirk
    save(im, "smug")


def grin():
    im, d = new()
    for cx in (32, 68):  # happy closed eyes
        d.arc(box(cx - 13, 36, cx + 13, 60), 200, 340, fill=INK, width=W(3.2))
    d.line([P(17, 27), P(42, 31)], fill=INK, width=W(3))   # sly brows
    d.line([P(83, 27), P(58, 31)], fill=INK, width=W(3))
    d.chord(box(22, 44, 78, 90), 0, 180, fill=TOOTH, outline=INK, width=W(2.6))  # wide toothy smile
    d.line([P(22, 67), P(78, 67)], fill=INK, width=W(2.6))
    for x in (36, 50, 64):
        d.line([P(x, 67), P(x, 86)], fill=INK, width=W(1.3))
    d.arc(box(22, 54, 78, 100), 200, 340, fill=INK, width=W(1.3))
    save(im, "grin")


def panic():
    im, d = new()
    for cx in (32, 68):
        d.ellipse(box(cx - 14, 30, cx + 14, 60), fill=WHITE, outline=INK, width=W(2.6))
        d.ellipse(box(cx - 3.5, 42, cx + 3.5, 49), fill=INK)
    d.line([P(16, 27), P(40, 20)], fill=INK, width=W(3))
    d.line([P(84, 27), P(60, 20)], fill=INK, width=W(3))
    d.ellipse(box(38, 64, 62, 90), fill=(60, 20, 30, 255), outline=INK, width=W(2.4))
    d.ellipse(box(44, 78, 56, 89), fill=(230, 110, 120, 255))
    d.polygon([P(88, 30), P(93, 44), P(83, 44)], fill=BLUE)  # sweat drop
    d.ellipse(box(83, 39, 93, 49), fill=BLUE)
    save(im, "panic")


def bored():
    im, d = new()
    for cx in (33, 67):
        d.ellipse(box(cx - 5, 44, cx + 5, 54), fill=INK)
        d.line([P(cx - 13, 41), P(cx + 13, 41)], fill=INK, width=W(2.4))
    d.line([P(40, 72), P(60, 72)], fill=INK, width=W(2.6))
    save(im, "bored")


def shock():
    im, d = new()
    for cx in (32, 68):
        d.ellipse(box(cx - 11, 34, cx + 11, 58), fill=WHITE, outline=INK, width=W(2.6))
        d.ellipse(box(cx - 3, 43, cx + 3, 49), fill=INK)
    d.ellipse(box(43, 66, 57, 82), fill=INK)
    save(im, "shock")


if __name__ == "__main__":
    smug(); grin(); panic(); bored(); shock()
    print("faces written to", OUT)
