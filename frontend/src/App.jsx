import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Add, Award, Calendar as CalendarIcon, Chart, ClipboardText, CloseCircle, CloudSunny, Drop, InfoCircle, Layer, Location, PercentageCircle, StatusUp, TaskSquare, TickCircle, Warning2 } from 'iconsax-react';
import Slider from './Slider';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const STORAGE_KEY = 'nilam.saved-analyses.v2';
const ACTIVE_KEY = 'nilam.active-analysis.v2';

const NUTRIENTS = ['N', 'P', 'K', 'ph'];
const SAMPLES = ['rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'groundnut'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = {
  kharif: { name: 'Kharif', months: 'Jun–Oct' },
  rabi: { name: 'Rabi', months: 'Oct–Mar' },
  zaid: { name: 'Zaid', months: 'Mar–Jun' },
};
// Approximate field colour of each soil, so the picker reads like a soil chart.
const SOIL_COLORS = {
  Alluvial: '#a3906f', Black: '#3b3531', Clay: '#8c5b3e', Laterite: '#a2452b',
  Red: '#b4513a', Sandy: '#d9c49b', Saline: '#c4b89a', Other: null,
};
const SHORT = { N: 'N', P: 'P', K: 'K', ph: 'pH', temperature: '°C', humidity: 'RH', water: 'H₂O' };
const MAX_ROWS = 8;

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const round = (n) => (Math.abs(n) >= 20 ? String(Math.round(n)) : fmt(n));
const withUnit = (text, unit) => (unit ? `${text}${unit === 'mm' ? ' ' : ''}${unit}` : text);
const pct = (c) => `${Math.min(99, Math.max(1, Math.round(c * 100)))}%`;
const range = (lo, hi, unit) => withUnit(round(lo) === round(hi) ? round(lo) : `${round(lo)}–${round(hi)}`, unit);
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const formKey = (form) => JSON.stringify(form);

const emptyForm = (meta) => ({
  ...Object.fromEntries(meta.fields.map((f) => [f.key, ''])),
  soil: '',
  season: '',
  water_source: '',
  state: '',
});

function sampleValues(meta, id) {
  const crop = meta.crops[id];
  return {
    ...Object.fromEntries(meta.fields.map((f) => [f.key, String(crop.profile[f.key][1])])),
    soil: crop.soils.find((s) => s !== 'Other') ?? crop.soils[0],
    season: crop.season,
    water_source: crop.water_source,
    state: crop.states?.[0] ?? meta.options.state?.[0] ?? '',
  };
}

function dedupeSaved(list) {
  if (!Array.isArray(list)) return [];
  const best = new Map();
  for (const entry of list) {
    if (!entry?.id || !entry?.form) continue;
    const key = formKey(entry.form);
    const prev = best.get(key);
    if (!prev || new Date(entry.savedAt) >= new Date(prev.savedAt)) best.set(key, entry);
  }
  const winners = new Set([...best.values()].map((e) => e.id));
  return list.filter((e) => winners.has(e.id) && best.get(formKey(e.form))?.id === e.id);
}

function loadSaved() {
  try {
    const cleaned = dedupeSaved(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

// Compare the form against one crop's typical band (p10–p90) for every reading.
function assess(meta, id, form) {
  const crop = meta.crops[id];
  const readings = meta.fields.map((f) => {
    const [lo, , hi] = crop.profile[f.key];
    const v = Number(form[f.key]);
    const span = hi - lo || 1;
    const status = v < lo ? 'low' : v > hi ? 'high' : 'ok';
    return { ...f, lo, hi, v, status, gap: status === 'low' ? (lo - v) / span : status === 'high' ? (v - hi) / span : 0 };
  });
  return {
    id,
    crop,
    readings,
    inRange: readings.filter((r) => r.status === 'ok').length,
    distance: readings.reduce((sum, r) => sum + r.gap, 0),
    soilOk: crop.soils.includes(form.soil),
  };
}

function advice(r, cropName) {
  const d = (n) => round(Math.abs(n));
  if (r.status === 'ok') return 'Within range';
  const low = r.status === 'low';
  switch (r.key) {
    case 'N':
    case 'P':
    case 'K':
      return low ? `Add about ${d(r.lo - r.v)} ${r.key}` : `${d(r.v - r.hi)} more ${r.key} than usual`;
    case 'ph':
      return low ? 'More acidic than usual; liming raises pH' : 'More alkaline than usual';
    case 'temperature':
      return `${d(low ? r.lo - r.v : r.v - r.hi)}°C ${low ? 'cooler' : 'warmer'} than ${cropName} prefers`;
    case 'humidity':
      return low ? 'Drier air than usual' : 'More humid than usual';
    case 'water':
      return low ? `About ${d(r.lo - r.v)} mm short for the season` : `${d(r.v - r.hi)} mm more water than needed`;
    default:
      return low ? 'Below range' : 'Above range';
  }
}

// FastAPI returns 422 with {detail: [{loc, msg}]}; turn that into something a person can read.
async function readError(res, fields) {
  try {
    const body = await res.json();
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((d) => `${fields.find((f) => f.key === d.loc?.at(-1))?.label ?? d.loc?.at(-1)} ${d.msg.replace(/^Input should be /i, 'should be ')}`)
        .join(' · ');
    }
  } catch {
    /* fall through */
  }
  return `Server error (${res.status})`;
}

/* ── Boot ─────────────────────────────────────────────── */

function App() {
  const [meta, setMeta] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    fetch(`${API_BASE_URL}/metadata`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMeta)
      .catch(() => setFailed(true));
  }, [attempt]);

  if (meta) return <Dashboard meta={meta} />;
  return (
    <div className="boot">
      {failed ? (
        <>
          <p>Can't reach the model server at {API_BASE_URL}.</p>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </>
      ) : (
        <p>Loading crop data…</p>
      )}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────── */

function createTab(meta, overrides = {}) {
  return {
    key: crypto.randomUUID(),
    id: null,
    name: '',
    form: emptyForm(meta),
    ...overrides,
  };
}

function initialTab(meta, saved) {
  try {
    const activeId = localStorage.getItem(ACTIVE_KEY);
    const entry = saved.find((s) => s.id === activeId) ?? saved[0];
    if (entry) return createTab(meta, { id: entry.id, name: entry.name, form: entry.form });
  } catch {
    /* fall through */
  }
  return createTab(meta);
}

function Dashboard({ meta }) {
  const seed = useRef(null);
  if (!seed.current) {
    const saved = loadSaved();
    seed.current = { tab: initialTab(meta, saved), saved };
  }

  const [saved, setSaved] = useState(seed.current.saved);
  const [tabs, setTabs] = useState([seed.current.tab]);
  const [activeKey, setActiveKey] = useState(seed.current.tab.key);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | invalid | offline
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const requestId = useRef(0);

  const current = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const setCurrent = (update) => {
    setTabs((list) =>
      list.map((t) => {
        if (t.key !== activeKeyRef.current) return t;
        return typeof update === 'function' ? update(t) : { ...t, ...update };
      }),
    );
  };

  const { form } = current;
  const numericDone = meta.fields.filter((f) => form[f.key] !== '' && !Number.isNaN(Number(form[f.key]))).length;
  const choicesDone = ['soil', 'season', 'water_source', 'state'].filter((k) => form[k]).length;
  const totalInputs = meta.fields.length + 4;
  const complete = numericDone + choicesDone === totalInputs;

  const setForm = (update) => setCurrent((c) => ({ ...c, form: typeof update === 'function' ? update(c.form) : update }));
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    if (current.id) localStorage.setItem(ACTIVE_KEY, current.id);
  }, [current.id]);

  // Clear selection when switching tabs; prediction effect re-runs from form.
  useEffect(() => {
    setSelectedId(null);
    setDetailOpen(false);
    setResult(null);
    setStatus('idle');
  }, [activeKey]);

  // Live prediction: debounce edits, ignore stale responses.
  useEffect(() => {
    if (!complete) {
      requestId.current++;
      setResult(null);
      setStatus('idle');
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...Object.fromEntries(meta.fields.map((f) => [f.key, Number(form[f.key])])),
            soil: form.soil,
            season: form.season,
            water_source: form.water_source,
            state: form.state,
          }),
          signal: controller.signal,
        });
        if (id !== requestId.current) return;
        if (!res.ok) {
          setStatus('invalid');
          setMessage(await readError(res, meta.fields));
          return;
        }
        setResult({ data: await res.json(), form });
        setStatus('ready');
      } catch (err) {
        if (err.name === 'AbortError' || id !== requestId.current) return;
        setStatus('offline');
        setMessage(`Can't reach the model server at ${API_BASE_URL}.`);
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, complete, meta, activeKey]);

  // Rows: the model's pick first, then other crops of the same season ranked by how many readings fit.
  const pick = result?.data.top_recommendations[0];
  const rows = [];
  if (result) {
    const basis = result.form;
    rows.push({ ...assess(meta, pick.crop, basis), confidence: pick.confidence });
    rows.push(
      ...Object.keys(meta.crops)
        .filter((id) => id !== pick.crop && meta.crops[id].season === basis.season)
        .map((id) => assess(meta, id, basis))
        .sort((a, b) => b.inRange - a.inRange || a.distance - b.distance)
        .slice(0, MAX_ROWS - 1),
    );
  }
  const top = rows[0];
  const selected = rows.find((r) => r.id === selectedId) ?? top;
  const seasonName = result ? SEASONS[result.form.season]?.name ?? result.form.season : '';

  // Autosave whenever a ready recommendation exists (and when the name changes).
  const autoName = pick
    ? `${meta.crops[pick.crop].name.replace(/ \(.*\)$/, '')} · ${seasonName} · ${result.form.state || result.form.soil}`
    : 'Untitled analysis';
  const displayName = current.name || autoName;

  useEffect(() => {
    if (!pick || status !== 'ready') return undefined;
    const name = displayName;
    const timer = window.setTimeout(() => {
      setSaved((list) => {
        const twin = list.find((s) => formKey(s.form) === formKey(form));
        const id = current.id ?? twin?.id ?? crypto.randomUUID();
        const snapshot = {
          id,
          name,
          savedAt: new Date().toISOString(),
          form,
          pick: { crop: pick.crop, confidence: pick.confidence },
        };
        const prev = list.find((s) => s.id === id);
        if (
          prev &&
          prev.name === snapshot.name &&
          prev.pick.crop === snapshot.pick.crop &&
          prev.pick.confidence === snapshot.pick.confidence &&
          formKey(prev.form) === formKey(snapshot.form)
        ) {
          if (!current.id) queueMicrotask(() => setCurrent((c) => (c.id ? c : { ...c, id })));
          return list;
        }
        if (!current.id) queueMicrotask(() => setCurrent((c) => (c.id ? c : { ...c, id })));
        return [snapshot, ...list.filter((s) => s.id !== id && formKey(s.form) !== formKey(form))];
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [pick, status, form, displayName, current.id]);

  const tabTitle = (t) => {
    if (t.key === current.key) return displayName;
    if (t.name) return t.name;
    const match = saved.find((s) => s.id === t.id);
    return match?.name || 'Untitled analysis';
  };

  const open = (entry) => {
    const existing = tabs.find((t) => t.id === entry.id);
    if (existing) {
      setActiveKey(existing.key);
    } else {
      const tab = createTab(meta, { id: entry.id, name: entry.name, form: entry.form });
      setTabs((list) => [...list, tab]);
      setActiveKey(tab.key);
    }
  };
  const startNew = () => {
    const tab = createTab(meta, { form: emptyForm(meta) });
    setTabs((list) => [...list, tab]);
    setActiveKey(tab.key);
  };
  const closeTab = (key) => {
    if (tabs.length === 1) {
      const tab = createTab(meta, { form: emptyForm(meta) });
      setTabs([tab]);
      setActiveKey(tab.key);
      return;
    }
    const index = tabs.findIndex((t) => t.key === key);
    const next = tabs.filter((t) => t.key !== key);
    setTabs(next);
    if (key === activeKey) setActiveKey(next[Math.max(0, index - 1)].key);
  };
  const remove = (id) => {
    setSaved((list) => list.filter((s) => s.id !== id));
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, id: null } : t)));
    try {
      if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`shell${sidebarOpen ? '' : ' is-collapsed'}`}>
      {sidebarOpen && (
        <aside className="sidebar">
          <header className="sidebar-head">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M5 9.5c4-2.2 9.2-2.2 13.2 0 2.1 1.1 4.4 1.4 6.7.9"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3.5 16.2c5-2.5 11.2-2.5 16.2 0 2.4 1.2 5.1 1.5 7.8.9"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M5.5 22.9c4.2-2.1 9.6-2.1 13.8 0 1.8.9 3.8 1.2 5.8.8"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="brand-name">NILAM</span>
            </div>
          </header>

          <div className="sidebar-body">
            <p className="sidebar-label" id="analyses-label">
              Analyses
            </p>
            <nav className="saved" aria-labelledby="analyses-label">
              {saved.length === 0 ? (
                <p className="saved-empty">Your field analyses will land here.</p>
              ) : (
                <ul>
                  {saved.map((s) => (
                    <SavedItem key={s.id} entry={s} active={s.id === current.id} cropName={meta.crops[s.pick.crop]?.name ?? s.pick.crop} onOpen={() => open(s)} onDelete={() => remove(s.id)} />
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="sidebar-end">
            <button type="button" className="sidebar-new" onClick={startNew}>
              <Add size={18} variant="Bold" color="currentColor" aria-hidden="true" />
              New analysis
            </button>
            <button type="button" className="sidebar-foot" onClick={() => setDataOpen(true)}>
              <span>{Object.keys(meta.crops).length} crops</span>
              <span className="sidebar-foot-sep" aria-hidden="true" />
              <span>{meta.rows.toLocaleString()} records</span>
            </button>
          </div>
        </aside>
      )}

      {dataOpen && <DatasetModal meta={meta} onClose={() => setDataOpen(false)} />}

      <div className="container">
        <div className="app">
          <ProjectTabs
            tabs={tabs}
            activeKey={current.key}
            titleFor={tabTitle}
            onSelect={setActiveKey}
            onClose={closeTab}
            onAdd={startNew}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
          />

          <div className="panes">
            <div className="workspace">
          <main className="results">
            {top ? (
              <section className="panel panel-results">
                <div className="metric-shell">
                  <div className="metric-card bento">
                    <article className={`bento-tile bento-confidence${top.confidence >= 0.7 ? ' is-strong' : ' is-weak'}`}>
                      <header className="bento-head">
                        <span className="bento-ico" aria-hidden="true">
                          <PercentageCircle size={16} variant="Bold" color="currentColor" />
                        </span>
                        <span className="bento-label">Confidence</span>
                      </header>
                      <div className="bento-well">
                        <strong className="bento-value">{pct(top.confidence)}</strong>
                      </div>
                      <footer className="bento-foot">
                        <span className={`bento-pill${top.confidence >= 0.7 ? ' is-up' : ' is-down'}`}>
                          {top.confidence >= 0.7 ? 'Strong fit' : 'Review'}
                        </span>
                        <span className="bento-hint">{top.crop.type}</span>
                      </footer>
                    </article>

                    <article className="bento-tile bento-range">
                      <header className="bento-head">
                        <span className="bento-ico" aria-hidden="true">
                          <TaskSquare size={16} variant="Bold" color="currentColor" />
                        </span>
                        <span className="bento-label">In range</span>
                      </header>
                      <div className="bento-well">
                        <strong className="bento-value">
                          {top.inRange}
                          <small>/{top.readings.length}</small>
                        </strong>
                      </div>
                      <footer className="bento-foot">
                        <span className="kpi-marks bento-marks" aria-hidden="true">
                          {top.readings.map((r) => (
                            <i key={r.key} className={r.status === 'ok' ? 'ok' : 'off'} />
                          ))}
                        </span>
                        <span className="bento-hint">readings</span>
                      </footer>
                    </article>

                    <article className="bento-tile bento-sow">
                      <header className="bento-head">
                        <span className="bento-ico" aria-hidden="true">
                          <Drop size={16} variant="Bold" color="currentColor" />
                        </span>
                        <span className="bento-label">Sow</span>
                      </header>
                      <div className="bento-well">
                        <strong className="bento-value">{top.crop.sown}</strong>
                      </div>
                      <footer className="bento-foot">
                        <span className="bento-pill">Window</span>
                        <span className="bento-hint">Planting</span>
                      </footer>
                    </article>

                    <article className="bento-tile bento-harvest">
                      <header className="bento-head">
                        <span className="bento-ico" aria-hidden="true">
                          <Award size={16} variant="Bold" color="currentColor" />
                        </span>
                        <span className="bento-label">Harvest</span>
                      </header>
                      <div className="bento-well">
                        <strong className="bento-value">{top.crop.harvested}</strong>
                      </div>
                      <footer className="bento-foot">
                        <span className="bento-pill is-up">~{top.crop.duration_days}d</span>
                        <span className="bento-hint">duration</span>
                      </footer>
                    </article>

                    <article className={`bento-tile bento-soil${top.soilOk ? ' is-match' : ' is-weak'}`}>
                      <header className="bento-head">
                        <span className="bento-ico" aria-hidden="true">
                          <Layer size={16} variant="Bold" color="currentColor" />
                        </span>
                        <span className="bento-label">Soil</span>
                      </header>
                      <div className="bento-well">
                        <strong className="bento-value">{top.soilOk ? 'Match' : 'Weak'}</strong>
                      </div>
                      <footer className="bento-foot">
                        <span className={`bento-pill${top.soilOk ? ' is-up' : ' is-down'}`}>{top.soilOk ? 'Fit' : 'Check'}</span>
                        <span className="bento-hint">{result.form.soil}</span>
                      </footer>
                    </article>

                    <article className="bento-tile bento-cal">
                      <div className="overview-chart-head">
                        <div>
                          <h2 className="overview-crop">{top.crop.name}</h2>
                          <p className="overview-sub">Recommended growing calendar for this field</p>
                        </div>
                        <p className="legend legend-inline" aria-hidden="true">
                          <span>
                            <i className="cal sow" /> Sow
                          </span>
                          <span>
                            <i className="cal grow" /> Grow
                          </span>
                          <span>
                            <i className="cal harvest" /> Harvest
                          </span>
                        </p>
                      </div>
                      <div className="overview-cal" aria-label={`${top.crop.name} growing window`}>
                        <Calendar crop={top.crop} />
                        {selected.id !== top.id && (
                          <>
                            <div className="overview-cal-label">{selected.crop.name}</div>
                            <Calendar crop={selected.crop} />
                          </>
                        )}
                      </div>
                    </article>
                  </div>
                </div>

                <div className="table-shell">
                  <div className="table-card">
                    <div className="crop-table" role="list" aria-label="Crops ranked for this field">
                      <div className="crop-sticky">
                        <div className="crop-row crop-head" aria-hidden="true">
                          <span>#</span>
                          <span>Crop</span>
                          <span className="marks">
                            {meta.fields.map((f) => (
                              <span key={f.key}>{SHORT[f.key] ?? f.key}</span>
                            ))}
                          </span>
                          <span className="fit">Fit</span>
                        </div>
                      </div>
                      {rows.map((row, i) => (
                        <CropRow
                          key={row.id}
                          row={row}
                          rank={i + 1}
                          isPick={i === 0}
                          odd={i % 2 === 1}
                          active={row.id === selected.id}
                          onSelect={() => {
                            setSelectedId(row.id);
                            setDetailOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <EmptyState
                meta={meta}
                form={form}
                done={numericDone + choicesDone}
                total={totalInputs}
                status={status}
                message={message}
                onFillSample={(id) => {
                  setForm(sampleValues(meta, id));
                  setSelectedId(null);
                  setDetailOpen(false);
                }}
              />
            )}
          </main>
            </div>

      {detailOpen && selected && (
        <CropDetailModal row={selected} isPick={selected.id === top?.id} form={result?.form ?? form} onClose={() => setDetailOpen(false)} />
      )}

      <form className="inputs" onSubmit={(e) => e.preventDefault()}>
        <div className="inputs-shell">
          <div className="inputs-card">
            <section className="input-tile">
              <header className="bento-head">
                <span className="bento-ico" aria-hidden="true">
                  <Location size={16} variant="Bold" color="currentColor" />
                </span>
                <span className="bento-label">State</span>
              </header>
              <div className="input-well">
                <label className="state-select">
                  <span className="visually-hidden">State</span>
                  <select value={form.state} onChange={(e) => set('state', e.target.value)}>
                    <option value="">Select state</option>
                    {(meta.options.state ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="input-tile">
              <header className="bento-head">
                <span className="bento-ico" aria-hidden="true">
                  <CalendarIcon size={16} variant="Bold" color="currentColor" />
                </span>
                <span className="bento-label">Season</span>
              </header>
              <div className="input-well">
                <Segmented
                  label="Season"
                  value={form.season}
                  options={meta.options.season}
                  render={(s) => (
                    <>
                      {SEASONS[s]?.name ?? s}
                      <small>{SEASONS[s]?.months}</small>
                    </>
                  )}
                  onChange={(v) => set('season', v)}
                />
              </div>
            </section>

            <section className="input-tile">
              <header className="bento-head">
                <span className="bento-ico" aria-hidden="true">
                  <Layer size={16} variant="Bold" color="currentColor" />
                </span>
                <span className="bento-label">Soil type</span>
              </header>
              <div className="input-well">
                <div className="chips" role="radiogroup" aria-label="Soil type">
                  {meta.options.soil.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={form.soil === s} className={`chip${form.soil === s ? ' is-on' : ''}`} onClick={() => set('soil', s)}>
                      <span className={`swatch${SOIL_COLORS[s] ? '' : ' swatch-mixed'}`} style={{ background: SOIL_COLORS[s] ?? undefined }} aria-hidden="true" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="input-tile">
              <header className="bento-head">
                <span className="bento-ico" aria-hidden="true">
                  <Chart size={16} variant="Bold" color="currentColor" />
                </span>
                <span className="bento-label">Nutrients</span>
              </header>
              <div className="input-well input-well-stack">
                {meta.fields
                  .filter((f) => NUTRIENTS.includes(f.key))
                  .map((f) => (
                    <BarInput key={f.key} field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} check={selected?.readings.find((r) => r.key === f.key)} />
                  ))}
              </div>
            </section>

            <section className="input-tile">
              <header className="bento-head">
                <span className="bento-ico" aria-hidden="true">
                  <CloudSunny size={16} variant="Bold" color="currentColor" />
                </span>
                <span className="bento-label">Climate &amp; water</span>
              </header>
              <div className="input-well input-well-stack">
                {meta.fields
                  .filter((f) => !NUTRIENTS.includes(f.key))
                  .map((f) => (
                    <BarInput key={f.key} field={f} value={form[f.key]} onChange={(v) => set(f.key, v)} check={selected?.readings.find((r) => r.key === f.key)} />
                  ))}
                <Segmented label="Water source" value={form.water_source} options={meta.options.water_source} render={(w) => (w === 'irrigated' ? 'Irrigated' : 'Rainfed')} onChange={(v) => set('water_source', v)} />
              </div>
            </section>
          </div>
        </div>
      </form>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Pieces ───────────────────────────────────────────── */

const TAB_MORPH = 'transform 340ms cubic-bezier(0.32, 0.72, 0, 1), width 340ms cubic-bezier(0.32, 0.72, 0, 1)';

function ProjectTabs({ tabs, activeKey, titleFor, onSelect, onClose, onAdd, sidebarOpen, onToggleSidebar }) {
  const listRef = useRef(null);
  const tabRefs = useRef({});
  const [glider, setGlider] = useState({ x: 0, width: 0, ready: false });
  const [leaving, setLeaving] = useState(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const measure = () => {
    const list = listRef.current;
    const el = tabRefs.current[activeKey];
    if (el) {
      const x = el.offsetLeft;
      const width = el.offsetWidth;
      setGlider((prev) => (prev.ready && prev.x === x && prev.width === width ? prev : { x, width, ready: true }));
    }
    if (list) {
      const left = list.scrollLeft > 2;
      const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 2;
      setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    }
  };

  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    Object.values(tabRefs.current).forEach((node) => node && ro.observe(node));
    list.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      list.removeEventListener('scroll', measure);
    };
  }, [tabs, activeKey, leaving]);

  useLayoutEffect(() => {
    const el = tabRefs.current[activeKey];
    const list = listRef.current;
    if (!el || !list) return;
    const left = el.offsetLeft - 12;
    const right = el.offsetLeft + el.offsetWidth + 12;
    if (left < list.scrollLeft) list.scrollTo({ left: left, behavior: 'smooth' });
    else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth, behavior: 'smooth' });
  }, [activeKey]);

  const close = (key) => {
    if (leaving) return;
    if (tabs.length === 1) {
      onClose(key);
      return;
    }
    if (key === activeKey) {
      const index = tabs.findIndex((t) => t.key === key);
      const next = tabs[index + 1] ?? tabs[index - 1];
      if (next) onSelect(next.key);
    }
    setLeaving(key);
    window.setTimeout(() => {
      onClose(key);
      setLeaving(null);
    }, 240);
  };

  return (
    <div className="tabbar">
      <button
        type="button"
        className={`tabbar-btn tabbar-toggle${sidebarOpen ? ' is-open' : ''}`}
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-pressed={sidebarOpen}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.25 3.25v9.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      <div className={`tabbar-scroll${fade.left ? ' has-left' : ''}${fade.right ? ' has-right' : ''}`}>
        <div className="tabbar-tabs" ref={listRef} role="tablist" aria-label="Open analyses">
          <div
            className={`tab-glider${glider.ready ? ' is-ready' : ''}`}
            aria-hidden="true"
            style={{
              width: Math.max(glider.width + 24, 24),
              transform: `translate3d(${glider.x - 12}px, 0, 0)`,
              transition: glider.ready ? TAB_MORPH : 'none',
            }}
          >
            <svg className="tab-glider-curve is-left" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M12 0C12 6.627 6.627 12 0 12H12Z" />
            </svg>
            <div className="tab-glider-body" />
            <svg className="tab-glider-curve is-right" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M12 0C12 6.627 6.627 12 0 12H12Z" />
            </svg>
          </div>

          {tabs.map((t) => {
            const active = t.key === activeKey;
            const title = titleFor(t);
            return (
              <div
                key={t.key}
                ref={(node) => {
                  if (node) tabRefs.current[t.key] = node;
                  else delete tabRefs.current[t.key];
                }}
                className={`tab${active ? ' is-active' : ''}${leaving === t.key ? ' is-leaving' : ''}`}
                role="presentation"
              >
                <button type="button" className="tab-hit" role="tab" aria-selected={active} onClick={() => onSelect(t.key)} title={title}>
                  <span className="tab-label">{title}</span>
                </button>
                <button type="button" className="tab-close" onClick={() => close(t.key)} aria-label={`Close ${title}`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="tabbar-btn tabbar-add" onClick={onAdd} aria-label="New analysis">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ meta, form, done, total, status, message, onFillSample }) {
  const checks = [
    { key: 'season', label: 'Season', done: Boolean(form.season) },
    { key: 'state', label: 'State', done: Boolean(form.state) },
    { key: 'soil', label: 'Soil type', done: Boolean(form.soil) },
    { key: 'water_source', label: 'Water source', done: Boolean(form.water_source) },
    ...meta.fields.map((f) => ({ key: f.key, label: f.label, done: form[f.key] !== '' })),
  ];
  const samples = SAMPLES.filter((s) => meta.crops[s]);
  const remaining = total - done;
  const isError = status === 'offline' || status === 'invalid';
  const isLoading = status === 'loading';
  const isReadyEmpty = done === total && !isLoading && !isError;

  const title = isLoading ? 'Analysing your field…' : isError ? 'Couldn’t load a recommendation' : isReadyEmpty ? 'No recommendation yet' : 'Set up this field';
  const body = isError
    ? message
    : isLoading
      ? 'Matching crops to your readings.'
      : isReadyEmpty
        ? 'Adjust a value on the right to run the model again.'
        : `${remaining} reading${remaining === 1 ? '' : 's'} left on the right. Or fill with a sample field to preview recommendations.`;
  const Icon = isError ? Warning2 : isLoading ? StatusUp : isReadyEmpty ? InfoCircle : ClipboardText;
  const pctDone = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="empty-shell">
      <div className="empty-card">
        <article className="empty-hero">
          <span className={`empty-ico${isError ? ' is-warn' : ''}${isReadyEmpty ? ' is-info' : ''}`} aria-hidden="true">
            <Icon size={22} variant="Bold" color="currentColor" />
          </span>
          <div className="empty-copy">
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
          {!isError && (
            <div className="empty-progress" aria-label={`${done} of ${total} values set`}>
              <div className="empty-progress-meta">
                <span>Progress</span>
                <strong>
                  {done}/{total}
                </strong>
              </div>
              <div className="empty-progress-track">
                <div className="empty-progress-fill" style={{ width: `${pctDone}%` }} />
              </div>
            </div>
          )}
        </article>

        {!isError && !isLoading && samples.length > 0 && (
          <section className="empty-samples" aria-label="Fill with sample">
            <header className="bento-head">
              <span className="bento-ico" aria-hidden="true">
                <StatusUp size={16} variant="Bold" color="currentColor" />
              </span>
              <span className="bento-label">Fill with sample</span>
            </header>
            <div className="empty-well">
              <div className="empty-sample-grid">
                {samples.map((id) => (
                  <button key={id} type="button" className="empty-sample" onClick={() => onFillSample(id)}>
                    <strong>{meta.crops[id].name.replace(/ \(.*\)$/, '')}</strong>
                    <span>{SEASONS[meta.crops[id].season]?.name ?? meta.crops[id].season}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isError && !isLoading && (
          <section className="empty-checklist" aria-label="Required readings">
            <header className="bento-head">
              <span className="bento-ico" aria-hidden="true">
                <TaskSquare size={16} variant="Bold" color="currentColor" />
              </span>
              <span className="bento-label">Checklist</span>
            </header>
            <div className="empty-well">
              <ul className="empty-checks">
                {checks.map((item) => (
                  <li key={item.key} className={`empty-check${item.done ? ' is-done' : ''}`}>
                    <span className="empty-check-ico" aria-hidden="true">
                      {item.done ? <TickCircle size={15} variant="Bold" color="currentColor" /> : <span className="empty-check-dot" />}
                    </span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SavedItem({ entry, active, cropName, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`saved-item${active ? ' is-active' : ''}`} onMouseLeave={() => setConfirming(false)}>
      <button className="saved-open" onClick={onOpen} aria-current={active ? 'true' : undefined}>
        <span className="saved-name">{entry.name}</span>
        <span className="saved-sub">
          {cropName} · {pct(entry.pick.confidence)} · {shortDate(entry.savedAt)}
        </span>
      </button>
      <button
        className={`saved-delete${confirming ? ' is-confirming' : ''}`}
        onClick={() => (confirming ? onDelete() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        aria-label={confirming ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`}
      >
        {confirming ? (
          'Delete'
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </li>
  );
}

// Full-bleed craft slider: drag the whole track, click snaps to deciles.
function BarInput({ field, value, onChange, check }) {
  const num = Number(value);
  const set = value !== '' && !Number.isNaN(num);
  const outside = check && set && (num < check.lo || num > check.hi);

  return (
    <div className={`bar-field${outside ? ' is-outside' : ''}${set ? '' : ' is-empty'}`}>
      <Slider
        label={field.label}
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        unit={field.unit}
        onChange={onChange}
        band={check ? [check.lo, check.hi] : null}
        tone={outside ? 'warn' : null}
      />
    </div>
  );
}

function Segmented({ label, value, options, render, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'is-on' : ''} onClick={() => onChange(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

function Calendar({ crop }) {
  const sow = new Set(crop.sow_months);
  const harvest = new Set(crop.harvest_months);
  const grow = new Set();
  // Fill the months between the last sowing month and the first harvest month (wrapping past December).
  if (crop.sow_months.length && crop.harvest_months.length && !crop.sow_months.some((m) => harvest.has(m))) {
    const last = Math.max(...crop.sow_months);
    const first = crop.harvest_months.find((m) => m > last) ?? crop.harvest_months[0];
    for (let m = (last + 1) % 12; m !== first; m = (m + 1) % 12) grow.add(m);
  }
  return (
    <span className="months" role="img" aria-label={`Sow ${crop.sown}, harvest ${crop.harvested}`}>
      {MONTHS.map((label, m) => {
        const kind = sow.has(m) && harvest.has(m) ? 'both' : sow.has(m) ? 'sow' : harvest.has(m) ? 'harvest' : grow.has(m) ? 'grow' : 'idle';
        return (
          <span key={m} className={`cal ${kind}`}>
            {label}
          </span>
        );
      })}
    </span>
  );
}

function CropRow({ row, rank, isPick, active, odd, onSelect }) {
  const { crop, readings } = row;
  const lower = crop.name.toLowerCase();
  const fitPct = isPick ? row.confidence : readings.length ? row.inRange / readings.length : 0;
  return (
    <div className={`crop-item${active ? ' is-active' : ''}${isPick ? ' is-pick' : ''}${odd ? ' is-odd' : ''}`} role="listitem">
      <div className="crop-row">
        <span className="rank">{rank}</span>
        <span className="crop-name">
          <button type="button" onClick={onSelect} aria-haspopup="dialog">
            {crop.name}
          </button>
          <span className="crop-tags">
            <small>{crop.type}</small>
            {isPick && <span className="status-badge is-pick">Pick</span>}
            {active && !isPick && <span className="status-badge is-open">Selected</span>}
          </span>
        </span>
        <span className="marks" role="img" aria-label={`${row.inRange} of ${readings.length} readings in range`}>
          {readings.map((r) => (
            <span key={r.key} className={`mark ${r.status === 'ok' ? 'ok' : 'off'}`} title={`${r.label}: ${advice(r, lower)}`} />
          ))}
        </span>
        <span className={`fit${isPick ? ' is-strong' : fitPct < 0.7 ? ' is-weak' : ''}`}>
          {pct(fitPct)}
        </span>
      </div>
    </div>
  );
}

function CropDetailModal({ row, isPick, form, onClose }) {
  const { crop, readings } = row;
  const lower = crop.name.toLowerCase();
  const soils = crop.soils.filter((s) => s !== 'Other');
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="crop-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crop-modal-panel" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
        <header className="crop-modal-head">
          <div className="crop-modal-title">
            <p className="crop-modal-kicker">{isPick ? 'Top pick' : 'Crop detail'}</p>
            <h2 id="crop-modal-title" ref={titleRef} tabIndex={-1}>
              {crop.name}
            </h2>
            <p className="crop-modal-sub">
              {crop.type}
              {isPick ? ` · ${pct(row.confidence)} fit` : ` · ${pct(row.inRange / readings.length)} in range`}
            </p>
          </div>
          <button type="button" className="crop-modal-close" onClick={onClose} aria-label="Close details">
            <CloseCircle size={22} variant="Bold" color="currentColor" />
          </button>
        </header>

        <div className="crop-modal-body detail-inner">
          <section className="showcase-panel showcase-facts" aria-label="Growing profile">
            <header className="showcase-head">
              <h3>Growing profile</h3>
              <p>Season window and field fit</p>
            </header>
            <div className="fact-grid">
              <article className="fact-card">
                <span className="fact-ico" aria-hidden="true">
                  <Drop size={15} variant="Bold" color="currentColor" />
                </span>
                <div>
                  <span className="fact-label">Sow</span>
                  <strong className="fact-value">{crop.sown}</strong>
                </div>
              </article>
              <article className="fact-card">
                <span className="fact-ico" aria-hidden="true">
                  <Award size={15} variant="Bold" color="currentColor" />
                </span>
                <div>
                  <span className="fact-label">Harvest</span>
                  <strong className="fact-value">{crop.harvested}</strong>
                </div>
              </article>
              <article className="fact-card">
                <span className="fact-ico" aria-hidden="true">
                  <CalendarIcon size={15} variant="Bold" color="currentColor" />
                </span>
                <div>
                  <span className="fact-label">Duration</span>
                  <strong className="fact-value">~{crop.duration_days} days</strong>
                </div>
              </article>
              <article className={`fact-card${row.soilOk ? '' : ' is-off'}`}>
                <span className="fact-ico" aria-hidden="true">
                  <Layer size={15} variant="Bold" color="currentColor" />
                </span>
                <div>
                  <span className="fact-label">Soils</span>
                  <strong className="fact-value">{soils.join(', ') || 'Varied'}</strong>
                  {!row.soilOk && <span className="fact-note">Not ideal for {form.soil.toLowerCase()}</span>}
                </div>
              </article>
              <article className="fact-card fact-card-wide">
                <span className="fact-ico" aria-hidden="true">
                  <Drop size={15} variant="Bold" color="currentColor" />
                </span>
                <div>
                  <span className="fact-label">Usually</span>
                  <strong className="fact-value">{crop.water_source}</strong>
                </div>
              </article>
            </div>
          </section>

          <section className="showcase-panel showcase-readings" aria-label="Field readings">
            <header className="showcase-head">
              <h3>Field readings</h3>
              <p>
                {row.inRange}/{readings.length} within typical range
              </p>
            </header>
            <ul className="reading-list">
              {readings.map((r) => {
                const ok = r.status === 'ok';
                return (
                  <li key={r.key} className={`reading-row${ok ? '' : ' is-off'}`}>
                    <div className="reading-main">
                      <span className="reading-label">{r.label}</span>
                      <span className="reading-yours">{withUnit(fmt(r.v), r.unit)}</span>
                    </div>
                    <div className="reading-meta">
                      <span className="reading-typical">Typical {range(r.lo, r.hi, r.unit)}</span>
                      <span className={`reading-pill${ok ? ' is-up' : ' is-down'}`}>
                        {ok ? <TickCircle size={13} variant="Bold" color="currentColor" /> : <Warning2 size={13} variant="Bold" color="currentColor" />}
                        {ok ? 'In range' : advice(r, lower)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const DATA_PAGE = 80;

const DATA_HEADERS = {
  crop: 'Crop',
  state: 'State',
  soil: 'Soil',
  season: 'Season',
  water: 'Water',
  N: 'N',
  P: 'P',
  K: 'K',
  pH: 'pH',
  temp: 'Temp °C',
  RH: 'RH %',
  rain_mm: 'Rain mm',
};

const DATA_NUM_COLS = new Set(['N', 'P', 'K', 'pH', 'temp', 'RH', 'rain_mm']);

function DatasetModal({ meta, onClose }) {
  const titleRef = useRef(null);
  const [crop, setCrop] = useState('');
  const [offset, setOffset] = useState(0);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setStatus('loading');
    setError('');
    const params = new URLSearchParams({ limit: String(DATA_PAGE), offset: String(offset) });
    if (crop) params.set('crop', crop);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dataset?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setPayload(data);
        setStatus('ready');
      } catch (err) {
        if (err.name === 'AbortError' || !alive) return;
        setStatus('error');
        setError(err.message || `Can't reach ${API_BASE_URL}`);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [crop, offset]);

  const crops = Object.entries(meta.crops).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const total = payload?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + (payload?.rows?.length ?? 0), total);
  const canPrev = offset > 0;
  const canNext = offset + DATA_PAGE < total;

  const modal = (
    <div className="crop-modal data-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crop-modal-panel data-modal-panel" role="dialog" aria-modal="true" aria-labelledby="data-modal-title">
        <header className="crop-modal-head">
          <div className="crop-modal-title">
            <p className="crop-modal-kicker">Training set</p>
            <h2 id="data-modal-title" ref={titleRef} tabIndex={-1}>
              Raw data
            </h2>
            <p className="crop-modal-sub">India multi-state training set · {meta.rows.toLocaleString()} rows · 16 states</p>
          </div>
          <button type="button" className="crop-modal-close" onClick={onClose} aria-label="Close raw data">
            <CloseCircle size={22} variant="Bold" color="currentColor" />
          </button>
        </header>

        <div className="data-modal-toolbar">
          <label className="data-filter">
            <span>Crop</span>
            <select
              value={crop}
              onChange={(e) => {
                setCrop(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All crops</option>
              {crops.map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="data-range" aria-live="polite">
            {status === 'ready' ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : '…'}
          </p>
          <div className="data-pager">
            <button type="button" className="btn" disabled={!canPrev || status === 'loading'} onClick={() => setOffset((o) => Math.max(0, o - DATA_PAGE))}>
              Previous
            </button>
            <button type="button" className="btn" disabled={!canNext || status === 'loading'} onClick={() => setOffset((o) => o + DATA_PAGE)}>
              Next
            </button>
          </div>
        </div>

        <div className="data-modal-body">
          {status === 'loading' && <p className="data-status">Loading rows…</p>}
          {status === 'error' && <p className="data-status is-error">{error}</p>}
          {status === 'ready' && payload?.rows?.length === 0 && <p className="data-status">No rows for this filter.</p>}
          {status === 'ready' && payload?.rows?.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {payload.columns.map((col) => (
                      <th key={col} className={DATA_NUM_COLS.has(col) ? 'is-num' : undefined}>
                        {DATA_HEADERS[col] ?? col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.map((row, i) => (
                    <tr key={`${offset}-${i}`}>
                      {payload.columns.map((col) => {
                        let value = row[col];
                        if (col === 'season' || col === 'water') value = String(row[col]).replace(/^./, (c) => c.toUpperCase());
                        return (
                          <td key={col} className={DATA_NUM_COLS.has(col) ? 'is-num' : undefined}>
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default App;
