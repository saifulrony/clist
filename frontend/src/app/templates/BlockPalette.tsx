"use client";

import React, { useState, useMemo } from "react";
import { BlockType } from "./types";

interface WidgetItem {
  type: BlockType;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  color: string;
}

interface CategoryGroup {
  id: string;
  title: string;
  types: BlockType[];
}

// Crisp outline SVG icons matching nextpanel-bill's Heroicons
const DocumentTextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const HeadingIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h3.75m0 0h3.75m-3.75 0v10.5m0 0h-3.75m3.75 0h3.75M15.75 11.25h2.25m0 0h2.25m-2.25 0v6m0 0h-2.25m2.25 0h2.25" />
  </svg>
);

const CursorArrowRaysIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m3.407-4.243L5.566 4.666" />
  </svg>
);

const PhotoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const TableCellsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const ChatBubbleLeftRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.502 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);

const WindowIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6zM7.5 6h.008v.008H7.5V6zm2.25 0h.008v.008H9.75V6z" />
  </svg>
);

const GlobeAltIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

const Bars3Icon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
  </svg>
);

const ArrowsPointingOutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
  </svg>
);

const ArrowDownTrayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5v6a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5v-6m15 0l-7.5 7.5m7.5-7.5l-7.5-7.5" />
  </svg>
);

const VideoCameraIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

const CodeBracketIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
  </svg>
);

const ShoppingBagIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const QueueListIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
  </svg>
);

const ALL_COMPONENTS: WidgetItem[] = [
  { type: "header", label: "Header", icon: WindowIcon, color: "text-slate-600" },
  { type: "menu", label: "Menu", icon: QueueListIcon, color: "text-indigo-600" },
  { type: "heading", label: "Heading", icon: HeadingIcon, color: "text-blue-600" },
  { type: "text", label: "Text", icon: DocumentTextIcon, color: "text-gray-600" },
  { type: "button", label: "Button", icon: CursorArrowRaysIcon, color: "text-emerald-600" },
  { type: "image", label: "Image", icon: PhotoIcon, color: "text-purple-600" },
  { type: "video", label: "Video", icon: VideoCameraIcon, color: "text-red-500" },
  { type: "columns", label: "Columns", icon: TableCellsIcon, color: "text-indigo-600" },
  { type: "product", label: "Product", icon: ShoppingBagIcon, color: "text-rose-500" },
  { type: "testimonial", label: "Review", icon: StarIcon, color: "text-amber-500" },
  { type: "countdown", label: "Countdown", icon: ClockIcon, color: "text-orange-500" },
  { type: "callout", label: "Callout", icon: ChatBubbleLeftRightIcon, color: "text-amber-600" },
  { type: "html", label: "HTML", icon: CodeBracketIcon, color: "text-cyan-600" },
  { type: "social", label: "Social", icon: GlobeAltIcon, color: "text-sky-600" },
  { type: "divider", label: "Divider", icon: Bars3Icon, color: "text-gray-400" },
  { type: "spacer", label: "Spacer", icon: ArrowsPointingOutIcon, color: "text-gray-500" },
  { type: "footer", label: "Footer", icon: ArrowDownTrayIcon, color: "text-slate-500" },
];

const CATEGORIES: CategoryGroup[] = [
  {
    id: "layout",
    title: "Layout",
    types: ["header", "menu", "columns", "divider", "spacer", "footer"],
  },
  {
    id: "contents",
    title: "Contents",
    types: ["heading", "text", "button", "callout", "html"],
  },
  {
    id: "marketing",
    title: "Marketing",
    types: ["product", "testimonial", "countdown"],
  },
  {
    id: "media",
    title: "Media",
    types: ["image", "video", "social"],
  },
];

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
  onOpenTemplatesModal: () => void;
}

export default function BlockPalette({ onAddBlock, onOpenTemplatesModal }: BlockPaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleDragStart = (e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ action: "add_block", blockType: type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return CATEGORIES.map((cat) => {
      const items = ALL_COMPONENTS.filter((comp) => {
        if (!cat.types.includes(comp.type)) return false;
        if (q) {
          const label = comp.label.toLowerCase();
          const type = comp.type.toLowerCase();
          return label.includes(q) || type.includes(q);
        }
        return true;
      });
      return { ...cat, items };
    }).filter((cat) => cat.items.length > 0);
  }, [searchQuery]);

  return (
    <div className="w-72 bg-white border-r border-gray-200 h-full overflow-hidden flex flex-col select-none">
      {/* Top Banner Header matching nextpanel-bill */}
      <div className="p-4 border-b border-indigo-700 bg-indigo-600 text-white flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider">Builder</h2>
          <p className="text-[10px] mt-0.5 opacity-80">Drag components onto canvas</p>
        </div>
        <button
          type="button"
          onClick={onOpenTemplatesModal}
          className="px-2.5 py-1 text-[10px] font-bold bg-white/15 hover:bg-white/25 rounded-md border border-white/20 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
          title="Switch starter template"
        >
          <span>✨</span>
          <span>Presets</span>
        </button>
      </div>

      {/* Search Input matching nextpanel-bill */}
      <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search widgets..."
            className="block w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-md text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Widget Grid by Category matching nextpanel-bill */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => (
            <div key={category.id} className="space-y-2.5">
              {/* Category Divider */}
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-gray-100"></div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] whitespace-nowrap">
                  {category.title}
                </h3>
                <div className="h-px flex-1 bg-gray-100"></div>
              </div>

              {/* 3-Column Square Widget Grid without sub titles */}
              <div className="grid grid-cols-3 gap-2">
                {category.items.map((component) => {
                  const Icon = component.icon;
                  return (
                    <div
                      key={component.type}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, component.type)}
                      onClick={() => onAddBlock(component.type)}
                      className="w-full flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-grab active:cursor-grabbing min-h-[72px] relative select-none bg-white shadow-2xs group"
                      title={`Drag or click to add ${component.label}`}
                    >
                      <div className="p-1.5 rounded-md bg-gray-50 group-hover:bg-indigo-100 transition-colors mb-1.5">
                        <Icon className={`h-4 w-4 ${component.color}`} />
                      </div>
                      <span className="text-[10px] font-medium text-gray-700 group-hover:text-indigo-700 text-center leading-tight">
                        {component.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-xs text-gray-400">
            No widgets found for "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}
