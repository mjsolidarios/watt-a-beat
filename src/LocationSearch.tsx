import { useEffect, useRef, useState } from "react";
import {
  MagnifyingGlass,
  ArrowRight,
  MapPin,
  CircleNotch,
  X,
} from "@phosphor-icons/react";
import type { LocationResult } from "./types";
export function LocationSearch({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (location: LocationResult) => void;
}) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [results, setResults] = useState<LocationResult[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false),
    [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      controller.current?.abort();
    };
  }, []);
  const choose = (location: LocationResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
    input.current?.blur();
    onSelect(location);
  };
  const search = async () => {
    if (query.trim().length < 2) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setResults([]);
    setActive(-1);
    setOpen(true);
    setSearched(true);
    try {
      const response = await fetch(
        "/api/locations?q=" + encodeURIComponent(query.trim()),
        { signal: abort.signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Location search failed.");
      if (!abort.signal.aborted) setResults(data.results);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="location-search" ref={root}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && results[active]) choose(results[active]);
          else void search();
        }}
      >
        <MagnifyingGlass size={19} />
        <input
          ref={input}
          role="combobox"
          aria-label="Search Philippine locations"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="location-results"
          aria-activedescendant={active >= 0 ? `location-${active}` : undefined}
          placeholder={current || "Search the Philippines"}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            controller.current?.abort();
            setBusy(false);
            setQuery(e.target.value);
            setResults([]);
            setSearched(false);
            setError("");
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              input.current?.blur();
            }
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              setActive((i) => (i + 1) % results.length);
            }
            if (e.key === "ArrowUp" && results.length) {
              e.preventDefault();
              setActive((i) => (i - 1 + results.length) % results.length);
            }
          }}
        />
        <button
          type="submit"
          aria-label="Search locations"
          disabled={busy || query.trim().length < 2}
        >
          {busy ? (
            <CircleNotch className="spin" size={17} />
          ) : (
            <ArrowRight size={17} />
          )}
        </button>
      </form>
      {open && (
        <div className="location-results">
          <div className="search-scope">
            Philippines only{" "}
            <button
              aria-label="Close location search"
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </button>
          </div>
          {!searched && (
            <p>Search a city, town, or landmark. Press Enter to find it.</p>
          )}
          {busy && <p role="status">Finding places…</p>}
          {error && <p role="alert">{error}</p>}
          {searched && !busy && !error && results.length === 0 && (
            <p role="status">
              No Philippine places found. Try a more specific name.
            </p>
          )}
          <div
            id="location-results"
            role="listbox"
            aria-label="Philippine places"
          >
            {results.map((result, index) => (
              <button
                key={result.token}
                id={`location-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                <MapPin size={17} />
                <span>
                  <strong>{result.name}</strong>
                  <small>{result.description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
