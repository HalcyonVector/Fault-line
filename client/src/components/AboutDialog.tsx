import { useEffect, useRef } from 'react';

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="about" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="about-title">
      <div className="about-inner">
        <header>
          <h2 id="about-title">About Fault Line</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <p>
          Every earthquake the USGS has located in the chosen window, on a map of the plate boundaries that cause most of them. Pick an
          event to see where it sits tectonically, how strongly nearby cities probably shook, and how likely aftershocks are.
        </p>
        <h3>Reading the map</h3>
        <ul>
          <li><b>Circles</b> are events, sized by magnitude and colored by depth (or age). Fresh ones pulse.</li>
          <li><b>Colored lines</b> are plate boundaries from Peter Bird's PB2002 model: orange subduction zones, amber collisions, violet transforms, teal ridges and rifts.</li>
          <li><b>Rings</b> around a selected quake are estimated shaking contours (intensity IV to VIII); the dashed ring is its aftershock zone. Switch to <b>ShakeMap</b> or <b>Felt reports</b> to see what USGS actually measured.</li>
          <li><b>3D globe</b> places every event at its depth (exaggerated 3×), so deep quakes trace the slabs of subducting plates.</li>
          <li><b>Archive</b> searches the USGS catalog back to 1900, by date, magnitude and distance from any city.</li>
        </ul>
        <h3>Keyboard</h3>
        <dl className="keys">
          <div><dt><kbd>/</kbd></dt><dd>Search places</dd></div>
          <div><dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>Next / previous event in the list</dd></div>
          <div><dt><kbd>Space</kbd></dt><dd>Replay the window</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>Close details or cancel</dd></div>
        </dl>
        <h3>Not a warning system</h3>
        <p className="dim">
          Fault Line is a hobby project for exploring public data. Intensities and aftershock odds come from simplified published models
          and are illustrative. For anything that matters, use your national seismic agency, tsunami warning centres and the USGS event
          pages linked from each quake.
        </p>
        <p className="dim">
          Data: USGS Earthquake Hazards Program · PB2002 plate boundaries (Bird 2003, via Hugo Ahlenius, ODC-BY) · Natural Earth.
        </p>
      </div>
    </dialog>
  );
}
