"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { citiesByCountry } from "@/data/cities";

interface CitySelectProps {
  country: string;
  value: string;
  onChange: (value: string) => void;
}

export default function CitySelect({ country, value, onChange }: CitySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevCountryRef = useRef(country);

  const cities = useMemo(() => citiesByCountry[country] || [], [country]);

  useEffect(() => {
    if (prevCountryRef.current !== country) {
      prevCountryRef.current = country;
      setSearch("");
    }
  }, [country]);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const filteredCities = useMemo(() => {
    if (!search) return cities;
    return cities.filter(c =>
      c.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, cities]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (city: string) => {
    setSearch(city);
    onChange(city);
    setIsOpen(false);
  };

  const displayList = isFocused ? cities : filteredCities;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="label">City / Area</label>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
            onChange(e.target.value);
          }}
          onFocus={(e) => {
            setIsOpen(true);
            setIsFocused(true);
            e.target.select();
          }}
          onBlur={() => setIsFocused(false)}
          placeholder={cities.length > 0 ? "Search or type city name..." : "Select a country first"}
          disabled={cities.length === 0}
          className="input-field pr-10 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <svg
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {isOpen && displayList.length > 0 && (
        <div className="dropdown animate-slide-down">
          {displayList.slice(0, 50).map((city) => (
            <button
              key={city}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(city)}
              className={`dropdown-item ${search === city ? "active" : ""}`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {city}
              </span>
            </button>
          ))}
        </div>
      )}
      {isOpen && search && filteredCities.length === 0 && (
        <div className="dropdown animate-slide-down">
          <div className="px-4 py-3 text-sm text-slate-500 text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            No cities found for &quot;{search}&quot;
            <p className="text-xs text-slate-400 mt-1">Try a different search or type the city name manually</p>
          </div>
        </div>
      )}
    </div>
  );
}
