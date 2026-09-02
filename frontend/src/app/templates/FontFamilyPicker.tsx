"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface FontFamilyPickerProps {
  value: string;
  onChange: (font: string) => void;
}

interface FontGroup {
  label: string;
  fonts: string[];
}

const FONT_GROUPS: FontGroup[] = [
  {
    label: "Standard & Email Safe",
    fonts: ["Inter", "Arial", "Helvetica", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana", "Tahoma"],
  },
  {
    label: "Modern Display & Serif",
    fonts: ["Playfair Display", "Merriweather", "Lora", "PT Serif", "EB Garamond"],
  },
  {
    label: "Monospace / Code",
    fonts: ["JetBrains Mono", "Courier New", "Fira Code", "Space Mono"],
  },
];

const ALL_FONTS = FONT_GROUPS.flatMap((g) => g.fonts);

export default function FontFamilyPicker({ value, onChange }: FontFamilyPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((prev) => !prev);
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const q = search.toLowerCase();
  const filteredGroups = q
    ? [{ label: "Search results", fonts: ALL_FONTS.filter((f) => f.toLowerCase().includes(q)) }]
    : FONT_GROUPS;

  const getFontFallback = (font: string): string => {
    if (["JetBrains Mono", "Courier New", "Fira Code", "Space Mono"].includes(font)) {
      return "monospace";
    }
    if (["Georgia", "Times New Roman", "Playfair Display", "Merriweather", "Lora", "PT Serif", "EB Garamond"].includes(font)) {
      return "Georgia, serif";
    }
    return "system-ui, sans-serif";
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left
                    border rounded-md text-[11px] transition-all duration-150
                    ${open ? "border-indigo-500 ring-2 ring-indigo-100 bg-white" : "border-gray-300 bg-white hover:border-gray-400"}`}
      >
        <span
          style={{ fontFamily: `'${value || "Inter"}', ${getFontFallback(value || "Inter")}`, fontSize: "13px" }}
          className="truncate text-gray-800"
        >
          {value || "Inter"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-1 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden animate-slide-down"
          style={{ maxHeight: "280px" }}
        >
          {/* Search bar */}
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="w-full px-2.5 py-1 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
            />
          </div>

          {/* Font List */}
          <div className="overflow-y-auto flex-1">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/80 border-b border-gray-100 sticky top-0">
                  {group.label}
                </div>
                {group.fonts.map((font) => {
                  const isSelected = (value || "Inter") === font;
                  return (
                    <button
                      key={font}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onChange(font);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                        isSelected ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <span style={{ fontFamily: `'${font}', ${getFontFallback(font)}` }} className="truncate">
                        {font}
                      </span>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredGroups[0]?.fonts.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-400">No matching fonts found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
