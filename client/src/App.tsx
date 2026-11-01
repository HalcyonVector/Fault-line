import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuakeFeed } from './api/useQuakeFeed';
import { useStoredState } from './hooks/useStoredState';
import { useNow } from './hooks/useNow';
import { WorldMap, type ColorMode, type MapInsets } from './map/WorldMap';
import { FeedPanel } from './components/FeedPanel';
import { OverviewPanel } from './components/OverviewPanel';
import { QuakeDetail } from './components/QuakeDetail';
import { Timeline } from './components/Timeline';
import { MapMenu } from './components/MapMenu';
import { LocationMenu } from './components/LocationMenu';
import { AlertsMenu } from './components/AlertsMenu';
import { Legend } from './components/Legend';
import { Toasts, type Toast } from './components/Toasts';
import { AboutDialog } from './components/AboutDialog';
import { cityImpacts, nearestCity } from './lib/cities';
import { RANGE_SPEC, binByTime, visibleAt, advanceCursor } from './lib/timeline';
import { alertReason, newArrivals, DEFAULT_ALERT_SETTINGS } from './lib/alerts';
import { formatRelativeTime } from './lib/format';
import type { AlertSettings, FeedRange, UserLocation } from './types';
import './styles.css';

const RANGES: { id: FeedRange; label: string; short: string }[] = [
  { id: 'hour', label: 'Hour', short: '1h' },
  { id: 'day', label: 'Day', short: '24h' },
  { id: 'week', label: 'Week', short: '7d' },
  { id: 'month', label: 'Month', short: '30d' },
];
const isRange = (v: unknown): v is FeedRange => RANGES.some((r) => r.id === v);
const isLocation = (v: unknown): v is UserLocation | null =>
  v === null || (typeof v === 'object' && v !== null && Number.isFinite((v as UserLocation).lat) && Number.isFinite((v as UserLocation).lon));

const PLAYBACK_SECONDS = 24;

function readHashId(): string | null {
  const m = window.location.hash.match(/quake=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mql = window.matchMedia(q);
    const on = () => setMatch(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [q]);
  return match;
}

function labelFor(lon: number, lat: number): string {
  const c = nearestCity(lon, lat);
  return c && c.distanceKm < 60 ? c.name : 'your location';
}

export default function App() {
  const [range, setRange] = useStoredState<FeedRange>('fl.range', 'day', isRange);
  const [minMag, setMinMag] = useStoredState('fl.minMag', 0);
  const [colorMode, setColorMode] = useStoredState<ColorMode>('fl.color', 'depth');
  const [showPlates, setShowPlates] = useStoredState('fl.plates', true);
  const [includeOther, setIncludeOther] = useStoredState('fl.other', false);
  const [location, setLocation] = useStoredState<UserLocation | null>('fl.location', null, isLocation);
  const [alerts, setAlerts] = useStoredState<AlertSettings>('fl.alerts', DEFAULT_ALERT_SETTINGS);
  const [tab, setTab] = useState<'feed' | 'overview'>('feed');
  const [selectedId, setSelectedId] = useState<string | null>(readHashId);
  const [focusNonce, setFocusNonce] = useState(() => (readHashId() ? 1 : 0));
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [showShaking, setShowShaking] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery('(min-width: 980px)');

  const feed = useQuakeFeed(range);
  const now = useNow(1000);
  const spec = RANGE_SPEC[range];
  const feedReady = feed.data?.range === range;

  // ---- Data ------------------------------------------------------------
  const allQuakes = useMemo(() => (feedReady ? feed.data!.quakes : feed.data?.quakes ?? []), [feed.data, feedReady]);
  const filtered = useMemo(
    () => allQuakes.filter((q) => q.mag >= minMag && (includeOther || q.type === 'earthquake')),
    [allQuakes, minMag, includeOther],
  );
  const visible = useMemo(() => visibleAt(filtered, cursor), [filtered, cursor]);
  const listOrder = useMemo(() => [...visible].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)), [visible]);
  const selected = useMemo(() => allQuakes.find((q) => q.id === selectedId) ?? null, [allQuakes, selectedId]);
  const impacts = useMemo(() => (selected ? cityImpacts(selected.lon, selected.lat, selected.mag, selected.depthKm) : []), [selected]);

  // The live edge, rounded to the minute so the timeline doesn't reflow every second.
  const liveEdge = Math.ceil(now / 60_000) * 60_000;
  const startMs = liveEdge - spec.spanMs;
  const bins = useMemo(() => binByTime(filtered, liveEdge, spec.spanMs, spec.binMs), [filtered, liveEdge, spec]);
  // Age coloring and pulses only need ~5 s resolution live; replay needs the exact cursor.
  const clockMs = cursor ?? Math.floor(now / 5000) * 5000;

  // ---- Selection & URL hash ----------------------------------------------
  const select = useCallback((id: string | null, fly = true) => {
    setSelectedId(id);
    if (id && fly) setFocusNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const want = selectedId ? `#quake=${encodeURIComponent(selectedId)}` : '';
    if (window.location.hash !== want) history.replaceState(null, '', want || window.location.pathname + window.location.search);
  }, [selectedId]);

  useEffect(() => {
    const onHash = () => select(readHashId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [select]);

  // A shared link may point at an older event: widen the window until it's found (up to a month).
  useEffect(() => {
    if (!feedReady || !selectedId || selected) return;
    const order: FeedRange[] = ['hour', 'day', 'week', 'month'];
    const next = order[order.indexOf(range) + 1];
    if (next && focusNonce === 1) setRange(next);
  }, [feedReady, selectedId, selected, range, focusNonce, setRange]);

  useEffect(() => {
    document.title = selected ? `M${selected.mag.toFixed(1)} ${selected.place} · Fault Line` : 'Fault Line · Live earthquakes';
  }, [selected]);

  // ---- Playback --------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      setCursor((c) => {
        const next = advanceCursor(c ?? startMs, dt, spec.spanMs, PLAYBACK_SECONDS, liveEdge);
        if (next === null) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, startMs, liveEdge, spec.spanMs]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p) setCursor((c) => (c === null || c >= liveEdge - spec.binMs ? startMs : c));
      return !p;
    });
  }, [liveEdge, startMs, spec.binMs]);

  const goLive = useCallback(() => {
    setPlaying(false);
    setCursor(null);
  }, []);

  useEffect(goLive, [range, goLive]);

  // ---- Alerts --------------------------------------------------------------
  const seen = useRef(new Set<string>());
  const baselined = useRef(new Set<FeedRange>());
  useEffect(() => {
    if (!feedReady) return;
    const quakes = feed.data!.quakes;
    const first = !baselined.current.has(range);
    const arrivals = newArrivals(quakes, first ? null : seen.current);
    quakes.forEach((q) => seen.current.add(q.id));
    baselined.current.add(range);
    if (!alerts.enabled || arrivals.length === 0) return;
    const fresh: Toast[] = [];
    for (const q of arrivals) {
      if (q.time !== null && Date.now() - q.time > 3 * 3_600_000) continue;
      const reason = alertReason(q, alerts, location);
      if (!reason) continue;
      fresh.push({ key: `${q.id}-${Date.now()}`, quake: q, reason });
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(`M${q.mag.toFixed(1)} · ${q.place}`, { body: reason, tag: q.id, icon: '/icon-192.png' });
          n.onclick = () => {
            window.focus();
            select(q.id);
          };
        } catch {
          // Some mobile browsers only allow notifications from a service worker; the in-app toast still shows.
        }
      }
    }
    if (fresh.length) setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4));
  }, [feed.data, feedReady, range, alerts, location, select]);

  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts((t) => t.slice(0, -1)), 12_000);
    return () => clearTimeout(id);
  }, [toasts]);

  // ---- Location ----------------------------------------------------------------
  const useGeolocation = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('This browser has no geolocation.'));
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lon } = pos.coords;
            setLocation({ lat, lon, label: labelFor(lon, lat) });
            resolve();
          },
          (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Try "Pick on map".' : 'Could not get your location.')),
          { timeout: 10_000, maximumAge: 600_000 },
        );
      }),
    [setLocation],
  );

  const onPick = useCallback(
    (lon: number, lat: number) => {
      setLocation({ lat, lon, label: labelFor(lon, lat) });
      setPicking(false);
    },
    [setLocation],
  );

  // ---- Keyboard ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if (e.key === 'Escape') {
        if (typing) return el.blur();
        if (picking) return setPicking(false);
        if (aboutOpen) return;
        if (selectedId) select(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        setTab('feed');
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === 'j' || e.key === 'k') {
        if (!listOrder.length) return;
        const i = listOrder.findIndex((q) => q.id === selectedId);
        const next = e.key === 'j' ? Math.min(listOrder.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1);
        select(listOrder[next].id);
      } else if (e.key === ' ' && el.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, aboutOpen, selectedId, select, listOrder, togglePlay]);

  // ---- Layout ----------------------------------------------------------------------
  const insets: MapInsets = wide
    ? { top: 76, left: 392, right: selected ? 452 : 20, bottom: 112 }
    : { top: 8, left: 8, right: 8, bottom: 8 };

  const status = (() => {
    if (feed.error && !feed.data) return { tone: 'bad', text: 'Feed unavailable' };
    if (!feedReady) return { tone: 'wait', text: `Loading ${spec.label.toLowerCase()}…` };
    if (feed.error || feed.data!.stale) return { tone: 'warn', text: 'USGS unreachable · showing last good data' };
    const gen = feed.data!.generatedAt;
    return { tone: 'ok', text: gen ? `Live · USGS updated ${formatRelativeTime(gen, now)}` : 'Live' };
  })();

  const leftPanel = (
    <aside className="panel panel-left" aria-label="Events">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>
          Feed
        </button>
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </button>
      </div>
      <div className="panel-scroll">
        {tab === 'feed' ? (
          <FeedPanel ref={searchRef} quakes={visible} selectedId={selectedId} nowMs={now} onSelect={select} location={location} search={search} onSearch={setSearch} />
        ) : (
          <OverviewPanel quakes={visible} nowMs={now} rangeLabel={spec.label} onSelect={select} />
        )}
      </div>
    </aside>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" className="brand-mark">
            <path d="M2 17h6l3-9 4 17 4-21 3 13h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="brand-name">Fault Line</span>
        </div>
        <span className={`status status-${status.tone}`} role="status">
          <i />
          {status.text}
        </span>
        <div className="seg range" role="group" aria-label="Time window">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)} aria-label={`Past ${r.label.toLowerCase()}`}>
              <span className="long">{r.label}</span>
              <span className="short">{r.short}</span>
            </button>
          ))}
        </div>
        <div className="topbar-actions">
          <MapMenu
            colorMode={colorMode} onColorMode={setColorMode} minMag={minMag} onMinMag={setMinMag}
            showPlates={showPlates} onShowPlates={setShowPlates} includeOther={includeOther} onIncludeOther={setIncludeOther}
          />
          <LocationMenu location={location} onUseGeolocation={useGeolocation} onPick={() => setPicking(true)} onClear={() => setLocation(null)} />
          <AlertsMenu settings={alerts} onChange={setAlerts} location={location} />
          <button type="button" className="tb-btn tb-icon" onClick={() => setAboutOpen(true)} aria-label="About and help" title="About">
            ?
          </button>
        </div>
      </header>

      <main className="stage">
        <WorldMap
          quakes={visible}
          selected={selected}
          focusNonce={focusNonce}
          onSelect={(id) => select(id, false)}
          colorMode={colorMode}
          clockMs={clockMs}
          rangeSpanMs={spec.spanMs}
          location={location}
          picking={picking}
          onPick={onPick}
          showPlates={showPlates}
          showShaking={showShaking}
          impacts={selected && showShaking ? impacts : []}
          insets={insets}
        />

        {wide && <Legend colorMode={colorMode} showPlates={showPlates} style={{ left: insets.left, bottom: insets.bottom + 4 }} />}

        <div className="timeline-dock" style={wide ? { left: insets.left, right: insets.right } : undefined}>
          <Timeline
            bins={bins}
            startMs={startMs}
            endMs={liveEdge}
            cursorMs={cursor}
            playing={playing}
            rangeLabel={`${visible.length.toLocaleString()} events · ${spec.label}`}
            onScrub={(ms) => {
              setPlaying(false);
              setCursor(ms >= liveEdge - spec.binMs / 4 ? null : ms);
            }}
            onTogglePlay={togglePlay}
            onLive={goLive}
          />
        </div>

        {leftPanel}

        {selected && (
          <aside className="panel panel-right" aria-label="Event details">
            <div className="panel-scroll">
              <QuakeDetail
                key={selected.id}
                quake={selected}
                catalog={allQuakes}
                nowMs={now}
                location={location}
                impacts={impacts}
                showShaking={showShaking}
                onToggleShaking={() => setShowShaking((s) => !s)}
                onSelect={select}
                onClose={() => select(null)}
              />
            </div>
          </aside>
        )}

        {selectedId && feedReady && !selected && range === 'month' && (
          <div className="banner">That event isn't in the last 30 days of USGS M2.5+ data any more.</div>
        )}
        {feed.error && !feed.data && (
          <div className="banner banner-bad" role="alert">
            Couldn't reach the earthquake feed ({feed.error}). Retrying automatically.
            <button type="button" className="link" onClick={feed.refresh}>Retry now</button>
          </div>
        )}
        {!feed.data && !feed.error && <div className="loading">Listening to the planet…</div>}

        <Toasts toasts={toasts} onOpen={(id) => select(id)} onDismiss={(key) => setToasts((t) => t.filter((x) => x.key !== key))} />
      </main>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

