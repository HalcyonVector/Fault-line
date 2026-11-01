import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuakeFeed } from './api/useQuakeFeed';
import { useObserved } from './api/useObserved';
import { useArchive } from './api/useArchive';
import { ArchivePanel } from './components/ArchivePanel';
import { archiveSpan, describeArchive, type ArchiveQuery } from './lib/archive';
import { useStoredState } from './hooks/useStoredState';
import { useNow } from './hooks/useNow';
import { WorldMap, type ColorMode, type MapInsets, type ViewRequest } from './map/WorldMap';
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
import type { AlertSettings, FeedRange, ShakingSource, UserLocation } from './types';
import './styles.css';

// three.js is only downloaded when someone opens the 3D view.
const GlobeView = lazy(() => import('./globe/GlobeView'));

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
  const [view, setView] = useStoredState<'map' | 'globe'>('fl.view', 'map', (v): v is 'map' | 'globe' => v === 'map' || v === 'globe');
  const [showPlates, setShowPlates] = useStoredState('fl.plates', true);
  const [includeOther, setIncludeOther] = useStoredState('fl.other', false);
  const [location, setLocation] = useStoredState<UserLocation | null>('fl.location', null, isLocation);
  const [alerts, setAlerts] = useStoredState<AlertSettings>('fl.alerts', DEFAULT_ALERT_SETTINGS);
  const [mode, setMode] = useState<'live' | 'archive'>('live');
  const [archiveQuery, setArchiveQuery] = useState<ArchiveQuery | null>(null);
  const [tab, setTab] = useState<'search' | 'feed' | 'overview'>('feed');
  const [selectedId, setSelectedId] = useState<string | null>(readHashId);
  const [focusNonce, setFocusNonce] = useState(() => (readHashId() ? 1 : 0));
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ nonce: 0, area: null });
  const requestView = useCallback((area: ViewRequest['area']) => setViewRequest((v) => ({ nonce: v.nonce + 1, area })), []);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [showShaking, setShowShaking] = useState(true);
  const [shakingSource, setShakingSource] = useState<ShakingSource>('estimate');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery('(min-width: 980px)');

  const feed = useQuakeFeed(range);
  const now = useNow(1000);
  const spec = RANGE_SPEC[range];
  const feedReady = feed.data?.range === range;
  const archive = useArchive(mode === 'archive' ? archiveQuery : null);
  const isArchive = mode === 'archive';

  // ---- Data ------------------------------------------------------------
  const allQuakes = useMemo(
    () => (isArchive ? archive.quakes : feedReady ? feed.data!.quakes : feed.data?.quakes ?? []),
    [isArchive, archive.quakes, feed.data, feedReady],
  );
  const filtered = useMemo(
    () => allQuakes.filter((q) => q.mag >= minMag && (includeOther || q.type === 'earthquake')),
    [allQuakes, minMag, includeOther],
  );
  const visible = useMemo(() => visibleAt(filtered, cursor), [filtered, cursor]);
  const listOrder = useMemo(() => [...visible].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)), [visible]);
  const selected = useMemo(() => allQuakes.find((q) => q.id === selectedId) ?? null, [allQuakes, selectedId]);
  const observed = useObserved(selected);
  useEffect(() => setShakingSource('estimate'), [selectedId]);
  const impacts = useMemo(() => (selected ? cityImpacts(selected.lon, selected.lat, selected.mag, selected.depthKm) : []), [selected]);

  // The live edge, rounded to the minute so the timeline doesn't reflow every second.
  const liveEdge = Math.ceil(now / 60_000) * 60_000;
  // The time span on screen: the rolling live window, or the archive query's dates.
  const { startMs, endMs, spanMs, binMs } = useMemo(() => {
    if (isArchive && archiveQuery) {
      const s = archiveSpan(archiveQuery);
      const span = s.endMs - s.startMs;
      return { startMs: s.startMs, endMs: s.endMs, spanMs: span, binMs: span / 60 };
    }
    return { startMs: liveEdge - spec.spanMs, endMs: liveEdge, spanMs: spec.spanMs, binMs: spec.binMs };
  }, [isArchive, archiveQuery, liveEdge, spec]);
  const bins = useMemo(() => binByTime(filtered, endMs, spanMs, binMs), [filtered, endMs, spanMs, binMs]);
  // Age coloring and pulses only need ~5 s resolution live; replay needs the exact cursor.
  const clockMs = cursor ?? (isArchive ? endMs : Math.floor(now / 5000) * 5000);
  // Live: the last hour pulses. Archive replay: whatever happened in the last ~2.5% of the span.
  const pulseWindowMs = isArchive ? (cursor === null ? 0 : spanMs / 40) : Math.min(3_600_000, spanMs / 24);

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
    if (isArchive || !feedReady || !selectedId || selected) return;
    const order: FeedRange[] = ['hour', 'day', 'week', 'month'];
    const next = order[order.indexOf(range) + 1];
    if (next && focusNonce === 1) setRange(next);
  }, [isArchive, feedReady, selectedId, selected, range, focusNonce, setRange]);

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
        const next = advanceCursor(c ?? startMs, dt, spanMs, PLAYBACK_SECONDS, endMs);
        if (next === null) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, startMs, endMs, spanMs]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p) setCursor((c) => (c === null || c >= endMs - binMs ? startMs : c));
      return !p;
    });
  }, [endMs, startMs, binMs]);

  const goLive = useCallback(() => {
    setPlaying(false);
    setCursor(null);
  }, []);

  useEffect(goLive, [range, mode, archiveQuery, goLive]);

  const switchMode = useCallback(
    (m: 'live' | 'archive') => {
      setMode(m);
      setSelectedId(null);
      setSearch('');
      setTab(m === 'archive' ? 'search' : 'feed');
      requestView(null);
    },
    [requestView],
  );

  // Show the results list once an archive search lands.
  useEffect(() => {
    if (isArchive && archiveQuery && !archive.loading && !archive.error && archive.quakes.length) {
      setTab('feed');
      setSelectedId(null);
      requestView(archiveQuery.near ? { lon: archiveQuery.near.lon, lat: archiveQuery.near.lat, radiusKm: archiveQuery.near.radiusKm } : null);
    }
  }, [isArchive, archiveQuery, archive.loading, archive.error, archive.quakes, requestView]);

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

  const windowLabel = isArchive ? (archiveQuery ? describeArchive(archiveQuery) : 'Archive') : spec.label;

  const status = (() => {
    if (isArchive) {
      if (archive.error) return { tone: 'bad', text: 'Archive search failed' };
      if (archive.loading) return { tone: 'wait', text: 'Searching the USGS archive…' };
      return { tone: 'archive', text: archiveQuery ? `Archive · ${archive.quakes.length.toLocaleString()} events` : 'Archive · pick a search' };
    }
    if (feed.error && !feed.data) return { tone: 'bad', text: 'Feed unavailable' };
    if (!feedReady) return { tone: 'wait', text: `Loading ${spec.label.toLowerCase()}…` };
    if (feed.error || feed.data!.stale) return { tone: 'warn', text: 'USGS unreachable · showing last good data' };
    const gen = feed.data!.generatedAt;
    return { tone: 'ok', text: gen ? `Live · USGS updated ${formatRelativeTime(gen, now)}` : 'Live' };
  })();

  const leftPanel = (
    <aside className="panel panel-left" aria-label="Events">
      <div className="tabs" role="tablist">
        {isArchive && (
          <button type="button" role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>
            Search
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>
          {isArchive ? 'Results' : 'Feed'}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </button>
      </div>
      <div className="panel-scroll">
        {tab === 'search' && isArchive ? (
          <ArchivePanel
            query={archiveQuery}
            onRun={setArchiveQuery}
            location={location}
            loading={archive.loading}
            error={archive.error}
            count={archive.quakes.length}
            truncated={archive.truncated}
          />
        ) : tab === 'feed' ? (
          isArchive && !archiveQuery ? (
            <p className="empty">Run a search to load events from the archive.</p>
          ) : (
          <FeedPanel ref={searchRef} quakes={visible} selectedId={selectedId} nowMs={now} onSelect={select} location={location} search={search} onSearch={setSearch} />
          )
        ) : (
          <OverviewPanel quakes={visible} nowMs={now} rangeLabel={windowLabel} onSelect={select} />
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
        <div className="seg mode" role="group" aria-label="Mode">
          <button type="button" aria-pressed={!isArchive} onClick={() => switchMode('live')}>Live</button>
          <button type="button" aria-pressed={isArchive} onClick={() => switchMode('archive')}>Archive</button>
        </div>
        <div className={`seg range${isArchive ? ' range-hidden' : ''}`} role="group" aria-label="Time window">
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
          <LocationMenu
            location={location}
            onUseGeolocation={useGeolocation}
            onPick={() => setPicking(true)}
            onCity={(c) => setLocation({ lat: c.lat, lon: c.lon, label: c.name })}
            onClear={() => setLocation(null)}
          />
          <AlertsMenu settings={alerts} onChange={setAlerts} location={location} />
          <button type="button" className="tb-btn tb-icon" onClick={() => setAboutOpen(true)} aria-label="About and help" title="About">
            ?
          </button>
        </div>
      </header>

      <main className="stage">
        {view === 'globe' ? (
          <Suspense fallback={<div className="loading">Building the globe…</div>}>
            <GlobeView
              quakes={visible}
              selected={selected}
              focusNonce={focusNonce}
              viewRequest={viewRequest}
              onSelect={(id) => select(id, false)}
              colorMode={colorMode}
              clockMs={clockMs}
              rangeSpanMs={spanMs}
              showPlates={showPlates}
              location={location}
              insets={insets}
            />
          </Suspense>
        ) : (
          <WorldMap
            quakes={visible}
            selected={selected}
            focusNonce={focusNonce}
            viewRequest={viewRequest}
            onSelect={(id) => select(id, false)}
            colorMode={colorMode}
            clockMs={clockMs}
            rangeSpanMs={spanMs}
            pulseWindowMs={pulseWindowMs}
            location={location}
            picking={picking}
            onPick={onPick}
            showPlates={showPlates}
            showShaking={showShaking}
            shakingSource={shakingSource}
            observed={observed.data}
            impacts={selected && showShaking ? impacts : []}
            insets={insets}
          />
        )}

        <div className="seg view-switch" role="group" aria-label="View" style={wide ? { left: insets.left + 14, top: insets.top + 12 } : undefined}>
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button>
          <button type="button" aria-pressed={view === 'globe'} onClick={() => setView('globe')}>3D globe</button>
        </div>

        {wide && <Legend colorMode={colorMode} showPlates={showPlates} style={{ left: insets.left, bottom: insets.bottom + 4 }} />}

        {(!isArchive || archiveQuery) && (
        <div className="timeline-dock" style={wide ? { left: insets.left, right: insets.right } : undefined}>
          <Timeline
            bins={bins}
            startMs={startMs}
            endMs={endMs}
            cursorMs={cursor}
            playing={playing}
            rangeLabel={`${visible.length.toLocaleString()} events · ${windowLabel}`}
            onScrub={(ms) => {
              setPlaying(false);
              setCursor(ms >= endMs - binMs / 4 ? null : ms);
            }}
            onTogglePlay={togglePlay}
            onLive={goLive}
            liveLabel={isArchive ? <>All results</> : undefined}
            backLabel={isArchive ? 'Show all' : 'Back to live'}
          />
        </div>
        )}

        {leftPanel}

        {selected && (
          <aside className="panel panel-right" aria-label="Event details">
            <div className="panel-scroll">
              <QuakeDetail
                key={selected.id}
                quake={selected}
                catalog={allQuakes}
                catalogLabel={isArchive ? 'these results' : 'this feed'}
                nowMs={now}
                location={location}
                impacts={impacts}
                showShaking={showShaking}
                onToggleShaking={() => setShowShaking((s) => !s)}
                source={shakingSource}
                onSource={setShakingSource}
                observed={observed}
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

