"""Summarevent logo v2 concepts (logo-design skill, redesign round).

A  Sobek S     : geometric S (paperclip construction) with a ticket tear across its spine.
B  Sigma       : Σ – the Greek S and the sign for "sum": every SUMMABA event in one pass.
C  Kursi Tiket : a seat whose cushion has ticket notches – your ticket is your seat.
Canvas 256×256, solid shapes only (no strokes, no text).
"""
import math, os, sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = sys.argv[1]
INK = "#111111"
GREEN, ORANGE, AMBER, YELLOW, CREAM, WHITE = "#006426", "#F26F22", "#F9A61B", "#FEDC01", "#FFF6E6", "#FFFFFF"


def f(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def svg(viewbox, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title">'
            f'<title id="title">{title}</title>{body}</svg>\n')


def write(name, viewbox, body, title):
    with open(os.path.join(OUT, name), "w") as fh:
        fh.write(svg(viewbox, body, title))


# ------------------------------------------------------------------ helpers
def rounded_polygon(pts, radii):
    """Closed polygon with a fillet radius per vertex (0 = sharp). Returns an SVG path d."""
    n = len(pts)
    segs = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        r = radii[i]
        if r <= 0:
            segs.append(("P", p1))
            continue
        v1 = (p0[0] - p1[0], p0[1] - p1[1]); l1 = math.hypot(*v1); v1 = (v1[0] / l1, v1[1] / l1)
        v2 = (p2[0] - p1[0], p2[1] - p1[1]); l2 = math.hypot(*v2); v2 = (v2[0] / l2, v2[1] / l2)
        ang = math.acos(max(-1, min(1, v1[0] * v2[0] + v1[1] * v2[1])))
        t = r / math.tan(ang / 2)
        a = (p1[0] + v1[0] * t, p1[1] + v1[1] * t)
        b = (p1[0] + v2[0] * t, p1[1] + v2[1] * t)
        # turn direction: cross of incoming (p0->p1) and outgoing (p1->p2)
        cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
        sweep = 1 if cross > 0 else 0
        segs.append(("A", a, b, r, sweep))
    d = []
    for i, s in enumerate(segs):
        if s[0] == "P":
            d.append(("M" if i == 0 else "L") + f"{f(s[1][0])} {f(s[1][1])}")
        else:
            _, a, b, r, sw = s
            d.append(("M" if i == 0 else "L") + f"{f(a[0])} {f(a[1])}")
            d.append(f"A{f(r)} {f(r)} 0 0 {sw} {f(b[0])} {f(b[1])}")
    return "".join(d) + "Z"


def rot180(p):
    return (256 - p[0], 256 - p[1])


# ------------------------------------------------------------------ A: Sobek S
W = 34.0          # stroke weight
H = W / 2
LC, RC = (98.0, 92.0), (158.0, 164.0)   # bend centres, centreline radius 36
RO, RI = 36 + H, 36 - H                  # 53 / 19
TOP_T, BOT_T = 200.0, 56.0               # terminals
NOTCH, GAP = 11.0, 7.0


def a_piece(m=lambda p: p):
    """Upper piece of the S (top bar, left bend, left half of the spine), mapped by m."""
    yb, yt = 128 + H, 128 - H                         # spine edges 145 / 111
    gx = 128 - GAP / 2
    dy = math.sqrt(NOTCH ** 2 - (GAP / 2) ** 2)
    P = lambda x, y: m((x, y))
    pts = {
        "t1": P(TOP_T, 128 - 72 - H), "t2": P(LC[0], 128 - 72 - H),
        "lo_mid": P(LC[0] - RO, LC[1]), "lo_end": P(LC[0], yb),
        "nb1": P(128 - NOTCH, yb), "nb2": P(gx, yb - dy), "nt2": P(gx, yt + dy), "nt1": P(128 - NOTCH, yt),
        "li_end": P(LC[0], yt), "li_mid": P(LC[0] - RI, LC[1]), "li_top": P(LC[0], LC[1] - RI), "t3": P(TOP_T, LC[1] - RI),
    }
    g = lambda k: f"{f(pts[k][0])} {f(pts[k][1])}"
    return (f"M{g('t1')}L{g('t2')}"
            f"A{f(RO)} {f(RO)} 0 0 0 {g('lo_mid')}A{f(RO)} {f(RO)} 0 0 0 {g('lo_end')}"
            f"L{g('nb1')}A{f(NOTCH)} {f(NOTCH)} 0 0 1 {g('nb2')}L{g('nt2')}A{f(NOTCH)} {f(NOTCH)} 0 0 1 {g('nt1')}"
            f"L{g('li_end')}A{f(RI)} {f(RI)} 0 0 1 {g('li_mid')}A{f(RI)} {f(RI)} 0 0 1 {g('li_top')}"
            f"L{g('t3')}Z")


def concept_a(c1=INK, c2=INK):
    return f'<path fill="{c1}" d="{a_piece()}"/><path fill="{c2}" d="{a_piece(rot180)}"/>'


# ------------------------------------------------------------------ B: Sigma
def sigma_points():
    k = math.tan(math.radians(30))     # diagonals at 60° from horizontal
    top, bar, mid = 40.0, 42.0, 128.0
    left, right, h = 51.0, 195.0, 50.0  # h = horizontal thickness of the diagonals (shifted 5 px: optical centre)
    A = (left, top); B = (right, top); C = (right, top + bar)
    D = (left + h + (top + bar - top) * k, top + bar)
    E = (left + h + (mid - top) * k, mid)
    J = (left + (mid - top) * k, mid)
    F = (D[0], 256 - top - bar); G = (right, 256 - top - bar); Hh = (right, 256 - top); I = (left, 256 - top)
    return A, B, C, D, E, F, G, Hh, I, J


def concept_b(c1=INK, c2=None):
    A, B, C, D, E, F, G, Hh, I, J = sigma_points()
    if c2 is None:
        d = rounded_polygon([A, B, C, D, E, F, G, Hh, I, J], [14, 10, 6, 8, 10, 8, 6, 10, 14, 10])
        return f'<path fill="{c1}" d="{d}"/>'
    up = rounded_polygon([A, B, C, D, E, J], [14, 10, 6, 8, 0, 0])
    lo = rounded_polygon([J, E, F, G, Hh, I], [0, 0, 8, 6, 10, 14])
    return f'<path fill="{c1}" d="{up}"/><path fill="{c2}" d="{lo}"/>'


# ------------------------------------------------------------------ C: Kursi Tiket
def concept_c(c1=INK, c2=INK):
    back = rounded_polygon([(72, 40), (184, 40), (184, 140), (72, 140)], [36, 36, 14, 14])
    # seat: pill with a ticket notch bitten out of each end
    y0, y1, x0, x1, r, nr = 152.0, 208.0, 44.0, 212.0, 28.0, 13.0
    cy = (y0 + y1) / 2
    # end lobes: a semicircle of radius r with a notch of radius nr centred on its tip
    dx = math.sqrt(nr ** 2 - 0)  # notch centre sits on the pill tip
    def lobe_pts(side):
        # intersection of pill end circle (centre at x0+r or x1-r, radius r) and notch circle (centre at tip, radius nr)
        cxp = x0 + r if side < 0 else x1 - r
        tip = x0 if side < 0 else x1
        dd = abs(cxp - tip)  # = r
        a = (r * r - nr * nr + dd * dd) / (2 * dd)
        hh = math.sqrt(max(0, r * r - a * a))
        xm = cxp + (tip - cxp) * a / dd
        return (xm, cy - hh), (xm, cy + hh)
    lt, lb = lobe_pts(-1)
    rt, rb = lobe_pts(1)
    seat = (f"M{f(x0 + r)} {f(y0)}L{f(x1 - r)} {f(y0)}"
            f"A{f(r)} {f(r)} 0 0 1 {f(rt[0])} {f(rt[1])}"
            f"A{f(nr)} {f(nr)} 0 0 0 {f(rb[0])} {f(rb[1])}"
            f"A{f(r)} {f(r)} 0 0 1 {f(x1 - r)} {f(y1)}"
            f"L{f(x0 + r)} {f(y1)}"
            f"A{f(r)} {f(r)} 0 0 1 {f(lb[0])} {f(lb[1])}"
            f"A{f(nr)} {f(nr)} 0 0 0 {f(lt[0])} {f(lt[1])}"
            f"A{f(r)} {f(r)} 0 0 1 {f(x0 + r)} {f(y0)}Z")
    return f'<path fill="{c1}" d="{back}"/><path fill="{c2}" d="{seat}"/>'



# ------------------------------------------------------------------ C2: Kursimu (frame + seat)
def concept_c2(c1=INK, c2=INK):
    """Four scanner corners lock one seat: choose your seat, scan at the door."""
    t, arm, o, r = 30.0, 66.0, 40.0, 22.0       # corner thickness, arm length, outer inset, outer radius
    a, b = o, 256 - o
    def corner(rot):
        # L-shape in the top-left, rounded outer corner, rotated about the centre
        pts = [(a, a + arm), (a, a), (a + arm, a), (a + arm, a + t), (a + t, a + t), (a + t, a + arm)]
        d = rounded_polygon(pts, [t / 2, r, t / 2, t / 2 - 1, 6, t / 2])
        return f'<path fill="{c1}" transform="rotate({rot} 128 128)" d="{d}"/>'
    seat_back = rounded_polygon([(100, 92), (156, 92), (156, 140), (100, 140)], [18, 18, 6, 6])
    seat_base = rounded_polygon([(88, 148), (168, 148), (168, 172), (88, 172)], [12, 12, 12, 12])
    return "".join(corner(r_) for r_ in (0, 90, 180, 270)) + f'<path fill="{c2}" d="{seat_back}"/><path fill="{c2}" d="{seat_base}"/>'


# ------------------------------------------------------------------ C3: Kursi Lipat (a ticket folded into a chair)
def concept_c3(c1=INK, c2=None):
    """One ticket strip folded into a chair (side view); both ends keep their ticket notch."""
    t = 38.0; h = t / 2
    x0, x1, y0, y1, y2 = 84.0, 176.0, 38.0, 140.0, 218.0   # backrest x, leg x, top, seat line, floor
    rc = 26.0                                               # centreline bend radius
    ro, ri = rc + h, rc - h
    nr = 12.0                                               # notch radius at both ends
    # outline: start at the top end (outer = left edge of the backrest), go down, round the seat corner, along the seat, down the leg
    d = []
    d.append(f"M{f(x0 - h)} {f(y0)}")                                  # top-left of backrest end
    d.append(f"L{f(x0 - h)} {f(y1 + h - ro)}")                         # down the outer backrest edge
    d.append(f"A{f(ro)} {f(ro)} 0 0 0 {f(x0 - h + ro)} {f(y1 + h)}")   # outer bend (bottom-left)
    d.append(f"L{f(x1 - h - ri)} {f(y1 + h)}")                         # under the seat
    d.append(f"A{f(ri)} {f(ri)} 0 0 1 {f(x1 - h)} {f(y1 + h + ri)}")   # inner bend (seat front, underside)
    d.append(f"L{f(x1 - h)} {f(y2)}")                                  # down the inner leg edge
    # bottom end with notch (concave semicircle centred on the end line)
    d.append(f"L{f(x1 - nr)} {f(y2)}A{f(nr)} {f(nr)} 0 0 1 {f(x1 + nr)} {f(y2)}L{f(x1 + h)} {f(y2)}")
    d.append(f"L{f(x1 + h)} {f(y1 - h + ro)}")                         # up the outer leg edge
    d.append(f"A{f(ro)} {f(ro)} 0 0 0 {f(x1 + h - ro)} {f(y1 - h)}")   # outer bend (seat front, top)
    d.append(f"L{f(x0 + h + ri)} {f(y1 - h)}")                         # seat top surface
    d.append(f"A{f(ri)} {f(ri)} 0 0 1 {f(x0 + h)} {f(y1 - h - ri)}")   # inner bend (backrest/seat)
    d.append(f"L{f(x0 + h)} {f(y0)}")                                  # up the inner backrest edge
    d.append(f"L{f(x0 + nr)} {f(y0)}A{f(nr)} {f(nr)} 0 0 1 {f(x0 - nr)} {f(y0)}Z")  # top end with notch
    path = "".join(d)
    dx = 128 - (x0 - h + x1 + h) / 2
    return f'<path fill="{c1}" transform="translate({f(dx)} 0)" d="{path}"/>'


# ------------------------------------------------------------------ C4: Lorong (S-shaped aisle between two seat blocks)
_lid = [0]
def concept_c4(c1=INK, c2=INK, gap_color="#FFFFFF", inset=40.0, gap=24.0, rx=40.0):
    """Two seat blocks split by an S-shaped aisle. Concept render (clip + aisle drawn in the ground colour)."""
    _lid[0] += 1
    cid = f"blk{_lid[0]}"
    a, b = inset, 256 - inset
    top, mid, bot = 92.0, 128.0, 164.0
    r = mid - top
    lx, rx2 = 104.0, 152.0
    centre = f"M300 {f(top)}L{f(lx)} {f(top)}A{f(r)} {f(r)} 0 0 0 {f(lx)} {f(mid)}L{f(rx2)} {f(mid)}A{f(r)} {f(r)} 0 0 1 {f(rx2)} {f(bot)}L-44 {f(bot)}"
    upper = f"M-10 -10L300 -10L300 {f(top)}L{f(lx)} {f(top)}A{f(r)} {f(r)} 0 0 0 {f(lx)} {f(mid)}L{f(rx2)} {f(mid)}A{f(r)} {f(r)} 0 0 1 {f(rx2)} {f(bot)}L-10 {f(bot)}Z"
    return (f'<defs><clipPath id="{cid}"><rect x="{f(a)}" y="{f(a)}" width="{f(b - a)}" height="{f(b - a)}" rx="{f(rx)}"/></clipPath></defs>'
            f'<g clip-path="url(#{cid})"><rect width="256" height="256" fill="{c2}"/><path fill="{c1}" d="{upper}"/>'
            f'<path fill="none" stroke="{gap_color}" stroke-width="{f(gap)}" d="{centre}"/></g>')

# ------------------------------------------------------------------ wordmark
def wordmark(font_path, text="summarevent", weight=640, cap=132.0, tracking=-3):
    font = TTFont(font_path)
    inst = instancer.instantiateVariableFont(font, {"wght": weight})
    gs, cmap, upm = inst.getGlyphSet(), inst.getBestCmap(), inst["head"].unitsPerEm
    xh = inst["OS/2"].sxHeight or 0.52 * upm
    s = cap / xh
    hmtx = inst["hmtx"]
    x, cmds = 0.0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, xh * s)))
        cmds.append(pen.getCommands())
        x += hmtx[g][0] * s + tracking
    return "".join(cmds), x - tracking, xh * s


if __name__ == "__main__":
    concepts = {"a": concept_a, "b": concept_b, "c": concept_c4}
    titles = {"a": "Sobek S", "b": "Sigma", "c": "Lorong"}
    for k, fn in concepts.items():
        write(f"{k}-symbol.svg", "0 0 256 256", fn(), f"Summarevent – konsep {titles[k]}")
    wm, w, xh = wordmark(FONT)
    gap = 52.0
    for k, fn in concepts.items():
        body = fn() + f'<path fill="{INK}" transform="translate({f(256 + gap)} {f(128 - xh / 2)})" d="{wm}"/>'
        write(f"{k}-lockup.svg", f"0 0 {f(256 + gap + w + 6)} 256", body, f"Summarevent lockup {titles[k]}")
    # colour app tiles (the showcase format the user referenced)
    def tile(bg, inner, scale=0.8):
        o = 128 * (1 - scale)
        return (f'<rect width="256" height="256" rx="58" fill="{bg}"/>'
                f'<g transform="translate({f(o)} {f(o)}) scale({scale})">{inner}</g>')
    tiles = {
        "a": tile(ORANGE, concept_a(WHITE, GREEN)),
        "b": tile(CREAM, concept_b(GREEN, ORANGE)),
        "c": tile(CREAM, concept_c4(GREEN, ORANGE, CREAM), 1.0),
        "a2": tile(GREEN, concept_a(WHITE, ORANGE)),
        "b2": tile(GREEN, concept_b(WHITE, ORANGE)),
        "c2": tile(GREEN, concept_c4(WHITE, ORANGE, GREEN), 1.0),
    }
    for k, body in tiles.items():
        write(f"{k}-tile.svg", "0 0 256 256", body, f"Summarevent app icon {titles.get(k[0], k)}")
    json.dump({"wordmark_width": w, "xh": xh}, open(os.path.join(OUT, "meta.json"), "w"))
    print("ok", round(w), round(xh))
