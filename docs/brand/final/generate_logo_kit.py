"""Summarevent logo kit – direction C "Lorong" (chosen 3 Nov 2026), refined.

Two seat blocks (rounded square, split in two colours) with an S-shaped aisle between them.
Refinement vs. the concept: true semicircle bends, round aisle ends that stop inside the blocks
(no sharp mouths), friendlier corner radius, baked outlines (no clip, no stroke).
Canvas 256×256; the mark occupies 40…216.

Regenerates the SVGs next to this file:
  pip install fonttools && python3 generate_logo_kit.py path/to/PlusJakartaSans[wght].ttf
"""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = sys.argv[1]
GREEN, GREEN_DARK, GREEN_LIGHT = "#006426", "#004D1D", "#0B7A35"
ORANGE, CREAM, WHITE, INK = "#F26F22", "#FFF6E6", "#FFFFFF", "#111111"


def f(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def svg(viewbox, body, title, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title">'
            f'<title id="title">{title}</title>{defs}{body}</svg>\n')


def write(name, viewbox, body, title, defs=""):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(svg(viewbox, body, title, defs))


def block_path(w=24.0, rc=44.0, x0=40.0, x1=216.0, yt=86.0, ym=128.0, yb=170.0, lx=104.0, rx=152.0, cap_in=26.0, rot=False):
    """Upper block outline (or the lower one when rot=True: 180° about the centre)."""
    h = w / 2
    rb = (ym - yt) / 2                       # bend centre-line radius
    ri, ro = rb - h, rb + h
    t_end, b_end = x1 - cap_in, x0 + cap_in  # aisle terminals (cap centres)
    P = (lambda x, y: (256 - x, 256 - y)) if rot else (lambda x, y: (x, y))
    pts = lambda x, y: "{} {}".format(*[f(v) for v in P(x, y)])
    d = [
        f"M{pts(x1, yt)}",
        f"L{pts(x1, x0 + rc)}", f"A{f(rc)} {f(rc)} 0 0 0 {pts(x1 - rc, x0)}",
        f"L{pts(x0 + rc, x0)}", f"A{f(rc)} {f(rc)} 0 0 0 {pts(x0, x0 + rc)}",
        f"L{pts(x0, yb)}",
        f"L{pts(b_end - h, yb)}", f"A{f(h)} {f(h)} 0 0 1 {pts(b_end, yb - h)}",          # left cap, upper quarter
        f"L{pts(rx, yb - h)}", f"A{f(ri)} {f(ri)} 0 0 0 {pts(rx, ym + h)}",              # right bend, inner side
        f"L{pts(lx, ym + h)}", f"A{f(ro)} {f(ro)} 0 0 1 {pts(lx, yt - h)}",              # left bend, outer side
        f"L{pts(t_end, yt - h)}", f"A{f(h)} {f(h)} 0 0 1 {pts(t_end + h, yt)}",          # right cap, upper quarter
        "Z",
    ]
    return "".join(d)


def mark(c1, c2, **kw):
    return f'<path fill="{c1}" d="{block_path(**kw)}"/><path fill="{c2}" d="{block_path(rot=True, **kw)}"/>'


def wordmark(text="summarevent", weight=680, cap=132.0, tracking=-3):
    font = TTFont(FONT)
    inst = instancer.instantiateVariableFont(font, {"wght": weight})
    gs, cmap = inst.getGlyphSet(), inst.getBestCmap()
    xh = inst["OS/2"].sxHeight
    s = cap / xh
    hmtx = inst["hmtx"]
    x, cmds = 0.0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, xh * s)))
        cmds.append(pen.getCommands())
        x += hmtx[g][0] * s + tracking
    asc_desc = (inst["OS/2"].sTypoAscender * s, -inst["OS/2"].sTypoDescender * s)
    return "".join(cmds), x - tracking, xh * s


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    T = "Summarevent"
    # --- symbol variants (transparent aisle)
    write("summarevent-symbol.svg", "0 0 256 256", mark(GREEN, ORANGE), T)
    write("summarevent-symbol-white.svg", "0 0 256 256", mark(WHITE, ORANGE), T)
    write("summarevent-symbol-mono.svg", "0 0 256 256", mark(GREEN, GREEN), T)
    write("summarevent-symbol-black.svg", "0 0 256 256", mark(INK, INK), T)
    small = dict(w=32.0, rc=46.0, cap_in=30.0)   # small-size cut: wider aisle, rounder
    write("summarevent-symbol-small.svg", "0 0 256 256", mark(GREEN, ORANGE, **small), T)

    # --- app icon: green tile with a soft top-light gradient, cream + orange blocks
    grad = (f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{GREEN_LIGHT}"/><stop offset="1" stop-color="{GREEN_DARK}"/></linearGradient></defs>')
    def icon(scale, rounded, glyph_kw=None, c1=CREAM, c2=ORANGE, bg="url(#bg)"):
        o = 128 * (1 - scale)
        rect = f'<rect width="256" height="256" rx="{58 if rounded else 0}" fill="{bg}"/>'
        return rect + f'<g transform="translate({f(o)} {f(o)}) scale({scale})">{mark(c1, c2, **(glyph_kw or {}))}</g>'
    write("app-icon.svg", "0 0 256 256", icon(1.0, True), T + " app icon", grad)             # store / launcher look
    write("app-icon-square.svg", "0 0 256 256", icon(1.0, False), T + " app icon", grad)     # apple-touch (iOS masks it)
    write("app-icon-maskable.svg", "0 0 256 256", icon(0.8, False), T + " app icon", grad)   # Android adaptive safe zone
    write("app-icon-favicon.svg", "0 0 256 256", icon(1.08, True, small), T, grad)            # tabs: tile + small cut
    write("app-icon-cream.svg", "0 0 256 256", icon(1.0, True, None, GREEN, ORANGE, CREAM), T + " app icon (krem)")

    # --- wordmark + lockups
    wm, ww, xh = wordmark()
    # horizontal lockup: crop the symbol canvas to its 40…216 box; wordmark x-height = 0.62 of the mark height
    mark_h = 176.0
    s_wm = (mark_h * 0.62) / xh
    gap = 40.0
    wm_w = ww * s_wm
    total = mark_h + gap + wm_w
    def lockup(c1, c2, wcol):
        body = (f'<g transform="translate(-40 -40)">{mark(c1, c2)}</g>'
                f'<path fill="{wcol}" transform="translate({f(mark_h + gap)} {f(mark_h / 2 - xh * s_wm / 2)}) scale({f(s_wm)})" d="{wm}"/>')
        return body
    vb = f"0 0 {f(total + 4)} {f(mark_h)}"
    write("summarevent-lockup.svg", vb, lockup(GREEN, ORANGE, GREEN), T)
    write("summarevent-lockup-white.svg", vb, lockup(WHITE, ORANGE, WHITE), T)
    # stacked lockup: wordmark 1.7× as wide as the mark, centred under it
    st = (mark_h * 1.7) / ww
    st_w = ww * st
    wm_y = mark_h + 30
    body = (f'<g transform="translate({f((st_w - mark_h) / 2 - 40)} -40)">{mark(GREEN, ORANGE)}</g>'
            f'<path fill="{GREEN}" transform="translate(0 {f(wm_y)}) scale({f(st)})" d="{wm}"/>')
    write("summarevent-lockup-stacked.svg", f"0 0 {f(st_w)} {f(wm_y + xh * st * 1.12)}", body, T)
    write("summarevent-wordmark.svg", f"0 0 {f(ww + 4)} {f(xh * 1.62)}", f'<path fill="{GREEN}" transform="translate(0 {f(xh * 0.32)})" d="{wm}"/>', "summarevent")
    print("ok", round(ww), round(xh), round(total))
