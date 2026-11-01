import { useMemo, useState } from 'react';
import { MagBadge } from './MagBadge';
import { formatRelativeTime, formatUtc, formatLocal, formatKm, formatPercent, formatPopulation, formatCoords } from '../lib/format';
import { haversineKm, bearingDeg, compassPoint } from '../lib/geo';
import type { CityImpact } from '../lib/cities';
import { estimateMmi, mmiRoman, mmiShaking, mmiDamage, radiusForMmi } from '../seismology/intensity';
import { forecastTable, summarizeSequence } from '../seismology/aftershocks';
import { magnitudeToJoules, joulesToTonsTnt, formatTnt, depthBand } from '../seismology/stats';
import { mmiColor, PLATE_COLORS } from '../map/colors';
import type { ObservedShaking, Quake, ShakingSource, UserLocation } from '../types';
import { pointInRing } from '../lib/geo';

interface Props {
  quake: Quake;
  catalog: Quake[];
  /** How to refer to the loaded events, e.g. "this feed" or "these results". */
  catalogLabel?: string;
  nowMs: number;
  location: UserLocation | null;
  impacts: CityImpact[];
  showShaking: boolean;
  onToggleShaking: () => void;
  source: ShakingSource;
  onSource: (s: ShakingSource) => void;
  observed: { data: ObservedShaking | null; loading: boolean; error: string | null };
  onSelect: (id: string) => void;
  onClose: () => void;
}

function MmiChip({ mmi }: { mmi: number }) {
  return (
    <span className="mmi" style={{ background: mmiColor(mmi) }} title={`Estimated intensity ${mmiRoman(mmi)}: ${mmiShaking(mmi)}`}>
      {mmiRoman(mmi)}
    </span>
  );
}

const DEPTH_TEXT = { shallow: 'Shallow', intermediate: 'Intermediate', deep: 'Deep' } as const;

export function QuakeDetail({ quake: q, catalog, catalogLabel = 'this feed', nowMs, location, impacts, showShaking, onToggleShaking, source, onSource, observed, onSelect, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const sequence = useMemo(() => summarizeSequence(q, catalog), [q, catalog]);
  const recent = q.time !== null && nowMs - q.time < 365 * 86_400_000;
  const forecast = useMemo(() => (q.time && recent && q.mag >= 4 ? forecastTable(q.mag, q.time, nowMs) : null), [q, nowMs, recent]);
  const rank = useMemo(() => catalog.filter((o) => o.mag > q.mag).length + 1, [catalog, q]);
  const strongKm = radiusForMmi(q.mag, q.depthKm, 6);
  const feltKm = radiusForMmi(q.mag, q.depthKm, 4);
  const epicentreMmi = estimateMmi(q.mag, 0, q.depthKm);

  const you = useMemo(() => {
    if (!location) return null;
    const km = haversineKm(location.lon, location.lat, q.lon, q.lat);
    return { km, dir: compassPoint(bearingDeg(location.lon, location.lat, q.lon, q.lat)), mmi: estimateMmi(q.mag, km, q.depthKm) };
  }, [location, q]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#quake=${encodeURIComponent(q.id)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: nothing useful to do */
    }
  };

  const reportedAt = (lon: number, lat: number) => observed.data?.dyfi?.cells.find((cell) => pointInRing(lon, lat, cell.ring)) ?? null;

  const plate = q.plate;
  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <MagBadge mag={q.mag} size="lg" />
        <div className="detail-titles">
          <span className="eyebrow">
            {q.magType ? `${q.magType.toUpperCase()} · ` : ''}
            {q.status === 'reviewed' ? 'Reviewed by a seismologist' : 'Automatic solution'}
          </span>
          <h2 id="detail-title">{q.place}</h2>
          {q.time && (
            <p className="detail-time">
              {formatRelativeTime(q.time, nowMs)} · {formatLocal(q.time)} <span className="dim">({formatUtc(q.time)})</span>
            </p>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details (Esc)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      {(q.tsunami === 1 || q.alert || sequence.largerFollower || sequence.parent) && (
        <div className="callouts">
          {q.tsunami === 1 && (
            <p className="callout callout-warn">
              <b>Tsunami flag.</b> USGS sets this for large oceanic events so you check the official tsunami warning centres. It is not
              itself a warning.
            </p>
          )}
          {q.alert && (
            <p className={`callout callout-pager-${q.alert}`}>
              <b>PAGER {q.alert}.</b> USGS's estimate of likely fatalities and economic losses
              {q.alert === 'green' ? ' is low.' : q.alert === 'yellow' ? ' calls for a local or regional response.' : ' calls for a national or international response.'}
            </p>
          )}
          {sequence.largerFollower && (
            <button type="button" className="callout callout-info" onClick={() => onSelect(sequence.largerFollower!.id)}>
              <b>This was a foreshock.</b> A larger M{sequence.largerFollower.mag.toFixed(1)} struck nearby{' '}
              {formatRelativeTime(q.time ?? 0, sequence.largerFollower.time ?? 0).replace(' ago', '')} later. View it →
            </button>
          )}
          {sequence.parent && (
            <button type="button" className="callout callout-info" onClick={() => onSelect(sequence.parent!.id)}>
              <b>Likely an aftershock</b> of the M{sequence.parent.mag.toFixed(1)} {sequence.parent.place}. View it →
            </button>
          )}
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>Depth</dt>
          <dd>{q.depthKm.toFixed(1)} km <span className="dim">{DEPTH_TEXT[depthBand(q.depthKm)]}</span></dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{formatCoords(q.lat, q.lon)}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{formatTnt(joulesToTonsTnt(magnitudeToJoules(q.mag)))}</dd>
        </div>
        <div>
          <dt>In this window</dt>
          <dd>#{rank.toLocaleString()} of {catalog.length.toLocaleString()} by size</dd>
        </div>
        {q.felt ? (
          <div>
            <dt>Felt reports</dt>
            <dd>{q.felt.toLocaleString()}{q.cdi ? <span className="dim"> · max {mmiRoman(q.cdi)}</span> : null}</dd>
          </div>
        ) : null}
        {q.mmi ? (
          <div>
            <dt>ShakeMap max</dt>
            <dd>{mmiRoman(q.mmi)} <span className="dim">{mmiShaking(q.mmi)}</span></dd>
          </div>
        ) : null}
      </dl>

      {you && (
        <section className="card you-card">
          <header>
            <h3>At {location!.label}</h3>
          </header>
          <div className="you-row">
            <MmiChip mmi={you.mmi} />
            <p>
              <b>{you.mmi < 1.5 ? 'Not felt' : `${mmiShaking(you.mmi)} shaking`}</b> estimated. The epicentre is {formatKm(you.km)} {you.dir} of
              you.
            </p>
          </div>
        </section>
      )}

      <section className="card">
        <header>
          <h3>Tectonic setting</h3>
          {plate && <span className="hint">PB2002 · {plate.code}</span>}
        </header>
        {plate ? (
          <div className="plate-card" style={{ borderColor: PLATE_COLORS[plate.kind] }}>
            <p className="plate-kind" style={{ color: PLATE_COLORS[plate.kind] }}>{plate.label}</p>
            <p>
              {plate.subducting
                ? `The ${plate.subducting} plate diving beneath the ${plate.overriding} plate`
                : `Boundary between the ${plate.plates[0]} and ${plate.plates[1]} plates`}
              , {plate.distanceKm < 10 ? 'right on the boundary' : `${formatKm(plate.distanceKm)} from the boundary line`}.
            </p>
            {plate.relativeVelocityMmYr > 0 && (
              <p className="dim">
                The plates move about {plate.relativeVelocityMmYr} mm a year relative to each other
                {plate.relativeVelocityMmYr >= 40 ? ', faster than fingernails grow' : ''}.
              </p>
            )}
          </div>
        ) : (
          <p className="plate-card plate-intraplate">
            No plate boundary within 400 km: an <b>intraplate</b> event. These come from stress inside a plate, volcanism, or human
            activity such as fluid injection.
          </p>
        )}
      </section>

      <section className="card">
        <header>
          <h3>Shaking</h3>
          <button type="button" className="chip" aria-pressed={showShaking} onClick={onToggleShaking}>
            {showShaking ? 'On map' : 'Show on map'}
          </button>
        </header>
        <div className="seg seg-sm seg-full" role="group" aria-label="Shaking source">
          <button type="button" aria-pressed={source === 'estimate'} onClick={() => onSource('estimate')}>Estimate</button>
          <button type="button" aria-pressed={source === 'shakemap'} disabled={!observed.data?.shakemap} onClick={() => onSource('shakemap')}
            title={observed.data?.shakemap ? 'USGS ShakeMap contours' : 'No ShakeMap for this event'}>
            ShakeMap
          </button>
          <button type="button" aria-pressed={source === 'dyfi'} disabled={!observed.data?.dyfi} onClick={() => onSource('dyfi')}
            title={observed.data?.dyfi ? 'Reports from people who felt it' : 'No felt reports for this event'}>
            Felt reports
          </button>
        </div>
        {observed.loading && <p className="note">Checking USGS for ShakeMap and felt reports…</p>}
        {observed.error && <p className="note">Couldn't load USGS products ({observed.error}).</p>}

        {source === 'estimate' && (
          <p className="shaking-summary">
            Up to <MmiChip mmi={epicentreMmi} /> {mmiShaking(epicentreMmi).toLowerCase()} near the epicentre.{' '}
            {strongKm > 0 ? `Strong shaking (VI+) out to about ${formatKm(strongKm)}; ` : ''}
            {feltKm > 0 ? `light shaking (IV+) out to about ${formatKm(feltKm)}.` : 'Too small or deep for light shaking (IV) anywhere.'}
          </p>
        )}
        {source === 'shakemap' && observed.data?.shakemap && (
          <p className="shaking-summary">
            USGS ShakeMap peak {observed.data.shakemap.maxMmi ? <MmiChip mmi={observed.data.shakemap.maxMmi} /> : '?'} against this app's estimate of{' '}
            <MmiChip mmi={epicentreMmi} />. ShakeMap blends seismic stations, felt reports and local site conditions, so it is the better
            picture wherever they disagree.
          </p>
        )}
        {source === 'dyfi' && observed.data?.dyfi && (
          <p className="shaking-summary">
            {observed.data.dyfi.responses?.toLocaleString() ?? 'Some'} people reported feeling it, up to{' '}
            {observed.data.dyfi.maxCdi ? <MmiChip mmi={observed.data.dyfi.maxCdi} /> : '?'}. Each square on the map is a 10 km cell coloured by
            the average intensity reported there.
          </p>
        )}

        <ul className="impacts">
          {impacts.map((c) => {
            const reported = source === 'dyfi' ? reportedAt(c.lon, c.lat) : null;
            return (
              <li key={`${c.name}-${c.country}`}>
                <MmiChip mmi={c.mmi} />
                <span className="impact-name">
                  {c.name}
                  <span className="dim">, {c.country}</span>
                </span>
                <span className="impact-meta">
                  {formatKm(c.distanceKm)} · {formatPopulation(c.pop)}
                </span>
                <span className="impact-damage">
                  {c.mmi >= 5 ? `${mmiDamage(c.mmi)} damage` : mmiShaking(c.mmi)} estimated
                  {reported && (
                    <>
                      {' · '}reported <MmiChip mmi={reported.cdi} /> <span className="dim">({reported.responses} reports)</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="note">
          Estimates use Atkinson & Wald (2007). Observed layers come straight from USGS and can be revised for hours after a quake.
          {observed.data?.shakemap?.url && (
            <> <a href={observed.data.shakemap.url} target="_blank" rel="noreferrer">ShakeMap ↗</a></>
          )}
          {observed.data?.dyfi?.url && (
            <> <a href={observed.data.dyfi.url} target="_blank" rel="noreferrer">Did You Feel It? ↗</a></>
          )}
        </p>
      </section>

      <section className="card">
        <header>
          <h3>Aftershocks</h3>
          <span className="hint">zone {formatKm(sequence.zoneKm)}</span>
        </header>
        <p className="seq-observed">
          <b>{sequence.aftershocks.length}</b> later event{sequence.aftershocks.length === 1 ? '' : 's'} in {catalogLabel} within the zone
          {sequence.aftershocks.length > 0 && (
            <>
              , largest{' '}
              <button type="button" className="link" onClick={() => onSelect([...sequence.aftershocks].sort((a, b) => b.mag - a.mag)[0].id)}>
                M{Math.max(...sequence.aftershocks.map((a) => a.mag)).toFixed(1)}
              </button>
            </>
          )}
          .
        </p>
        {forecast ? (
          <>
            <table className="forecast">
              <thead>
                <tr>
                  <th scope="col">Chance of</th>
                  {forecast[0].windows.map((w) => (
                    <th key={w.label} scope="col">{w.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.windows.map((w) => (
                      <td key={w.label} title={`Expected count: ${w.expected.toFixed(w.expected < 1 ? 2 : 0)}`}>
                        <span className="prob-bar"><i style={{ width: `${Math.max(2, w.probability * 100)}%` }} /></span>
                        {formatPercent(w.probability)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              Reasenberg & Jones (1989) generic model: Omori-Utsu decay with Gutenberg-Richter scaling. Illustrative; for official
              forecasts see the USGS event page.
            </p>
          </>
        ) : (
          <p className="note">{recent ? 'Forecasts are shown for M4 and larger.' : 'Forecasts are shown for events from the past year; this sequence has long since decayed.'}</p>
        )}
      </section>

      <footer className="detail-links">
        {q.url && (
          <a href={q.url} target="_blank" rel="noreferrer" className="btn btn-primary">
            USGS event page ↗
          </a>
        )}
        <button type="button" className="btn" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </footer>
    </article>
  );
}
