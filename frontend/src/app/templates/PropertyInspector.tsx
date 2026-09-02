"use client";

import React, { useState } from "react";
import { EmailBlock, EmailSettings, ColumnData, getColumnsList } from "./types";
import QuillEditor from "./QuillEditor";
import FontFamilyPicker from "./FontFamilyPicker";
import ImageUploadButton from "./ImageUploadButton";

interface PropertyInspectorProps {
  selectedBlock: EmailBlock | null;
  settings: EmailSettings;
  onUpdateBlock: (updated: EmailBlock) => void;
  onUpdateSettings: (updated: EmailSettings) => void;
  onDeselect: () => void;
}

const MERGE_TAGS = [
  { tag: "{{name}}", label: "Contact Name" },
  { tag: "{{company}}", label: "Company" },
  { tag: "{{city}}", label: "City" },
  { tag: "{{website}}", label: "Website" },
  { tag: "{{email}}", label: "Email" },
  { tag: "{{phone}}", label: "Phone" },
  { tag: "{{unsubscribe_link}}", label: "Unsubscribe URL" },
];

export default function PropertyInspector({
  selectedBlock,
  settings,
  onUpdateBlock,
  onUpdateSettings,
  onDeselect,
}: PropertyInspectorProps) {
  const [activeTab, setActiveTab] = useState<"block" | "body">("block");
  const [editRawHtml, setEditRawHtml] = useState(false);
  const [activeColIndex, setActiveColIndex] = useState<number>(0);

  // If no block is selected, default to body tab
  const currentTab = selectedBlock ? activeTab : "body";

  const handleInsertTag = (tag: string, field: "text" | "content") => {
    if (!selectedBlock) return;
    if (selectedBlock.type === "heading" && field === "text") {
      onUpdateBlock({ ...selectedBlock, text: selectedBlock.text + " " + tag });
    } else if (selectedBlock.type === "text" && field === "content") {
      onUpdateBlock({ ...selectedBlock, content: selectedBlock.content + " " + tag });
    }
  };

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden select-none">
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 bg-slate-50/80">
        <button
          onClick={() => setActiveTab("block")}
          disabled={!selectedBlock}
          className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
            currentTab === "block"
              ? "border-blue-600 text-blue-600 bg-white"
              : selectedBlock
              ? "border-transparent text-slate-500 hover:text-slate-800"
              : "border-transparent text-slate-300 cursor-not-allowed"
          }`}
        >
          <span>✏️</span>
          <span>Block Style</span>
        </button>
        <button
          onClick={() => setActiveTab("body")}
          className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
            currentTab === "body"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>🎨</span>
          <span>Email Canvas</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {currentTab === "block" && selectedBlock ? (
          <div>
            {/* Header info bar */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {selectedBlock.type}
                </span>
                <span className="text-xs text-slate-400">Settings</span>
              </div>
              <button
                onClick={onDeselect}
                className="text-xs text-slate-400 hover:text-slate-600"
                title="Deselect block"
              >
                ✕ Close
              </button>
            </div>

            {/* BLOCK SPECIFIC CONTROLS */}
            {selectedBlock.type === "header" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={selectedBlock.brandName}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, brandName: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="Acme Growth Partners"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
                  <input
                    type="text"
                    value={selectedBlock.tagline}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, tagline: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="B2B Lead Acquisition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Brand Logo</label>
                  <ImageUploadButton
                    currentImageUrl={selectedBlock.logoUrl}
                    onUploadSuccess={(url) => onUpdateBlock({ ...selectedBlock, logoUrl: url })}
                    buttonText="Upload Brand Logo"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Logo Height</span>
                    <span>{selectedBlock.logoHeight}px</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={selectedBlock.logoHeight}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, logoHeight: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1.5 text-xs font-medium rounded border ${
                          selectedBlock.align === a
                            ? "bg-blue-50 border-blue-500 text-blue-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "heading" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Heading Text</label>
                  <textarea
                    rows={3}
                    value={selectedBlock.text}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, text: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  {/* Merge Tags Insertion */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">Insert Tag:</span>
                    {MERGE_TAGS.slice(0, 3).map((m) => (
                      <button
                        key={m.tag}
                        onClick={() => handleInsertTag(m.tag, "text")}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded transition-colors"
                      >
                        {m.tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tag Level</label>
                    <select
                      value={selectedBlock.level}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, level: e.target.value as any })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none"
                    >
                      <option value="h1">H1 (Large)</option>
                      <option value="h2">H2 (Medium)</option>
                      <option value="h3">H3 (Small)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Font Size</label>
                    <input
                      type="number"
                      min="14"
                      max="48"
                      value={selectedBlock.fontSize}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, fontSize: Number(e.target.value) })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedBlock.color}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, color: e.target.value })}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedBlock.color}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, color: e.target.value })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Font Weight</label>
                    <select
                      value={selectedBlock.fontWeight}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, fontWeight: e.target.value as any })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none"
                    >
                      <option value="normal">Normal</option>
                      <option value="600">Semi Bold</option>
                      <option value="bold">Bold</option>
                      <option value="800">Extra Bold</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1.5 text-xs font-medium rounded border ${
                          selectedBlock.align === a
                            ? "bg-blue-50 border-blue-500 text-blue-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "text" && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-medium text-gray-700">Text Content</label>
                    <button
                      type="button"
                      onClick={() => setEditRawHtml(!editRawHtml)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-medium cursor-pointer"
                    >
                      {editRawHtml ? "Use Visual Editor" : "Edit Raw HTML"}
                    </button>
                  </div>

                  {!editRawHtml ? (
                    <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-2xs">
                      <QuillEditor
                        value={selectedBlock.content}
                        onChange={(val) => onUpdateBlock({ ...selectedBlock, content: val })}
                      />
                    </div>
                  ) : (
                    <textarea
                      rows={8}
                      value={selectedBlock.content}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, content: e.target.value })}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-[11px] font-mono outline-none bg-white"
                      placeholder="<p>Text content goes here...</p>"
                    />
                  )}

                  {/* Merge Tags Insertion */}
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">Insert Tag:</span>
                    {MERGE_TAGS.map((m) => (
                      <button
                        key={m.tag}
                        type="button"
                        onClick={() => handleInsertTag(m.tag, "content")}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded transition-colors"
                      >
                        {m.tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family Selection */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Font Family</label>
                  <FontFamilyPicker
                    value={settings.defaultFont.split(",")[0].replace(/['"]/g, "").trim() || "Inter"}
                    onChange={(font) => onUpdateSettings({ ...settings, defaultFont: `${font}, Arial, sans-serif` })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Font Size</label>
                    <input
                      type="number"
                      min="12"
                      max="36"
                      value={selectedBlock.fontSize}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, fontSize: Number(e.target.value) })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Line Height</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.2"
                      max="2.4"
                      value={selectedBlock.lineHeight}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, lineHeight: Number(e.target.value) })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Text Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedBlock.color}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, color: e.target.value })}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedBlock.color}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, color: e.target.value })}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1.5 text-xs font-medium rounded border ${
                          selectedBlock.align === a
                            ? "bg-blue-50 border-blue-500 text-blue-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "button" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Button Label</label>
                  <input
                    type="text"
                    value={selectedBlock.text}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, text: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destination URL</label>
                  <input
                    type="text"
                    value={selectedBlock.url}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, url: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://calendly.com/your-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Button Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedBlock.backgroundColor}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedBlock.backgroundColor}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedBlock.textColor}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, textColor: e.target.value })}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedBlock.textColor}
                        onChange={(e) => onUpdateBlock({ ...selectedBlock, textColor: e.target.value })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Radius</span>
                      <span>{selectedBlock.borderRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={selectedBlock.borderRadius}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, borderRadius: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Width</label>
                    <button
                      onClick={() => onUpdateBlock({ ...selectedBlock, fullWidth: !selectedBlock.fullWidth })}
                      className={`w-full py-1.5 text-xs font-medium rounded border ${
                        selectedBlock.fullWidth
                          ? "bg-blue-50 border-blue-500 text-blue-700"
                          : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      {selectedBlock.fullWidth ? "Yes (100%)" : "Auto (Inline)"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1.5 text-xs font-medium rounded border ${
                          selectedBlock.align === a
                            ? "bg-blue-50 border-blue-500 text-blue-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "image" && (
              <div className="space-y-4">
                {/* Image Preview Box */}
                {selectedBlock.src ? (
                  <div className="relative w-full h-44 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center p-2 shadow-2xs">
                    <img
                      src={selectedBlock.src}
                      alt={selectedBlock.alt || "Preview"}
                      className="max-h-full max-w-full object-contain rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-32 border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <div className="text-2xl mb-1">🖼️</div>
                      <p className="text-[11px] font-medium">No image selected</p>
                    </div>
                  </div>
                )}

                {/* Upload & Gallery Manager */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Image Source</label>
                  <ImageUploadButton
                    currentImageUrl={selectedBlock.src}
                    onUploadSuccess={(url) => onUpdateBlock({ ...selectedBlock, src: url })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Alt Text</label>
                  <input
                    type="text"
                    value={selectedBlock.alt}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, alt: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="Describe image for screen readers"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Click Link URL (Optional)</label>
                  <input
                    type="text"
                    value={selectedBlock.linkUrl || ""}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, linkUrl: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-medium text-gray-700 mb-1">
                    <span>Width ({selectedBlock.maxWidth || 100}%)</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={selectedBlock.maxWidth || 100}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, maxWidth: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-medium text-gray-700 mb-1">
                    <span>Corner Roundness ({selectedBlock.borderRadius || 0}px)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="32"
                    value={selectedBlock.borderRadius || 0}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, borderRadius: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "columns" && (() => {
              const cols = getColumnsList(selectedBlock);
              const safeActiveIdx = Math.min(activeColIndex, Math.max(0, cols.length - 1));

              const handleSetColumnCount = (targetCount: number) => {
                let newCols = [...cols];
                if (targetCount > newCols.length) {
                  while (newCols.length < targetCount) {
                    const num = newCols.length + 1;
                    newCols.push({
                      title: `Feature ${num}`,
                      content: `Description details for column ${num}.`,
                      buttonText: "Learn More",
                      buttonUrl: "https://example.com",
                    });
                  }
                } else if (targetCount < newCols.length && targetCount >= 1) {
                  newCols = newCols.slice(0, targetCount);
                }
                onUpdateBlock({
                  ...selectedBlock,
                  columns: newCols,
                  col1: newCols[0],
                  col2: newCols[1] || newCols[0],
                });
                if (safeActiveIdx >= targetCount) {
                  setActiveColIndex(targetCount - 1);
                }
              };

              const handleAddColumn = () => {
                const newCols = [
                  ...cols,
                  {
                    title: `Column ${cols.length + 1}`,
                    content: `New column description details.`,
                    buttonText: "Read More",
                    buttonUrl: "https://example.com",
                  },
                ];
                onUpdateBlock({
                  ...selectedBlock,
                  columns: newCols,
                  col1: newCols[0],
                  col2: newCols[1] || newCols[0],
                });
                setActiveColIndex(newCols.length - 1);
              };

              const handleDeleteColumn = (indexToDelete: number) => {
                if (cols.length <= 1) return;
                const newCols = cols.filter((_, idx) => idx !== indexToDelete);
                onUpdateBlock({
                  ...selectedBlock,
                  columns: newCols,
                  col1: newCols[0],
                  col2: newCols[1] || newCols[0],
                });
                setActiveColIndex(Math.max(0, safeActiveIdx >= indexToDelete ? safeActiveIdx - 1 : safeActiveIdx));
              };

              const handleUpdateCurrentCol = (updatedFields: Partial<ColumnData>) => {
                const newCols = [...cols];
                newCols[safeActiveIdx] = { ...newCols[safeActiveIdx], ...updatedFields };
                onUpdateBlock({
                  ...selectedBlock,
                  columns: newCols,
                  col1: newCols[0],
                  col2: newCols[1] || newCols[0],
                });
              };

              const currentCol = cols[safeActiveIdx] || cols[0];

              return (
                <div className="space-y-4">
                  {/* Layout Dropdown Select */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-medium text-gray-700">Layout</label>
                      <button
                        type="button"
                        onClick={handleAddColumn}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>+</span> Add Column
                      </button>
                    </div>

                    <div className="relative">
                      <select
                        value={cols.length}
                        onChange={(e) => handleSetColumnCount(Number(e.target.value))}
                        className="w-full text-xs py-2 px-3 bg-white border border-gray-300 rounded-lg shadow-2xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 appearance-none cursor-pointer pr-8"
                      >
                        <option value={1}>1 Column (Full Width - 100%)</option>
                        <option value={2}>2 Columns (50% / 50%)</option>
                        <option value={3}>3 Columns (33.3% / 33.3% / 33.3%)</option>
                        <option value={4}>4 Columns (25% / 25% / 25% / 25%)</option>
                        <option value={5}>5 Columns (20% Each)</option>
                        <option value={6}>6 Columns (16.6% Each)</option>
                        {cols.length > 6 && (
                          <option value={cols.length}>{cols.length} Columns (Custom)</option>
                        )}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Column Tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-100">
                    {cols.map((_, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t-lg text-xs font-semibold cursor-pointer border-t border-x transition-colors ${
                          safeActiveIdx === idx
                            ? "bg-slate-50 border-slate-200 text-indigo-700 border-b-2 border-b-indigo-600"
                            : "bg-white border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => setActiveColIndex(idx)}
                      >
                        <span>Col {idx + 1}</span>
                        {cols.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteColumn(idx);
                            }}
                            className="text-slate-400 hover:text-red-500 rounded p-0.5"
                            title="Remove this column"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Active Column Content Form */}
                  <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Editing Column {safeActiveIdx + 1}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Column Image / Icon (Optional)</label>
                      <ImageUploadButton
                        currentImageUrl={currentCol.imageSrc}
                        onUploadSuccess={(url) => handleUpdateCurrentCol({ imageSrc: url })}
                        buttonText="Upload Column Image"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Title</label>
                      <input
                        type="text"
                        value={currentCol.title || ""}
                        onChange={(e) => handleUpdateCurrentCol({ title: e.target.value })}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-400"
                        placeholder="e.g. ⚡ Real-time Analytics"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Description / Content</label>
                      <textarea
                        rows={3}
                        value={currentCol.content || ""}
                        onChange={(e) => handleUpdateCurrentCol({ content: e.target.value })}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-400"
                        placeholder="Column description text..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Button Text</label>
                        <input
                          type="text"
                          value={currentCol.buttonText || ""}
                          onChange={(e) => handleUpdateCurrentCol({ buttonText: e.target.value })}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-400"
                          placeholder="Learn More"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Button URL</label>
                        <input
                          type="text"
                          value={currentCol.buttonUrl || ""}
                          onChange={(e) => handleUpdateCurrentCol({ buttonUrl: e.target.value })}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-400"
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Block Container Styling */}
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Grid Container Style
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Background</label>
                        <input
                          type="color"
                          value={selectedBlock.backgroundColor || "#f8fafc"}
                          onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                          className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Column Gap ({selectedBlock.gap || 16}px)</label>
                        <input
                          type="range"
                          min="4"
                          max="32"
                          value={selectedBlock.gap || 16}
                          onChange={(e) => onUpdateBlock({ ...selectedBlock, gap: Number(e.target.value) })}
                          className="w-full mt-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Corner Radius ({selectedBlock.borderRadius || 8}px)</label>
                        <input
                          type="range"
                          min="0"
                          max="24"
                          value={selectedBlock.borderRadius || 8}
                          onChange={(e) => onUpdateBlock({ ...selectedBlock, borderRadius: Number(e.target.value) })}
                          className="w-full mt-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">Padding ({selectedBlock.paddingY || 14}px)</label>
                        <input
                          type="range"
                          min="4"
                          max="40"
                          value={selectedBlock.paddingY || 14}
                          onChange={(e) => onUpdateBlock({ ...selectedBlock, paddingY: Number(e.target.value) })}
                          className="w-full mt-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedBlock.type === "callout" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Badge Text (Optional)</label>
                  <input
                    type="text"
                    value={selectedBlock.badge || ""}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, badge: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="SPECIAL OFFER"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={selectedBlock.title}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, title: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-medium text-gray-700">Content (Rich Text)</label>
                    <button
                      type="button"
                      onClick={() => setEditRawHtml(!editRawHtml)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-medium cursor-pointer"
                    >
                      {editRawHtml ? "Use Visual Editor" : "Edit Raw HTML"}
                    </button>
                  </div>
                  {!editRawHtml ? (
                    <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-2xs">
                      <QuillEditor
                        value={selectedBlock.content}
                        onChange={(val) => onUpdateBlock({ ...selectedBlock, content: val })}
                      />
                    </div>
                  ) : (
                    <textarea
                      rows={5}
                      value={selectedBlock.content}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, content: e.target.value })}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 text-[11px] font-mono outline-none bg-white"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Card Background</label>
                    <input
                      type="color"
                      value={selectedBlock.backgroundColor}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                      className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Border Accent</label>
                    <input
                      type="color"
                      value={selectedBlock.borderColor}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, borderColor: e.target.value })}
                      className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "divider" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Line Style</label>
                  <select
                    value={selectedBlock.style}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, style: e.target.value as any })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Line Color</label>
                  <input
                    type="color"
                    value={selectedBlock.color}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, color: e.target.value })}
                    className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Width</span>
                    <span>{selectedBlock.width}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={selectedBlock.width}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, width: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "spacer" && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Vertical Height</span>
                    <span>{selectedBlock.height}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={selectedBlock.height}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, height: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "footer" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={selectedBlock.companyName}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, companyName: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
                  <input
                    type="text"
                    value={selectedBlock.address}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, address: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unsubscribe Notice</label>
                  <input
                    type="text"
                    value={selectedBlock.unsubscribeText}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, unsubscribeText: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "video" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Video Link URL</label>
                  <input
                    type="text"
                    value={selectedBlock.videoUrl}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, videoUrl: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Video Thumbnail Image</label>
                  <ImageUploadButton
                    currentImageUrl={selectedBlock.thumbnailUrl}
                    onUploadSuccess={(url) => onUpdateBlock({ ...selectedBlock, thumbnailUrl: url })}
                    buttonText="Upload Video Thumbnail"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Video Title / Caption (Optional)</label>
                  <input
                    type="text"
                    value={selectedBlock.title || ""}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, title: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="e.g. Watch Product Tour"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Play Button Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedBlock.playButtonColor || "#ef4444"}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, playButtonColor: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedBlock.playButtonColor || "#ef4444"}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, playButtonColor: e.target.value })}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-medium text-gray-700 mb-1">
                    <span>Corner Roundness</span>
                    <span>{selectedBlock.borderRadius || 10}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={selectedBlock.borderRadius || 10}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, borderRadius: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "html" && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-medium text-gray-700">Custom HTML / Inline CSS</label>
                    <span className="text-[10px] text-slate-400 font-mono">HTML5 / Table</span>
                  </div>
                  <textarea
                    rows={12}
                    value={selectedBlock.htmlContent}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, htmlContent: e.target.value })}
                    className="w-full p-2.5 text-xs font-mono border border-slate-200 rounded-lg outline-none bg-slate-900 text-emerald-400 focus:ring-1 focus:ring-indigo-500"
                    placeholder="<div>Custom HTML here...</div>"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tip: Use email-safe tables and inline CSS styling for maximum client compatibility.
                  </p>
                </div>
              </div>
            )}

            {selectedBlock.type === "testimonial" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Star Rating (1–5 Stars)</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, rating: star })}
                        className={`text-2xl cursor-pointer transition-transform hover:scale-110 ${
                          star <= (selectedBlock.rating || 5) ? "text-amber-400" : "text-slate-200"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Review Quote</label>
                  <textarea
                    rows={3}
                    value={selectedBlock.quote}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, quote: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="Customer quote or testimonial..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Author Name</label>
                  <input
                    type="text"
                    value={selectedBlock.authorName}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, authorName: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="e.g. Alex Morgan"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Author Title / Company</label>
                  <input
                    type="text"
                    value={selectedBlock.authorTitle}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, authorTitle: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="e.g. CTO, Acme Corp"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Avatar Photo</label>
                  <ImageUploadButton
                    currentImageUrl={selectedBlock.avatarUrl}
                    onUploadSuccess={(url) => onUpdateBlock({ ...selectedBlock, avatarUrl: url })}
                    buttonText="Upload Author Avatar"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["left", "center"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1.5 text-xs font-semibold rounded-lg border capitalize cursor-pointer ${
                          selectedBlock.align === a
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Card Background Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedBlock.backgroundColor || "#f8fafc"}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedBlock.backgroundColor || "#f8fafc"}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "product" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">Product Image</label>
                  <ImageUploadButton
                    currentImageUrl={selectedBlock.imageUrl}
                    onUploadSuccess={(url) => onUpdateBlock({ ...selectedBlock, imageUrl: url })}
                    buttonText="Upload Product Image"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Badge Text (Optional)</label>
                  <input
                    type="text"
                    value={selectedBlock.badge || ""}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, badge: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="e.g. 50% OFF, FEATURED, NEW"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Product Title</label>
                  <input
                    type="text"
                    value={selectedBlock.title}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, title: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="e.g. Premium Growth Plan"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={selectedBlock.description}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, description: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                    placeholder="Product features and key advantages..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Price</label>
                    <input
                      type="text"
                      value={selectedBlock.price}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, price: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none font-bold"
                      placeholder="e.g. $49/mo"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Old Price (Strike)</label>
                    <input
                      type="text"
                      value={selectedBlock.originalPrice || ""}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, originalPrice: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none line-through text-slate-400"
                      placeholder="e.g. $99/mo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Button Text</label>
                    <input
                      type="text"
                      value={selectedBlock.buttonText}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, buttonText: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none font-semibold"
                      placeholder="e.g. Buy Now"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Button URL</label>
                    <input
                      type="text"
                      value={selectedBlock.buttonUrl}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, buttonUrl: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Card Layout</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["vertical", "horizontal"] as const).map((lay) => (
                      <button
                        key={lay}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, layout: lay })}
                        className={`py-1.5 text-xs font-semibold rounded-lg border capitalize cursor-pointer ${
                          (selectedBlock.layout || "vertical") === lay
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {lay}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedBlock.type === "countdown" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Urgency Headline</label>
                  <input
                    type="text"
                    value={selectedBlock.headline}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, headline: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none font-semibold"
                    placeholder="e.g. ⚡ Flash Deal Ends In:"
                  />
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5 text-center">Days</label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={selectedBlock.days || 0}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, days: Number(e.target.value) })}
                      className="w-full text-center text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5 text-center">Hours</label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={selectedBlock.hours || 0}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, hours: Number(e.target.value) })}
                      className="w-full text-center text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5 text-center">Mins</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedBlock.minutes || 0}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, minutes: Number(e.target.value) })}
                      className="w-full text-center text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5 text-center">Secs</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedBlock.seconds || 0}
                      onChange={(e) => onUpdateBlock({ ...selectedBlock, seconds: Number(e.target.value) })}
                      className="w-full text-center text-xs p-1.5 border border-slate-200 rounded-lg outline-none font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Theme Background</label>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[
                      { bg: "#0f172a", label: "Dark" },
                      { bg: "#4f46e5", label: "Indigo" },
                      { bg: "#dc2626", label: "Red" },
                      { bg: "#059669", label: "Green" },
                    ].map((theme) => (
                      <button
                        key={theme.bg}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, backgroundColor: theme.bg })}
                        className="p-2 rounded-lg text-white font-bold text-[10px] flex items-center justify-center cursor-pointer shadow-2xs"
                        style={{ backgroundColor: theme.bg }}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={selectedBlock.backgroundColor || "#0f172a"}
                    onChange={(e) => onUpdateBlock({ ...selectedBlock, backgroundColor: e.target.value })}
                    className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {selectedBlock.type === "menu" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-gray-700">Navigation Links</label>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...(selectedBlock.items || [])];
                      updated.push({ label: `Link ${updated.length + 1}`, url: "https://example.com" });
                      onUpdateBlock({ ...selectedBlock, items: updated });
                    }}
                    className="px-2 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 cursor-pointer"
                  >
                    + Add Link
                  </button>
                </div>

                <div className="space-y-2">
                  {(selectedBlock.items || []).map((item, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Link #{idx + 1}</span>
                        {selectedBlock.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = selectedBlock.items.filter((_, i) => i !== idx);
                              onUpdateBlock({ ...selectedBlock, items: updated });
                            }}
                            className="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const updated = [...selectedBlock.items];
                            updated[idx].label = e.target.value;
                            onUpdateBlock({ ...selectedBlock, items: updated });
                          }}
                          placeholder="Label"
                          className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded outline-none"
                        />
                        <input
                          type="text"
                          value={item.url}
                          onChange={(e) => {
                            const updated = [...selectedBlock.items];
                            updated[idx].url = e.target.value;
                            onUpdateBlock({ ...selectedBlock, items: updated });
                          }}
                          placeholder="URL"
                          className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Separator</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["•", "|", "none"] as const).map((sep) => (
                      <button
                        key={sep}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, separator: sep })}
                        className={`py-1 text-xs font-semibold rounded-md border cursor-pointer ${
                          selectedBlock.separator === sep
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {sep === "none" ? "None" : sep}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">Alignment</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => onUpdateBlock({ ...selectedBlock, align: a })}
                        className={`py-1 text-xs font-semibold rounded-md border capitalize cursor-pointer ${
                          selectedBlock.align === a
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* GLOBAL EMAIL CANVAS SETTINGS */
          <div className="space-y-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Global Styles</div>
            </div>

            {/* Mailchimp Preheader / Preview Text */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <span>✉️</span>
                  <span>Preview Text (Preheader)</span>
                </label>
                <span className="text-[10px] text-indigo-500 font-semibold">Mailchimp Standard</span>
              </div>
              <textarea
                rows={2}
                value={settings.previewText || ""}
                onChange={(e) => onUpdateSettings({ ...settings, previewText: e.target.value })}
                placeholder="e.g. Exclusive 24-hr access + 50% discount inside..."
                className="w-full text-xs p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 placeholder:text-slate-400 leading-relaxed resize-none"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                This snippet appears next to the subject line in Gmail, Apple Mail, and Outlook before opening. Increases open rates by 25–40%!
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Outer Background Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.outerBgColor}
                  onChange={(e) => onUpdateSettings({ ...settings, outerBgColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.outerBgColor}
                  onChange={(e) => onUpdateSettings({ ...settings, outerBgColor: e.target.value })}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Inner Container Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.containerBgColor}
                  onChange={(e) => onUpdateSettings({ ...settings, containerBgColor: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.containerBgColor}
                  onChange={(e) => onUpdateSettings({ ...settings, containerBgColor: e.target.value })}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1">Default Font Family</label>
              <FontFamilyPicker
                value={settings.defaultFont.split(",")[0].replace(/['"]/g, "").trim() || "Inter"}
                onChange={(font) => onUpdateSettings({ ...settings, defaultFont: `${font}, Arial, sans-serif` })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Text Color</label>
                <input
                  type="color"
                  value={settings.textColor}
                  onChange={(e) => onUpdateSettings({ ...settings, textColor: e.target.value })}
                  className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link Color</label>
                <input
                  type="color"
                  value={settings.linkColor}
                  onChange={(e) => onUpdateSettings({ ...settings, linkColor: e.target.value })}
                  className="w-full h-8 rounded border border-slate-200 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Container Corner Radius</span>
                <span>{settings.borderRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                value={settings.borderRadius}
                onChange={(e) => onUpdateSettings({ ...settings, borderRadius: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.containerShadow}
                  onChange={(e) => onUpdateSettings({ ...settings, containerShadow: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-700 font-medium">Add subtle shadow to container</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
