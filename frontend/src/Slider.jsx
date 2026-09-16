import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────
 * SLIDER — full-bleed track, floating label + value
 *
 *  hover      track brightens, decile ticks fade in
 *  click      snaps to nearest decile if within SNAP_ZONE
 *  drag       instant, continuous; rubber-bands past edges
 *  handle     rounded thumb inset from the fill edge
 * ───────────────────────────────────────────────────────── */

const HANDLE_INSET = 7;
const HANDLE_MIN = 7;
const DRAG_THRESHOLD = 3;
const SNAP_ZONE = 0.035;
const RUBBER_DEAD = 14;
const RUBBER_MAX = 10;
const RUBBER_FALLOFF = 90;
const DODGE_GAP = 6;
const SPRING = { stiffness: 0.18, damping: 0.72 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export default function Slider({ label, value, min, max, step, unit, onChange, band, tone }) {
  const rootRef = useRef(null);
  const labelRef = useRef(null);
  const valueRef = useRef(null);
  const press = useRef(null);
  const anim = useRef({ x: 0, v: 0, raf: 0, ready: false });
  const draggingRef = useRef(false);

  const num = Number(value);
  const isSet = value !== '' && !Number.isNaN(num);
  const decimals = step < 1 ? 1 : 0;
  const toFrac = (v) => clamp((v - min) / (max - min), 0, 1);
  const toValue = (f) => clamp(Math.round((min + f * (max - min)) / step) * step, min, max);
  const format = (v) => {
    const s = v.toFixed(decimals);
    return decimals ? s.replace(/\.0$/, '') : s;
  };
  const target = isSet ? toFrac(num) : 0;

  const [shown, setShown] = useState(target);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [stretch, setStretch] = useState({ side: 'right', px: 0 });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const a = anim.current;
    cancelAnimationFrame(a.raf);

    if (draggingRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      a.x = target;
      a.v = 0;
      a.ready = true;
      setShown(target);
      return;
    }

    if (!a.ready) {
      a.x = target;
      a.v = 0;
      a.ready = true;
      setShown(target);
      return;
    }

    const tick = () => {
      a.v = (a.v + (target - a.x) * SPRING.stiffness) * SPRING.damping;
      a.x += a.v;
      if (Math.abs(target - a.x) < 0.0004 && Math.abs(a.v) < 0.0004) {
        a.x = target;
        a.v = 0;
        setShown(target);
        return;
      }
      setShown(a.x);
      a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(a.raf);
  }, [target]);

  const fracAt = (clientX) => {
    const rect = rootRef.current.getBoundingClientRect();
    return { raw: (clientX - rect.left) / rect.width, rect };
  };

  const applyFrac = (f) => {
    const next = format(toValue(clamp(f, 0, 1)));
    anim.current.x = clamp(f, 0, 1);
    anim.current.v = 0;
    setShown(anim.current.x);
    onChange(next);
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, dragging: false };
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.abs(e.clientX - p.x) < DRAG_THRESHOLD) return;
    if (!p.dragging) {
      p.dragging = true;
      draggingRef.current = true;
      setDragging(true);
      cancelAnimationFrame(anim.current.raf);
    }
    const { raw, rect } = fracAt(e.clientX);
    applyFrac(raw);

    const over = raw < 0 ? rect.left - e.clientX : raw > 1 ? e.clientX - rect.right : 0;
    const px = over > RUBBER_DEAD ? RUBBER_MAX * (1 - Math.exp(-(over - RUBBER_DEAD) / RUBBER_FALLOFF)) : 0;
    setStretch({ side: raw < 0 ? 'left' : 'right', px });
  };

  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.dragging) {
      draggingRef.current = false;
      setDragging(false);
    } else {
      const f = clamp(fracAt(e.clientX).raw, 0, 1);
      const decile = Math.round(f * 10) / 10;
      const snapped = Math.abs(f - decile) <= SNAP_ZONE ? decile : f;
      onChange(format(toValue(snapped)));
    }
    setStretch((s) => ({ ...s, px: 0 }));
  };

  const onKeyDown = (e) => {
    const big = (max - min) / 10;
    const current = isSet ? num : min;
    const moves = {
      ArrowRight: step * (e.shiftKey ? 10 : 1),
      ArrowUp: step * (e.shiftKey ? 10 : 1),
      ArrowLeft: -step * (e.shiftKey ? 10 : 1),
      ArrowDown: -step * (e.shiftKey ? 10 : 1),
      PageUp: big,
      PageDown: -big,
    };
    if (e.key in moves) onChange(format(clamp(current + moves[e.key], min, max)));
    else if (e.key === 'Home') onChange(format(min));
    else if (e.key === 'End') onChange(format(max));
    else return;
    e.preventDefault();
  };

  const fillPx = shown * width;
  const handleX = clamp(fillPx - HANDLE_INSET, HANDLE_MIN, Math.max(HANDLE_MIN, width - HANDLE_MIN));
  const overlaps = (el) => el && handleX > el.offsetLeft - DODGE_GAP && handleX < el.offsetLeft + el.offsetWidth + DODGE_GAP;
  const dodging = overlaps(labelRef.current) || overlaps(valueRef.current);

  const animating = Math.abs(shown - target) > 0.001;
  const display = !isSet ? '—' : animating ? format(toValue(shown)) : format(num);

  return (
    <div
      ref={rootRef}
      className={`slider${dragging ? ' is-dragging' : ''}${isSet ? '' : ' is-empty'}${tone ? ` is-${tone}` : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={isSet ? num : undefined}
      aria-valuetext={isSet ? `${format(num)}${unit ? ` ${unit}` : ''}` : 'not set'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div
        className="slider-surface"
        style={{
          transform: `scaleX(${width ? (width + stretch.px) / width : 1})`,
          transformOrigin: stretch.side === 'left' ? 'right center' : 'left center',
          transition: stretch.px === 0 ? 'transform 420ms cubic-bezier(0.22, 1.4, 0.36, 1)' : 'none',
        }}
      >
        <div className="slider-fill" style={{ width: `${shown * 100}%` }} />
        <div className="slider-ticks" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ left: `${(i + 1) * 10}%` }} />
          ))}
        </div>
        <div
          className={`slider-handle${dodging ? ' is-dodging' : ''}`}
          style={{ transform: `translate3d(${handleX}px, -50%, 0)` }}
          aria-hidden="true"
        >
          <span />
        </div>
      </div>

      {band && (
        <div
          className="slider-band"
          aria-hidden="true"
          style={{
            left: `${toFrac(band[0]) * 100}%`,
            width: `${Math.max(toFrac(band[1]) - toFrac(band[0]), 0.006) * 100}%`,
          }}
        />
      )}

      <span ref={labelRef} className="slider-label">
        {label}
      </span>

      <span ref={valueRef} className="slider-value">
        <span className="slider-number">{display}</span>
        {unit && <span className="slider-unit">{unit}</span>}
      </span>
    </div>
  );
}
