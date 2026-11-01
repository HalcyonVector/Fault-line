import { useMemo, useState } from 'react';
import { MagBadge } from './MagBadge';
import { formatRelativeTime, formatUtc, formatLocal, formatKm, formatPercent, formatPopulation, formatCoords } from '../lib/format';
import { haversineKm, bearingDeg, compassPoint } from '../lib/geo';
import type { CityImpact } from '../lib/cities';
import { estimateMmi, mmiRoman, mmiShaking, mmiDamage, radiusForMmi } from '../seismology/intensity';
import { forecastTable, summarizeSequence } from '../seismology/aftershocks';
import { magnitudeToJoules, joulesToTonsTnt, formatTnt, depthBand } from '../seismology/stats';
import { mmiColor, PLATE_COLORS } from '../map/colors';
import type { Quake, UserLocation } from '../types';

interface Props {
  quake: Quake;
  catalog: Quake[];
  nowMs: number;
  location: UserLocation | null;
  impacts: CityImpact[];
  showShaking: boolean;
  onToggleShaking: () => void;
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

export function QuakeDetail({ quake: q, catalog, nowMs, location, impacts, showShaking, onToggleShaking, onSelect, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const sequence = useMemo(() => summarizeSequence(q, catalog), [q, catalog]);
  const forecast = useMemo(() => (q.time && q.mag >= 4 ? forecastTable(q.mag, q.time, nowMs) : null), [q, nowMs]);
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
          <h3>Estimated shaking</h3>
          <button type="button" className="chip" aria-pressed={showShaking} onClick={onToggleShaking}>
            {showShaking ? 'On map' : 'Show on map'}
          </button>
        </header>
        <p className="shaking-summary">
          Up to <MmiChip mmi={epicentreMmi} /> {mmiShaking(epicentreMmi).toLowerCase()} near the epicentre.{' '}
          {strongKm > 0 ? `Strong shaking (VI+) out to about ${formatKm(strongKm)}; ` : ''}
          {feltKm > 0 ? `light shaking (IV+) out to about ${formatKm(feltKm)}.` : 'Too small or deep for light shaking (IV) anywhere.'}
        </p>
        <ul className="impacts">
          {impacts.map((c) => (
            <li key={`${c.name}-${c.country}`}>
              <MmiChip mmi={c.mmi} />
              <span className="impact-name">
                {c.name}
                <span className="dim">, {c.country}</span>
              </span>
              <span className="impact-meta">
                {formatKm(c.distanceKm)} · {formatPopulation(c.pop)}
              </span>
              <span className="impact-damage">{c.mmi >= 5 ? `${mmiDamage(c.mmi)} damage` : mmiShaking(c.mmi)}</span>
            </li>
          ))}
        </ul>
        <p className="note">Atkinson & Wald (2007) intensity estimate, not a ShakeMap. Real shaking depends on local soil and rupture details.</p>
      </section>

      <section className="card">
        <header>
          <h3>Aftershocks</h3>
          <span className="hint">zone {formatKm(sequence.zoneKm)}</span>
        </header>
        <p className="seq-observed">
          <b>{sequence.aftershocks.length}</b> later event{sequence.aftershocks.length === 1 ? '' : 's'} in this feed within the zone
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
          <p className="note">Forecasts are shown for M4 and larger.</p>
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
