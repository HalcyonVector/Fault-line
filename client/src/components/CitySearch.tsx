import { useId, useMemo, useState } from 'react';
import { searchCities, type City } from '../lib/cities';
import { formatPopulation } from '../lib/format';

/** A small accessible combobox over the bundled city list. */
export function CitySearch({ onPick, placeholder = 'Search a city', autoFocus }: { onPick: (c: City) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchCities(q), [q]);

  const pick = (c: City) => {
    onPick(c);
    setQ('');
  };

  return (
    <div className="city-search">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
          else if (e.key === 'Enter') pick(results[active]);
          else return;
          e.preventDefault();
        }}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
        aria-label={placeholder}
      />
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="city-results">
          {results.map((c, i) => (
            <li key={`${c.name}-${c.country}-${c.lat}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(c)}>
                <span>
                  {c.name}
                  <span className="dim">, {c.country}</span>
                </span>
                <span className="dim mono">{formatPopulation(c.pop)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
