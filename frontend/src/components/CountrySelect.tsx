"use client";

import { useState, useRef, useEffect, useMemo } from "react";

const countries = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium",
  "Bolivia", "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Cambodia",
  "Cameroon", "Canada", "Chile", "China", "Colombia", "Costa Rica",
  "Croatia", "Cuba", "Czech Republic", "Denmark", "Dominican Republic",
  "Ecuador", "Egypt", "Estonia", "Ethiopia", "Finland", "France",
  "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Honduras",
  "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania",
  "Luxembourg", "Malaysia", "Mexico", "Morocco", "Myanmar", "Nepal",
  "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman", "Pakistan",
  "Palestine", "Panama", "Paraguay", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Senegal",
  "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa",
  "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Taiwan",
  "Tanzania", "Thailand", "Tunisia", "Turkey", "UAE", "Uganda",
  "Ukraine", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Venezuela", "Vietnam", "Yemen", "Zimbabwe"
];

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CountrySelect({ value, onChange }: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "United States");
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) {
      setSearch("United States");
      onChange("United States");
    }
  }, []);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const filteredCountries = useMemo(() => {
    if (!search) return countries;
    return countries.filter(c =>
      c.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (country: string) => {
    setSearch(country);
    onChange(country);
    setIsOpen(false);
  };

  const displayList = isFocused ? countries : filteredCountries;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="label">Country</label>
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
          placeholder="Search country..."
          className="input-field pr-10"
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
          {displayList.slice(0, 100).map((country) => (
            <button
              key={country}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(country)}
              className={`dropdown-item ${search === country ? "active" : ""}`}
            >
              {country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
