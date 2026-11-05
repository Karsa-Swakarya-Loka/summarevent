/**
 * Sticker Slap: the landing page as a loud, friendly studio footer. A cream frame, a green panel with the three roles
 * as columns, and a giant fat script wordmark sinking into the bottom edge with die-cut stickers slapped all over it.
 *
 * The storyboard, once per visit: the panel grows out of the frame and its corners settle; the column tags pop and
 * the lines rise out of their masks; the wordmark writes itself in one continuous marker stroke (t-crosses and
 * i-dots last) and every sticker slaps down the moment the pen passes under it. After that it is a toy: drag the
 * stickers anywhere (they tilt with the throw and thwack back down), double-click one to send it home, click the
 * wordmark to write it again. Under reduced motion everything is simply there.
 *
 * Adapted from Sticker Slap Footer (React only, nothing fetched): the script alphabet is a built-in single-stroke
 * font drawn as SVG, the burst and bubble stickers are drawn in code, and the other stickers are our own.
 */
import * as React from 'react'
import { Link } from 'react-router'
import { clamp, layoutScript, round, starPath, stickerSpots, type Spot } from './script'


export type StickerKind = 'burst' | 'bubble' | 'heart' | 'bolt'

export type StickerSpec = {
  kind?: StickerKind
  /** Own sticker art; replaces `kind`. */
  node?: React.ReactNode
  /** Accessible name, e.g. "Stiker kursi". */
  label: string
  /** Text on the burst and bubble stickers (letters a–z, ! and .). */
  text?: string
  /** Position in % of the wordmark box; omit to let it find a letter. */
  x?: number
  y?: number
  /** Width in % of the wordmark box. */
  size?: number
  rotate?: number
}

export type Line = { label: React.ReactNode; name?: string; onClick?: () => void; to?: string; href?: string; disabled?: boolean }
export type Column = { tag: string; lines: Line[]; note?: React.ReactNode }

export interface StickerSlapProps {
  /** The giant script wordmark. Letters a–z, `!` and `.`; anything else is a space. */
  wordmark: string
  /** The starburst sticker in the top-left corner: a word in the script (letters a–z), and where it links. */
  badge?: { label: string; href?: string; to?: string; title?: string }
  /** What sits in the middle of the top bar. */
  centre?: React.ReactNode
  /** The info menu in the top-right corner, behind a toggle that morphs between hamburger and close. */
  menu?: React.ReactNode
  menuLabel?: string
  columns: Column[]
  stickers: StickerSpec[]
  /** Minimum height. Any definite CSS length. */
  height?: string
  /** Caps the wordmark's height so short words don't get enormous. */
  wordmarkMaxHeight?: string
  paper?: string
  panel?: string
  ink?: string
  /** The wordmark and the panel text. Defaults to `paper`. */
  cream?: string
  accent?: string
  className?: string
}

/** How far below the baseline the panel edge cuts the wordmark, in script units. */
const CUT = -1.2
const STROKE = 3.3
/** The script leans: tan(9°). */
const SLANT = 0.1584

const CSS =
  '.ssf{position:relative;isolation:isolate;overflow:hidden;overflow:clip;container-type:inline-size;display:flex;flex-direction:column;width:100%;box-sizing:border-box;padding:0 clamp(6px,.9cqw,12px) clamp(6px,.9cqw,12px);background:var(--ssf-paper);color:var(--ssf-ink);font-family:var(--ssf-sans);font-weight:500;-webkit-font-smoothing:antialiased}' +
  ':where(.ssf) *,:where(.ssf) *::before,:where(.ssf) *::after{box-sizing:border-box}' +
  ':where(.ssf) button{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer}' +
  ':where(.ssf) a{color:inherit;text-decoration:none}' +
  ':where(.ssf) ul,:where(.ssf) p,:where(.ssf) h2{margin:0;padding:0;list-style:none;font:inherit}' +
  '.ssf svg{display:block;max-width:none;overflow:visible}' +
  '.ssf :focus-visible{outline:2.5px solid var(--ssf-accent);outline-offset:3px;border-radius:6px}' +
  '.ssf-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}' +
  // top bar
  '.ssf-top{position:relative;z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:clamp(10px,1.4cqw,18px) clamp(8px,1.2cqw,18px) clamp(18px,3.6cqw,56px)}' +
  '.ssf-badge{justify-self:start;display:block;width:clamp(58px,6cqw,80px);rotate:-8deg;transition:transform .5s cubic-bezier(.2,1.6,.3,1)}' +
  '.ssf-badge:hover{transform:rotate(10deg) scale(1.08)}' +
  '.ssf-badge svg{width:100%;height:auto;filter:drop-shadow(0 1px .5px rgba(10,30,16,.25)) drop-shadow(0 4px 6px rgba(10,30,16,.15))}' +
  '.ssf-mid{display:flex;justify-content:center;min-width:0}' +
  '.ssf-corner{justify-self:end;position:relative;display:flex;align-items:center}' +
  // the toggle: three bars that fold into a cross
  '.ssf-burger{position:relative;display:block;width:44px;height:44px;border-radius:50%;background:var(--ssf-paper);box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--ssf-ink) 22%,transparent);transition:background .25s,box-shadow .25s}' +
  '.ssf-burger:hover{background:color-mix(in oklab,var(--ssf-ink) 6%,var(--ssf-paper))}' +
  '.ssf-burger[aria-expanded="true"]{background:var(--ssf-ink);box-shadow:none}' +
  '.ssf-burger i{position:absolute;left:12px;top:calc(50% - 1.1px);width:20px;height:2.2px;border-radius:2px;background:var(--ssf-ink);transition:transform .5s cubic-bezier(.2,1.3,.3,1),opacity .25s,background .25s}' +
  '.ssf-burger i:nth-child(1){transform:translateY(-6px)}' +
  '.ssf-burger i:nth-child(3){transform:translateY(6px)}' +
  '.ssf-burger[aria-expanded="true"] i{background:var(--ssf-paper)}' +
  '.ssf-burger[aria-expanded="true"] i:nth-child(1){transform:rotate(45deg)}' +
  '.ssf-burger[aria-expanded="true"] i:nth-child(2){opacity:0;transform:scaleX(.2)}' +
  '.ssf-burger[aria-expanded="true"] i:nth-child(3){transform:rotate(-45deg)}' +
  // the menu under it
  '.ssf-menu{position:absolute;right:0;top:calc(100% + 10px);z-index:20;width:max-content;max-width:min(22rem,calc(100cqw - 24px));padding:14px 16px;border-radius:18px;background:var(--ssf-paper);color:var(--ssf-ink);box-shadow:0 0 0 4px #fff,0 18px 40px rgba(10,30,16,.3);transform-origin:95% 0;animation:ssf-popin .45s cubic-bezier(.2,1.5,.3,1)}' +
  '.ssf-mhead{font-size:15px;font-weight:800;letter-spacing:-.01em}' +
  '.ssf-mnote{margin-top:2px;max-width:30ch;font-size:12.5px;line-height:1.45;opacity:.78}' +
  '.ssf-msep{height:1.5px;margin:10px 0;border-radius:2px;background:color-mix(in oklab,var(--ssf-ink) 14%,transparent)}' +
  '.ssf-mi{display:flex;align-items:center;gap:10px;width:calc(100% + 20px);min-height:44px;margin:0 -10px;padding:0 10px;border-radius:12px;font-size:14px;font-weight:600;text-align:left;transition:background .2s}' +
  '.ssf-mi:hover{background:color-mix(in oklab,var(--ssf-ink) 7%,transparent)}' +
  '.ssf-mi svg{width:18px;height:18px;flex:none}' +
  '.ssf-mcred{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin-top:6px;font-size:12.5px;line-height:1.35}' +
  '.ssf-mcred dt{font-weight:600;opacity:.74}' +
  '.ssf-mcred dd{margin:0;font-weight:700}' +
  // panel
  '.ssf-panel{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;overflow:hidden;overflow:clip;border-radius:clamp(14px,1.8cqw,24px);background:var(--ssf-panel);color:var(--ssf-cream);transform-origin:50% 100%}' +
  '.ssf-cols{position:relative;z-index:2;display:grid;grid-template-columns:repeat(var(--ssf-n,3),minmax(0,1fr));gap:clamp(18px,2.6cqw,40px) clamp(16px,2.4cqw,36px);padding:clamp(22px,4.6cqw,64px) clamp(18px,1.8cqw,26px) clamp(16px,2.4cqw,32px)}' +
  '.ssf-col{display:flex;flex-direction:column;align-items:flex-start;min-width:0}' +
  '.ssf-tag{display:inline-block;margin-bottom:clamp(10px,1.3cqw,18px);padding:.28em .72em .32em;border-radius:999px;background:var(--ssf-cream);color:var(--ssf-ink);font-size:clamp(12px,1.05cqw,14px);font-weight:700;line-height:1.2;letter-spacing:-.005em}' +
  '.ssf-big{font-size:clamp(19px,2.1cqw,30px);font-weight:800;line-height:1.16;letter-spacing:-.022em}' +
  '.ssf-line{display:block;overflow:hidden;overflow:clip;padding:0 .08em .06em;margin:0 -.08em -.06em}' +
  '.ssf-line>*{display:inline-flex;align-items:center;min-height:44px}' +
  '.ssf-big a,.ssf-big button{position:relative;text-align:left;transition:color .2s}' +
  '.ssf-big button:disabled{cursor:progress;opacity:.7}' +
  '.ssf-big a::after,.ssf-big button::after{content:"";position:absolute;left:0;right:0;bottom:.5em;height:.09em;border-radius:1em;background:currentColor;transform:scaleX(0);transform-origin:100% 50%;transition:transform .45s cubic-bezier(.6,0,.2,1)}' +
  '.ssf-big a:hover::after,.ssf-big button:hover::after,.ssf-big a:focus-visible::after,.ssf-big button:focus-visible::after{transform:scaleX(1);transform-origin:0 50%}' +
  '.ssf-big .ssf-dim{font-weight:600;opacity:.78}' +
  '.ssf-ast{display:inline-block;margin-left:.1em;transition:transform .6s cubic-bezier(.2,1.6,.3,1)}' +
  '.ssf-big button:hover .ssf-ast,.ssf-big a:hover .ssf-ast{transform:rotate(180deg) scale(1.2)}' +
  '.ssf-note{margin-top:clamp(8px,1cqw,14px);max-width:34ch;font-size:clamp(12px,.95cqw,14px);line-height:1.45;opacity:.86}' +
  // the wordmark stage
  '.ssf-stage{position:relative;z-index:1;margin-top:auto;width:min(100%,calc(var(--ssf-wmh) * var(--ssf-ar)));align-self:center;padding:0 clamp(6px,.8cqw,12px)}' +
  '.ssf-stage-in{position:relative;container-type:inline-size}' +
  '.ssf-wm-btn{display:block;width:100%;border-radius:0 !important;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
  '.ssf-wm{width:100%;height:auto;color:var(--ssf-cream)}' +
  '.ssf-wm path{fill:none;stroke:currentColor;stroke-width:' + STROKE + ';stroke-linecap:round;stroke-linejoin:round}' +
  // stickers
  '.ssf-st{position:absolute;z-index:3;translate:-50% -50%;touch-action:none;user-select:none;-webkit-user-select:none}' +
  '.ssf-st-btn{display:block;width:100%;cursor:grab;rotate:calc(var(--r) + var(--tilt,0deg));transition:rotate .5s cubic-bezier(.2,1.4,.3,1)}' +
  '.ssf-st.is-drag{z-index:9}' +
  '.ssf-st.is-drag .ssf-st-btn{cursor:grabbing;transition:rotate .12s linear}' +
  '.ssf-st-lift{display:block;transition:transform .35s cubic-bezier(.2,1.5,.3,1),filter .35s}' +
  '.ssf-st-lift{filter:drop-shadow(0 1px .5px rgba(10,30,16,.3)) drop-shadow(0 4px 6px rgba(10,30,16,.2))}' +
  '.ssf-st-btn:hover .ssf-st-lift,.ssf-st-btn:focus-visible .ssf-st-lift{transform:translateY(-4%) scale(1.06);filter:drop-shadow(0 2px 1px rgba(10,30,16,.2)) drop-shadow(0 14px 16px rgba(10,30,16,.32))}' +
  '.ssf-st.is-drag .ssf-st-lift{transform:translateY(-7%) scale(1.12);filter:drop-shadow(0 2px 1px rgba(10,30,16,.16)) drop-shadow(0 22px 22px rgba(10,30,16,.36))}' +
  '.ssf-st-slap{display:block}' +
  '.ssf-st svg{width:100%;height:auto}' +
  '.ssf-sheen{transform:translateX(-130%);transition:transform 0s}' +
  '.ssf-st-btn:hover .ssf-sheen{transform:translateX(130%);transition:transform .9s cubic-bezier(.4,0,.2,1)}' +
  '.ssf-ring{position:absolute;left:50%;top:50%;width:150%;aspect-ratio:1;translate:-50% -50%;border-radius:50%;border:2px solid var(--ssf-cream);opacity:0;pointer-events:none}' +
  '@container (max-width: 760px){.ssf-cols{grid-template-columns:minmax(0,1fr)}.ssf-top{padding-bottom:18px}.ssf-stage{width:min(165%,calc(var(--ssf-wmh) * var(--ssf-ar)));max-width:none;margin-left:-6%}}' +
  '@keyframes ssf-rewrite{0%{stroke-dashoffset:var(--l,120px)}100%{stroke-dashoffset:0}}' +
  '@keyframes ssf-popin{from{opacity:0;transform:translateY(10px) scale(.7) rotate(4deg)}}' +
  // the storyboard: everything above is the finished state; motion only adds the way in
  '@media (prefers-reduced-motion: no-preference){' +
  '.ssf-panel{scale:calc(.9 + .1 * var(--ssf-sp,1));border-radius:calc(clamp(14px,1.8cqw,24px) + (1 - var(--ssf-sp,1)) * 60px)}' +
  '.ssf-stage-in{transform:translateY(calc((1 - var(--ssf-sp,1)) * 18%))}' +
  '.ssf-st{transform:translate(calc(var(--ssf-px,0) * var(--d) * 9px),calc(var(--ssf-py,0) * var(--d) * 6px));transition:transform .7s cubic-bezier(.2,.8,.2,1)}' +
  '.ssf-st.is-drag{transition:none}' +
  '.ssf:not(.is-in) .ssf-top>*,.ssf:not(.is-in) .ssf-tag,.ssf:not(.is-in) .ssf-line>*,.ssf:not(.is-in) .ssf-note{opacity:0}' +
  '.ssf.is-in .ssf-top>*{animation:ssf-fall .8s cubic-bezier(.2,1.3,.3,1) both}' +
  '.ssf.is-in .ssf-top>:nth-child(2){animation-delay:.08s}.ssf.is-in .ssf-top>:nth-child(3){animation-delay:.16s}' +
  '.ssf.is-in .ssf-panel{animation:ssf-grow 1.1s cubic-bezier(.7,0,.2,1) both}' +
  '.ssf.is-in .ssf-tag{animation:ssf-pop .7s cubic-bezier(.2,1.7,.3,1) both;animation-delay:calc(.45s + var(--c) * .1s)}' +
  '.ssf.is-in .ssf-line>*{animation:ssf-rise .8s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(.55s + var(--c) * .1s + var(--i) * .07s)}' +
  '.ssf.is-in .ssf-note{animation:ssf-fade .7s ease both;animation-delay:calc(.85s + var(--c) * .1s)}' +
  '.ssf .ssf-wm path{stroke-dasharray:var(--l,3000px) calc(var(--l,3000px) + 8px);stroke-dashoffset:calc(var(--l,3000px) + 4px)}' +
  '.ssf:not(.is-in) .ssf-wm path{visibility:hidden}' +
  '.ssf.is-in .ssf-wm path{animation:ssf-write var(--dur) var(--at) cubic-bezier(.55,.1,.35,1) both}' +
  '.ssf:not(.is-in) .ssf-st-slap{opacity:0}' +
  '.ssf.is-in .ssf-st-slap{animation:ssf-slap .62s var(--at) cubic-bezier(.3,1.5,.4,1) both}' +
  '.ssf.is-in .ssf-ring{animation:ssf-ring .7s var(--at) cubic-bezier(.2,.8,.2,1) both}' +
  '.ssf-st-btn:active .ssf-st-lift{transform:translateY(-6%) scale(1.1)}' +
  '}' +
  '@keyframes ssf-write{0%{stroke-dashoffset:calc(var(--l,3000px) + 4px);visibility:visible}100%{stroke-dashoffset:0;visibility:visible}}' +
  '@keyframes ssf-fall{from{opacity:0;transform:translateY(-14px) rotate(-6deg)}}' +
  '@keyframes ssf-grow{0%{clip-path:inset(30% 12% 0 12% round 80px);transform:translateY(40px)}100%{clip-path:inset(0 0 0 0 round 0);transform:none}}' +
  '@keyframes ssf-pop{0%{opacity:0;transform:scale(.4) rotate(-12deg)}100%{opacity:1;transform:none}}' +
  '@keyframes ssf-rise{from{opacity:1;transform:translateY(110%)}to{opacity:1;transform:none}}' +
  '@keyframes ssf-fade{from{opacity:0;transform:translateY(8px)}}' +
  '@keyframes ssf-slap{0%{opacity:0;transform:scale(2.1) rotate(24deg) translateY(-30%);filter:blur(1.5px)}55%{opacity:1;transform:scale(.9) rotate(-3deg);filter:none}78%{transform:scale(1.05) rotate(1deg)}100%{opacity:1;transform:none}}' +
  '@keyframes ssf-ring{0%{opacity:0;transform:scale(.3)}40%{opacity:.75}100%{opacity:0;transform:scale(1)}}'

/** Stamps each path's real length into --l, for the draw-in. */
const useStrokeLengths = (ref: React.RefObject<Element | null>, key: string) =>
  React.useEffect(() => {
    ref.current?.querySelectorAll<SVGPathElement>('path[data-draw]').forEach((p) => {
      p.style.setProperty('--l', Math.ceil(p.getTotalLength()) + 1 + 'px')
    })
  }, [ref, key])

/** A word in the script, scaled to fit a box: for sticker captions. */
function ScriptText({ text, cx, cy, w, color, stroke = STROKE }: { text: string; cx: number; cy: number; w: number; color: string; stroke?: number }) {
  const { main, extra, width, top } = React.useMemo(() => layoutScript(text), [text])
  if (!width) return null
  const s = w / (width + stroke)
  const h = (-top + 1) * s
  return (
    <g transform={'translate(' + round(cx - (width * s) / 2) + ' ' + round(cy + h / 2 - s) + ') scale(' + round(s) + ')'}>
      <path d={main + extra.join('')} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

const sparkle = (cx: number, cy: number, r: number) =>
  'M' + cx + ' ' + (cy - r) + 'Q' + cx + ' ' + cy + ' ' + (cx + r) + ' ' + cy + 'Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy + r) + 'Q' + cx + ' ' + cy + ' ' + (cx - r) + ' ' + cy + 'Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy - r) + 'Z'

const BURST = starPath(13, 54, 39, 60, 60, 0.2, 4)
const BOLT = 'M70 8L26 66H55L44 112L94 48H64Z'
const HEART = 'M60 100C22 76 10 56 18 38C26 20 50 18 60 38C70 18 94 20 102 38C110 56 98 76 60 100Z'
const BUBBLE = 'M24 22H96A14 14 0 0 1 110 36V70A14 14 0 0 1 96 84H56L34 102L38 84H24A14 14 0 0 1 10 70V36A14 14 0 0 1 24 22Z'

/** The silhouette (die-cut in white) and the art on top, in a 120 × 120 box, in the Summarecon colours. */
const stickerArt = (kind: StickerKind, text?: string): { shape: React.ReactNode; art: React.ReactNode } => {
  switch (kind) {
    case 'burst':
      return {
        shape: <path d={BURST} />,
        art: (
          <>
            <path d={BURST} fill="#f26f22" />
            <path d={starPath(13, 44, 33, 60, 60, 0.2, 4)} fill="#f9a61b" />
            <ScriptText text={text ?? 'hayu!'} cx={60} cy={58} w={62} color="#231f20" stroke={3.4} />
          </>
        ),
      }
    case 'bubble':
      return {
        shape: <path d={BUBBLE} />,
        art: (
          <>
            <path d={BUBBLE} fill="#fedc01" />
            <ScriptText text={text ?? 'hai!'} cx={60} cy={53} w={text ? 76 : 44} color="#231f20" stroke={3.6} />
          </>
        ),
      }
    case 'heart':
      return {
        shape: (
          <>
            <path d={HEART} />
            <path d={sparkle(100, 20, 14)} />
            <path d={sparkle(18, 92, 10)} />
          </>
        ),
        art: (
          <>
            <path d={HEART} fill="#f26f22" />
            <path d="M30 42Q32 30 45 29" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" opacity=".9" />
            <path d={sparkle(100, 20, 14)} fill="#fedc01" />
            <path d={sparkle(18, 92, 10)} fill="#fedc01" />
          </>
        ),
      }
    case 'bolt':
    default:
      return {
        shape: <path d={BOLT} />,
        art: (
          <>
            <path d={BOLT} fill="#fedc01" />
            <path d="M66 20L38 58" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".75" />
          </>
        ),
      }
  }
}

function StickerSvg({ kind, text }: { kind: StickerKind; text?: string }) {
  const id = 'ssf' + React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const { shape, art } = stickerArt(kind, text)
  return (
    <svg viewBox="-6 -6 132 132" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={id + 'c'}>{shape}</clipPath>
        <linearGradient id={id + 'g'} x1="0" x2="1" y1="0" y2="0">
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".65" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="#fff" stroke="#fff" strokeWidth="11" strokeLinejoin="round">
        {shape}
      </g>
      {art}
      <g clipPath={'url(#' + id + 'c)'}>
        <g transform="rotate(20 60 60)">
          <rect className="ssf-sheen" x="-30" y="-30" width="180" height="180" fill={'url(#' + id + 'g)'} />
        </g>
      </g>
    </svg>
  )
}

type Placed = { x: number; y: number }

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function StickerSlap({
  wordmark,
  badge,
  centre,
  menu,
  menuLabel = 'Info dan pengaturan demo',
  columns,
  stickers,
  height = '100svh',
  wordmarkMaxHeight = '50svh',
  paper = '#fbfaf7',
  panel = '#006426',
  ink = '#231f20',
  cream,
  accent = '#f26f22',
  className = '',
}: StickerSlapProps) {
  const rootRef = React.useRef<HTMLElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const cornerRef = React.useRef<HTMLDivElement>(null)
  const [seen, setSeen] = React.useState(false)
  const [run, setRun] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const [moved, setMoved] = React.useState<Record<number, Placed>>({})
  const [order, setOrder] = React.useState<number[]>([])
  const drag = React.useRef<{ i: number; id: number; sx: number; sy: number; px: number; py: number; lx: number; t: number; tilt: number; w: number; h: number; went: boolean } | null>(null)

  const word = React.useMemo(() => layoutScript(wordmark), [wordmark])
  const pad = STROKE / 2 + 0.6
  const vbX = -1.4 - pad
  const vbY = word.top - pad
  const vbW = Math.max(word.width, 1) + 2.8 + pad * 2 - word.top * SLANT
  const vbH = word.bottom + pad - vbY
  const cutH = CUT - vbY

  const spots = React.useMemo(() => stickerSpots(word, stickers.length, 3), [word, stickers.length])
  const drawDur = clamp(0.7 + word.width / 45, 1.1, 2.6)
  const writeAt = 1.05
  const toPct = (s: Spot) => ({ x: ((s.x - s.y * SLANT - vbX) / vbW) * 100, y: ((s.y - vbY) / vbH) * 100 })

  const items = stickers.map((o, i) => {
    const spot = spots[i] ?? { x: 0, y: 0, size: 11, rotate: 0, depth: 1 }
    const auto = toPct(spot)
    const home = { x: o.x ?? auto.x, y: o.y ?? auto.y }
    const xf = clamp((home.x / 100) * vbW + vbX, 0, word.width) / Math.max(word.width, 1)
    return {
      i,
      kind: (o.kind ?? 'burst') as StickerKind,
      node: o.node,
      text: o.text,
      label: o.label,
      home,
      at: moved[i] ?? home,
      size: o.size ?? (spot.size / vbW) * 100,
      rotate: o.rotate ?? spot.rotate,
      depth: spot.depth,
      // slaps down the moment the pen passes under it
      delay: writeAt + drawDur * Math.pow(xf, 0.92) + 0.08,
    }
  })
  useStrokeLengths(rootRef, wordmark + run)

  // The storyboard plays once, the first time a fifth of it is on screen.
  React.useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Scroll-linked: 0 while the panel is still below the fold, 1 once it fills the screen, eased into --ssf-sp.
  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const vh = document.documentElement.clientHeight || r.height
      const span = Math.min(r.height, vh) || 1
      const p = clamp((vh - r.top) / span, 0, 1)
      el.style.setProperty('--ssf-sp', (1 - Math.pow(1 - p, 2)).toFixed(4))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', onScroll, { passive: true, capture: true })
    addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll, { capture: true })
      removeEventListener('resize', onScroll)
    }
  }, [])

  // the menu closes on a tap outside it or Escape
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!cornerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const raise = (i: number) => setOrder((o) => [...o.filter((k) => k !== i), i])
  const putAt = (i: number, p: Placed) => setMoved((m) => ({ ...m, [i]: p }))

  const wiggle = (el: Element | null, frames: Keyframe[], duration: number) => {
    if (!reduced()) (el as HTMLElement | null)?.animate?.(frames, { duration, easing: 'cubic-bezier(.3,1.4,.4,1)' })
  }
  const slapFrames: Keyframe[] = [{ transform: 'scale(1.14)' }, { transform: 'scale(.93,1.04)', offset: 0.4 }, { transform: 'scale(1.02,.98)', offset: 0.7 }, { transform: 'none' }]
  const shakeFrames: Keyframe[] = [{ transform: 'none' }, { transform: 'rotate(-14deg) scale(1.1)', offset: 0.3 }, { transform: 'rotate(9deg)', offset: 0.6 }, { transform: 'none' }]

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0 || !stageRef.current) return
    const r = stageRef.current.getBoundingClientRect()
    const at = items[i].at
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { i, id: e.pointerId, sx: at.x, sy: at.y, px: e.clientX, py: e.clientY, lx: e.clientX, t: e.timeStamp, tilt: 0, w: r.width, h: r.height, went: false }
    raise(i)
  }
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.went && Math.hypot(dx, dy) < 4) return
    const host = e.currentTarget.parentElement
    if (!host) return
    if (!d.went) host.classList.add('is-drag')
    d.went = true
    const x = clamp(d.sx + (dx / d.w) * 100, 1, 99)
    const y = clamp(d.sy + (dy / d.h) * 100, -70, 96)
    host.style.left = x + '%'
    host.style.top = y + '%'
    // tilt with the throw: velocity, smoothed
    const now = e.timeStamp
    const v = (e.clientX - d.lx) / Math.max(1, now - d.t)
    d.tilt = d.tilt * 0.75 + clamp(v * 22, -24, 24) * 0.25
    d.lx = e.clientX
    d.t = now
    host.style.setProperty('--tilt', d.tilt.toFixed(2) + 'deg')
  }
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const host = e.currentTarget.parentElement
    host?.classList.remove('is-drag')
    host?.style.setProperty('--tilt', '0deg')
    const lift = e.currentTarget.querySelector('.ssf-st-lift')
    if (d.went && host) {
      putAt(d.i, { x: parseFloat(host.style.left), y: parseFloat(host.style.top) })
      wiggle(lift, slapFrames, 420)
    } else wiggle(lift, shakeFrames, 520)
  }
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.shiftKey ? 6 : 2
    const at = items[i].at
    const go: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (go[e.key]) {
      e.preventDefault()
      raise(i)
      putAt(i, { x: clamp(at.x + go[e.key][0], 1, 99), y: clamp(at.y + go[e.key][1], -70, 96) })
    } else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault()
      goHome(i, e.currentTarget)
    }
  }
  const goHome = (i: number, btn: HTMLElement) => {
    setMoved((m) => {
      const next = { ...m }
      delete next[i]
      return next
    })
    wiggle(btn.querySelector('.ssf-st-lift'), slapFrames, 420)
  }

  // Write it again: the wordmark redraws and every sticker slaps back home.
  const replay = () => {
    setMoved({})
    setRun((r) => r + 1)
  }

  const style = {
    '--ssf-paper': paper,
    '--ssf-panel': panel,
    '--ssf-ink': ink,
    '--ssf-cream': cream ?? paper,
    '--ssf-accent': accent,
    '--ssf-sans': 'var(--font-sans)',
    '--ssf-wmh': wordmarkMaxHeight,
    '--ssf-ar': String(round(vbW / cutH)),
    minHeight: height,
  } as React.CSSProperties

  const onPointer = (e: React.PointerEvent<HTMLElement>) => {
    const el = rootRef.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    el.style.setProperty('--ssf-px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3))
    el.style.setProperty('--ssf-py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3))
  }
  const onLeave = () => {
    rootRef.current?.style.setProperty('--ssf-px', '0')
    rootRef.current?.style.setProperty('--ssf-py', '0')
  }

  const line = (l: Line) => {
    if (l.to)
      return (
        <Link to={l.to} aria-label={l.name}>
          {l.label}
        </Link>
      )
    if (l.href)
      return (
        <a href={l.href} aria-label={l.name} target={/^https?:/.test(l.href) ? '_blank' : undefined} rel={/^https?:/.test(l.href) ? 'noopener noreferrer' : undefined}>
          {l.label}
        </a>
      )
    if (l.onClick)
      return (
        <button type="button" onClick={l.onClick} disabled={l.disabled} aria-label={l.name}>
          {l.label}
        </button>
      )
    return <span className="ssf-dim">{l.label}</span>
  }

  return (
    <section ref={rootRef} className={'ssf' + (seen ? ' is-in' : '') + (className ? ' ' + className : '')} style={style} onPointerMove={onPointer} onPointerLeave={onLeave}>
      <style>{CSS}</style>

      <div className="ssf-top">
        {badge ? (
          badge.to ? (
            <Link className="ssf-badge" to={badge.to} title={badge.title} aria-label={badge.title ?? badge.label}>
              <StickerSvg kind="burst" text={badge.label} />
            </Link>
          ) : badge.href ? (
            <a className="ssf-badge" href={badge.href} title={badge.title} aria-label={badge.title ?? badge.label}>
              <StickerSvg kind="burst" text={badge.label} />
            </a>
          ) : (
            <span className="ssf-badge" title={badge.title} role="img" aria-label={badge.title ?? badge.label}>
              <StickerSvg kind="burst" text={badge.label} />
            </span>
          )
        ) : (
          <span />
        )}
        <div className="ssf-mid">{centre}</div>
        <div className="ssf-corner" ref={cornerRef}>
          {menu && (
            <>
              <button type="button" className="ssf-burger" aria-label={menuLabel} aria-expanded={open} aria-controls="ssf-menu" onClick={() => setOpen((o) => !o)}>
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
              </button>
              {open && (
                <div id="ssf-menu" className="ssf-menu" role="region" aria-label={menuLabel}>
                  {menu}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="ssf-panel">
        {columns.length > 0 && (
          <div className="ssf-cols" style={{ '--ssf-n': columns.length } as React.CSSProperties}>
            {columns.map((c, k) => (
              <div className="ssf-col" key={k} style={{ '--c': k } as React.CSSProperties}>
                <h2 className="ssf-tag">{c.tag}</h2>
                <ul className="ssf-big">
                  {c.lines.map((l, i) => (
                    <li key={i} className="ssf-line" style={{ '--i': i } as React.CSSProperties}>
                      {line(l)}
                    </li>
                  ))}
                </ul>
                {c.note && <p className="ssf-note">{c.note}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="ssf-stage">
          <div className="ssf-stage-in" ref={stageRef} style={{ marginBottom: round(-((vbH - cutH) / vbW) * 100) + '%' }}>
            <button type="button" className="ssf-wm-btn" onClick={replay} aria-label={'Tulis ulang ' + wordmark}>
              <svg key={run} className="ssf-wm" viewBox={[vbX, vbY, vbW, vbH].map(round).join(' ')} aria-hidden="true" focusable="false">
                <g transform="skewX(-9)">
                  <path d={word.main} data-draw="" style={{ '--dur': drawDur + 's', '--at': writeAt + 's' } as React.CSSProperties} />
                  {word.extra.map((d, k) => (
                    <path key={k} d={d} data-draw="" style={{ '--dur': '.28s', '--at': round(writeAt + drawDur + k * 0.16) + 's' } as React.CSSProperties} />
                  ))}
                </g>
              </svg>
            </button>

            {items.map((s) => (
              <div
                key={s.i}
                className="ssf-st"
                style={
                  {
                    left: s.at.x + '%',
                    top: s.at.y + '%',
                    width: 'max(' + round(s.size) + 'cqw, 46px)',
                    zIndex: 3 + Math.max(0, order.indexOf(s.i) + 1),
                    '--r': s.rotate + 'deg',
                    '--d': s.depth,
                    '--at': round(s.delay) + 's',
                  } as React.CSSProperties
                }
              >
                <button
                  type="button"
                  className="ssf-st-btn"
                  aria-label={s.label + '. Geser, atau pakai tombol panah, untuk memindahkannya. Escape mengembalikannya.'}
                  onPointerDown={(e) => onDown(e, s.i)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onDoubleClick={(e) => goHome(s.i, e.currentTarget)}
                  onKeyDown={(e) => onKey(e, s.i)}
                >
                  <span key={run} className="ssf-st-slap">
                    <span className="ssf-st-lift">{s.node ?? <StickerSvg kind={s.kind} text={s.text} />}</span>
                  </span>
                </button>
                <span key={'r' + run} className="ssf-ring" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  )
}
