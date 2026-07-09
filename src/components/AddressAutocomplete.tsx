'use client';
import { useState, useRef, useEffect } from 'react';

export interface ResolvedAddress {
  formatted: string;
  address_line1: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
}

interface Suggestion {
  formatted: string;
  address_line1: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
}

// Part B.2 (ADDRESS-1) — Geoapify-only autocomplete (proxied through
// /api/geoapify/autocomplete so the API key never reaches the client).
// Manual entry is always available via onManualEntry — required fallback
// when the API is down or the free 3k/day quota is exhausted.
export function AddressAutocomplete({
  initialValue,
  onSelect,
  onManualEntry,
  placeholder = 'Start typing your address…',
}: {
  initialValue?: string;
  onSelect: (address: ResolvedAddress) => void;
  onManualEntry: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(initialValue ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleChange(v: string) {
    setText(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/geoapify/autocomplete?text=' + encodeURIComponent(v.trim()));
        const data = await res.json() as { suggestions: Suggestion[]; unavailable?: boolean };
        setSuggestions(data.suggestions ?? []);
        setUnavailable(!!data.unavailable);
        setOpen((data.suggestions ?? []).length > 0);
      } catch {
        setUnavailable(true);
        setSuggestions([]);
      }
      setLoading(false);
    }, 300);
  }

  function select(s: Suggestion) {
    setText(s.formatted);
    setOpen(false);
    setSuggestions([]);
    onSelect({
      formatted: s.formatted,
      address_line1: s.address_line1,
      suburb: s.suburb,
      state: s.state,
      postcode: s.postcode,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      place_id: s.place_id,
    });
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>…</span>
      )}
      {open && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: '1px solid rgba(45,82,64,0.15)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', listStyle: 'none', padding: 4,
        }}>
          {suggestions.map((s, i) => (
            <li key={s.place_id ?? i}>
              <button
                type="button"
                onClick={() => select(s)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#1a1a16] hover:bg-[#edf3ef] transition-colors"
              >
                {s.formatted}
              </button>
            </li>
          ))}
        </ul>
      )}
      {unavailable && (
        <p className="text-xs text-[rgba(0,0,0,0.45)] mt-1">
          Address lookup isn&apos;t available right now —{' '}
          <button type="button" onClick={onManualEntry} className="underline hover:text-[#2D5240]">enter it manually</button>.
        </p>
      )}
      {!unavailable && (
        <p className="text-xs text-[rgba(0,0,0,0.35)] mt-1">
          Can&apos;t find it? <button type="button" onClick={onManualEntry} className="underline hover:text-[#2D5240]">Enter manually</button>.
        </p>
      )}
    </div>
  );
}
