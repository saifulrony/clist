"use client";

import React, { useState, useRef, useEffect } from "react";
import { BlockType, EmailBlock, EmailSettings, getColumnsList } from "./types";

interface EmailCanvasProps {
  blocks: EmailBlock[];
  settings: EmailSettings;
  selectedBlockId: string | null;
  viewMode: "desktop" | "mobile" | "code";
  onSelectBlock: (id: string) => void;
  onReorderBlocks: (fromIndex: number, toIndex: number) => void;
  onInsertBlock: (type: BlockType, index: number) => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onUpdateBlock?: (updated: EmailBlock) => void;
  onUpdateSettings?: (settings: EmailSettings) => void;
}

export default function EmailCanvas({
  blocks,
  settings,
  selectedBlockId,
  viewMode,
  onSelectBlock,
  onReorderBlocks,
  onInsertBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onUpdateBlock,
  onUpdateSettings,
}: EmailCanvasProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ width?: number; height?: number } | null>(null);

  // References for DOM elements to measure real offsets
  const blockRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const canvasInnerRef = useRef<HTMLDivElement | null>(null);

  const resizeStartPos = useRef<{
    x: number;
    y: number;
    initialWidth: number;
    initialHeight: number;
    parentWidth: number;
    block: EmailBlock;
    handle: string;
  } | null>(null);

  // Universal Border Resize MouseDown handler (Inspired by SortableComponent.tsx)
  const handleResizeMouseDown = (e: React.MouseEvent, handle: string, block: EmailBlock) => {
    e.preventDefault();
    e.stopPropagation();

    const el = blockRefs.current[block.id];
    if (!el) return;

    const initialWidth = el.offsetWidth;
    const initialHeight = el.offsetHeight;
    const parentW = canvasInnerRef.current?.offsetWidth || settings.containerWidth || 600;

    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      initialWidth,
      initialHeight,
      parentWidth: parentW,
      block,
      handle,
    };

    const isEW = handle === "left" || handle === "right";
    const isNS = handle === "top" || handle === "bottom";
    const isNWSE = handle === "top-left" || handle === "bottom-right";
    const cursor = isEW ? "col-resize" : isNS ? "row-resize" : isNWSE ? "nwse-resize" : "nesw-resize";

    document.body.style.cursor = cursor;
    document.body.classList.add("select-none", "builder-dragging");

    setIsResizing(true);
    setResizeHandle(handle);

    // Initial tooltip info
    const initialPct = block.width || (block.type === "image" ? block.maxWidth : 100);
    setResizeInfo({ width: Math.round(initialPct), height: Math.round(initialHeight) });

    // Full-screen overlay to catch all mouse events seamlessly
    const overlay = document.createElement("div");
    overlay.id = "email-builder-resize-overlay";
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;cursor:${cursor};`;
    document.body.appendChild(overlay);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartPos.current) return;
      moveEvent.preventDefault();

      const { x: startX, y: startY, initialWidth: initW, initialHeight: initH, parentWidth: pWidth, block: currentBlock, handle: activeHandle } =
        resizeStartPos.current;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newW = initW;
      let newH = initH;

      // Calculate new width
      if (activeHandle.includes("right")) {
        newW = Math.max(100, Math.min(pWidth, initW + dx));
      } else if (activeHandle.includes("left")) {
        newW = Math.max(100, Math.min(pWidth, initW - dx));
      }

      // Calculate new height
      if (activeHandle.includes("bottom")) {
        newH = Math.max(16, initH + dy);
      } else if (activeHandle.includes("top")) {
        newH = Math.max(16, initH - dy);
      }

      const widthPct = Math.round(Math.max(15, Math.min(100, (newW / pWidth) * 100)));
      const heightRounded = Math.round(newH);

      setResizeInfo({ width: widthPct, height: heightRounded });

      if (onUpdateBlock) {
        const updated = applyResize(currentBlock, activeHandle, widthPct, heightRounded, dy);
        onUpdateBlock(updated);
      }
    };

    const handleMouseUp = () => {
      document.body.style.cursor = "";
      document.body.classList.remove("select-none", "builder-dragging");
      const ov = document.getElementById("email-builder-resize-overlay");
      if (ov) ov.remove();

      setIsResizing(false);
      setResizeHandle(null);
      setResizeInfo(null);
      resizeStartPos.current = null;

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to map resize calculations to concrete block properties
  const applyResize = (
    block: EmailBlock,
    handle: string,
    widthPct: number,
    heightPx: number,
    dy: number
  ): EmailBlock => {
    const updated = { ...block };
    const affectsWidth = handle.includes("left") || handle.includes("right");
    const affectsHeight = handle.includes("top") || handle.includes("bottom");

    if (affectsWidth) {
      if (updated.type === "image") {
        updated.maxWidth = widthPct;
        updated.width = widthPct;
      } else if (updated.type === "divider") {
        updated.width = widthPct;
      } else if (updated.type === "button") {
        if (widthPct >= 95) {
          updated.fullWidth = true;
          updated.width = 100;
        } else {
          updated.fullWidth = false;
          updated.width = widthPct;
          updated.paddingX = Math.round(Math.max(12, Math.min(80, widthPct / 2)));
        }
      } else {
        updated.width = widthPct;
      }
    }

    if (affectsHeight) {
      if (updated.type === "spacer") {
        updated.height = Math.max(8, Math.min(320, heightPx));
      } else if (updated.type === "divider") {
        updated.marginY = Math.round(Math.max(2, Math.min(80, heightPx / 3)));
      } else if (updated.type === "callout") {
        updated.padding = Math.round(Math.max(6, Math.min(60, heightPx / 4)));
      } else if (updated.type === "button") {
        updated.paddingY = Math.round(Math.max(4, Math.min(40, heightPx / 4)));
      } else if (updated.type === "header" && updated.logoUrl && (handle.includes("top") || handle.includes("bottom"))) {
        updated.logoHeight = Math.round(Math.max(16, Math.min(180, heightPx / 2)));
      } else if ("paddingY" in updated) {
        updated.paddingY = Math.round(Math.max(2, Math.min(100, heightPx / 4)));
      }
    }

    return updated;
  };

  // HTML5 Drag and Drop for Reordering & Block Insertion
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ action: "reorder_block", fromIndex: index }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.action === "add_block" && data.blockType) {
        onInsertBlock(data.blockType, targetIndex);
      } else if (data.action === "reorder_block" && typeof data.fromIndex === "number") {
        onReorderBlocks(data.fromIndex, targetIndex);
      }
    } catch (err) {
      console.error("Drop handling error", err);
    }
  };

  // Render preview contents of each block
  const renderBlockContent = (block: EmailBlock) => {
    switch (block.type) {
      case "header": {
        const alignClass =
          block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
        return (
          <div className={`px-6 ${alignClass}`} style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            {block.logoUrl && (
              <img
                src={block.logoUrl}
                alt={block.brandName || "Logo"}
                style={{ height: `${block.logoHeight}px` }}
                className="inline-block max-w-[280px] object-contain select-none pointer-events-none"
              />
            )}
            {block.brandName && (
              <div
                className="font-bold text-lg mt-1"
                style={{ color: settings.textColor, fontFamily: settings.defaultFont }}
              >
                {block.brandName}
              </div>
            )}
            {block.tagline && <div className="text-xs text-slate-500 mt-0.5">{block.tagline}</div>}
          </div>
        );
      }

      case "heading": {
        const alignClass =
          block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
        const weightClass =
          block.fontWeight === "800"
            ? "font-extrabold"
            : block.fontWeight === "bold"
            ? "font-bold"
            : block.fontWeight === "600"
            ? "font-semibold"
            : "font-normal";
        return (
          <div
            className={`px-6 ${alignClass} ${weightClass}`}
            style={{
              paddingBottom: `${block.paddingY}px`,
              paddingTop: `${block.paddingY}px`,
              fontSize: `${block.fontSize}px`,
              color: block.color || settings.textColor,
              fontFamily: settings.defaultFont,
              lineHeight: 1.3,
            }}
          >
            {block.text}
          </div>
        );
      }

      case "text": {
        const alignClass =
          block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
        return (
          <div
            className={`px-6 ${alignClass}`}
            style={{
              paddingBottom: `${block.paddingY}px`,
              paddingTop: `${block.paddingY}px`,
              fontSize: `${block.fontSize}px`,
              lineHeight: block.lineHeight,
              color: block.color || settings.textColor,
              fontFamily: settings.defaultFont,
            }}
            dangerouslySetInnerHTML={{ __html: block.content }}
          />
        );
      }

      case "button": {
        const alignClass =
          block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
        return (
          <div className={`px-6 py-3 ${alignClass}`}>
            <span
              className={`inline-block font-semibold transition-transform shadow-xs ${
                block.fullWidth ? "w-full text-center" : ""
              }`}
              style={{
                backgroundColor: block.backgroundColor,
                color: block.textColor,
                borderRadius: `${block.borderRadius}px`,
                padding: `${block.paddingY}px ${block.paddingX}px`,
                fontSize: "15px",
                fontFamily: settings.defaultFont,
              }}
            >
              {block.text}
            </span>
          </div>
        );
      }

      case "image": {
        const alignClass =
          block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
        const widthVal = block.maxWidth || block.width || 100;
        return (
          <div className={`px-6 ${alignClass}`} style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <img
              src={block.src}
              alt={block.alt}
              style={{
                width: `${widthVal}%`,
                borderRadius: `${block.borderRadius}px`,
              }}
              className="inline-block object-cover shadow-xs select-none pointer-events-none"
            />
          </div>
        );
      }

      case "columns": {
        const cols = getColumnsList(block);
        const count = cols.length;
        const gridColsClass =
          count === 1
            ? "grid-cols-1"
            : count === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : count === 3
            ? "grid-cols-1 sm:grid-cols-3"
            : count === 4
            ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5";

        return (
          <div className="px-6" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div
              className={`grid ${gridColsClass} gap-4 p-4`}
              style={{
                backgroundColor: block.backgroundColor || "transparent",
                borderRadius: `${block.borderRadius || 8}px`,
                gap: `${block.gap || 16}px`,
              }}
            >
              {cols.map((col, idx) => (
                <div key={idx} className="space-y-1.5 text-left flex flex-col justify-between">
                  <div>
                    {col.imageSrc && (
                      <img
                        src={col.imageSrc}
                        alt=""
                        className="w-full h-28 object-cover rounded-md mb-2 shadow-2xs select-none pointer-events-none"
                      />
                    )}
                    {col.title && (
                      <div className="font-bold text-sm text-slate-800">{col.title}</div>
                    )}
                    <div className="text-xs text-slate-600 leading-relaxed">{col.content}</div>
                  </div>
                  {col.buttonText && (
                    <span className="text-xs font-semibold text-blue-600 hover:underline inline-block mt-1">
                      {col.buttonText} →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "callout": {
        return (
          <div className="px-6 py-2">
            <div
              className="rounded border-l-4 text-left shadow-2xs"
              style={{
                padding: `${block.padding}px`,
                backgroundColor: block.backgroundColor,
                borderColor: block.borderColor,
                color: block.textColor,
                fontFamily: settings.defaultFont,
              }}
            >
              {block.badge && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-black/5 px-2 py-0.5 rounded inline-block mb-1.5">
                  {block.badge}
                </span>
              )}
              {block.title && <div className="font-bold text-sm mb-1">{block.title}</div>}
              <div className="text-xs leading-relaxed opacity-95" dangerouslySetInnerHTML={{ __html: block.content }} />
            </div>
          </div>
        );
      }

      case "divider": {
        return (
          <div className="px-6 text-center" style={{ paddingBottom: `${block.marginY}px`, paddingTop: `${block.marginY}px` }}>
            <hr
              style={{
                borderTop: `${block.thickness}px ${block.style} ${block.color}`,
                width: `${block.width}%`,
                margin: "0 auto",
              }}
            />
          </div>
        );
      }

      case "spacer": {
        return (
          <div
            style={{ height: `${block.height}px` }}
            className="w-full flex items-center justify-center transition-colors relative"
          >
            <span className="text-[10px] font-mono font-semibold text-blue-500/80 bg-slate-50/80 px-2 py-0.5 rounded border border-slate-200 select-none">
              ↕ {block.height}px
            </span>
          </div>
        );
      }

      case "social": {
        const alignClass =
          block.align === "center" ? "justify-center" : block.align === "right" ? "justify-end" : "justify-start";
        const iconBg = block.iconStyle === "dark" ? "bg-slate-900 text-white" : block.iconStyle === "light" ? "bg-slate-100 text-slate-700" : "bg-blue-600 text-white";
        return (
          <div className={`px-6 flex items-center gap-2 ${alignClass}`} style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            {block.links.map((l, i) => (
              <span
                key={i}
                className={`px-3 py-1 text-xs font-semibold rounded-md shadow-2xs ${iconBg}`}
              >
                {l.label || l.platform}
              </span>
            ))}
          </div>
        );
      }

      case "footer": {
        return (
          <div
            className="px-6 text-center"
            style={{
              paddingBottom: `${block.paddingY}px`,
              paddingTop: `${block.paddingY}px`,
              fontSize: `${block.fontSize}px`,
              color: block.textColor,
              fontFamily: settings.defaultFont,
            }}
          >
            {block.companyName && <div className="font-semibold">{block.companyName}</div>}
            {block.address && <div className="mt-0.5">{block.address}</div>}
            {block.unsubscribeText && (
              <div className="mt-1 underline cursor-pointer">{block.unsubscribeText}</div>
            )}
            {block.copyrightText && <div className="mt-1 text-[11px] opacity-75">{block.copyrightText}</div>}
          </div>
        );
      }

      case "video": {
        const btnColor = block.playButtonColor || "#ef4444";
        return (
          <div className="px-6 text-center" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div className="relative inline-block w-full max-w-[540px] rounded-xl overflow-hidden shadow-xs group cursor-pointer" style={{ borderRadius: `${block.borderRadius || 10}px` }}>
              <img
                src={block.thumbnailUrl || "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&auto=format&fit=crop&q=80"}
                alt={block.alt || block.title || "Video Preview"}
                className="w-full aspect-video object-cover pointer-events-none select-none"
              />
              <div className="absolute inset-0 bg-black/25 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"
                  style={{ backgroundColor: btnColor }}
                >
                  <span className="text-white text-xl pl-1">▶</span>
                </div>
              </div>
              {block.title && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-left">
                  <div className="text-white font-semibold text-xs truncate">{block.title}</div>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "html": {
        return (
          <div className="px-6" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            {block.htmlContent ? (
              <div dangerouslySetInnerHTML={{ __html: block.htmlContent }} />
            ) : (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400 font-mono">
                &lt;Custom HTML Block - Click to Edit Code&gt;
              </div>
            )}
          </div>
        );
      }

      case "testimonial": {
        const stars = Array.from({ length: 5 }, (_, i) => i < (block.rating || 5));
        return (
          <div className="px-6" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div
              className="p-5 rounded-xl border shadow-2xs flex flex-col"
              style={{
                backgroundColor: block.backgroundColor || "#f8fafc",
                borderColor: block.borderColor || "#e2e8f0",
                color: block.textColor || settings.textColor,
                textAlign: block.align || "left",
              }}
            >
              {/* Star Rating */}
              <div className={`flex gap-1 mb-2.5 ${block.align === "center" ? "justify-center" : "justify-start"}`}>
                {stars.map((filled, i) => (
                  <span key={i} style={{ color: filled ? block.ratingColor || "#f59e0b" : "#cbd5e1" }} className="text-base">
                    ★
                  </span>
                ))}
              </div>

              {/* Quote text */}
              <div className="text-sm italic leading-relaxed mb-4 opacity-90">
                "{block.quote}"
              </div>

              {/* Author info */}
              <div className={`flex items-center gap-3 ${block.align === "center" ? "justify-center" : "justify-start"}`}>
                {block.avatarUrl && (
                  <img
                    src={block.avatarUrl}
                    alt={block.authorName}
                    className="w-10 h-10 rounded-full object-cover shadow-2xs"
                  />
                )}
                <div className="text-left">
                  <div className="font-bold text-xs">{block.authorName}</div>
                  <div className="text-[11px] opacity-70">{block.authorTitle}</div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case "product": {
        const isHorizontal = block.layout === "horizontal";
        return (
          <div className="px-6" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div
              className={`rounded-xl border p-4 shadow-2xs ${
                isHorizontal ? "flex flex-col sm:flex-row gap-4 items-center" : "flex flex-col gap-3"
              }`}
              style={{
                backgroundColor: block.backgroundColor || "#ffffff",
                borderColor: block.borderColor || "#e2e8f0",
              }}
            >
              {/* Product Image */}
              <div className={isHorizontal ? "w-full sm:w-1/3 shrink-0" : "w-full"}>
                <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={block.imageUrl || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80"}
                    alt={block.title}
                    className="w-full h-full object-cover select-none pointer-events-none"
                  />
                  {block.badge && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600 text-white font-bold text-[9px] uppercase tracking-wider rounded-md shadow-xs">
                      {block.badge}
                    </span>
                  )}
                </div>
              </div>

              {/* Product Details */}
              <div className="flex-1 flex flex-col justify-between text-left space-y-2">
                <div>
                  <div className="font-bold text-base text-slate-900">{block.title}</div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">{block.description}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-extrabold text-lg text-slate-900">{block.price}</span>
                    {block.originalPrice && (
                      <span className="text-xs text-slate-400 line-through">{block.originalPrice}</span>
                    )}
                  </div>
                  <span
                    className="px-4 py-2 rounded-lg font-semibold text-xs text-white shadow-2xs inline-block"
                    style={{ backgroundColor: block.buttonColor || "#2563eb" }}
                  >
                    {block.buttonText} →
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case "countdown": {
        const bg = block.backgroundColor || "#0f172a";
        const digColor = block.digitColor || "#ffffff";
        const lblColor = block.labelColor || "#94a3b8";

        return (
          <div className="px-6 text-center" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div
              className="p-5 rounded-xl shadow-xs"
              style={{
                backgroundColor: bg,
                borderRadius: `${block.borderRadius || 12}px`,
              }}
            >
              {block.headline && (
                <div className="font-bold text-xs uppercase tracking-wider mb-3 text-white">
                  {block.headline}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {[
                  { val: block.days || 0, label: "DAYS" },
                  { val: block.hours || 0, label: "HOURS" },
                  { val: block.minutes || 0, label: "MINS" },
                  { val: block.seconds || 0, label: "SECS" },
                ].map((unit, idx) => (
                  <div
                    key={idx}
                    className="w-14 sm:w-16 py-2 px-1 bg-white/10 rounded-lg backdrop-blur-xs flex flex-col items-center border border-white/10"
                  >
                    <span className="text-xl sm:text-2xl font-black font-mono leading-none" style={{ color: digColor }}>
                      {String(unit.val).padStart(2, "0")}
                    </span>
                    <span className="text-[9px] font-bold tracking-wider mt-1" style={{ color: lblColor }}>
                      {unit.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case "menu": {
        const alignClass =
          block.align === "center" ? "justify-center" : block.align === "right" ? "justify-end" : "justify-start";
        const sepChar = block.separator === "|" ? "|" : block.separator === "•" ? "•" : "";

        return (
          <div className="px-6" style={{ paddingBottom: `${block.paddingY}px`, paddingTop: `${block.paddingY}px` }}>
            <div className={`flex flex-wrap items-center gap-3 ${alignClass}`}>
              {block.items.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && sepChar && (
                    <span className="text-slate-300 text-xs select-none">{sepChar}</span>
                  )}
                  <span
                    className="font-semibold cursor-pointer hover:underline"
                    style={{
                      fontSize: `${block.fontSize || 13}px`,
                      color: block.linkColor || settings.linkColor || "#2563eb",
                    }}
                  >
                    {item.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-start transition-all relative select-none"
      style={{ backgroundColor: settings.outerBgColor }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => handleDrop(e, blocks.length)}
      onClick={() => onSelectBlock("")}
    >
      {/* Live Value Tooltip Indicator while Resizing */}
      {isResizing && resizeInfo && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100000] bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2.5 border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span>↔ Width: {resizeInfo.width}%</span>
          <span className="text-slate-500">•</span>
          <span>↕ Height: {resizeInfo.height}px</span>
        </div>
      )}

      {/* Container Frame */}
      <div
        className={`transition-all duration-300 relative ${
          viewMode === "mobile"
            ? "w-[380px] my-6 rounded-[36px] border-[10px] border-slate-800 shadow-2xl p-1 bg-slate-800"
            : "w-full max-w-[620px] my-4"
        }`}
      >
        {/* Mobile speaker notch */}
        {viewMode === "mobile" && (
          <div className="h-4 flex items-center justify-center mb-1">
            <div className="w-16 h-1.5 bg-slate-700 rounded-full" />
          </div>
        )}

        {/* The White Email Canvas Container */}
        <div
          ref={canvasInnerRef}
          className="w-full transition-all relative overflow-hidden email-canvas-inner"
          style={{
            maxWidth: `${viewMode === "mobile" ? 360 : settings.containerWidth}px`,
            backgroundColor: settings.containerBgColor,
            borderRadius: `${settings.borderRadius}px`,
            boxShadow: settings.containerShadow ? "0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04)" : "none",
            minHeight: "450px",
          }}
        >
          {blocks.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-slate-200 m-6 rounded-2xl">
              <div className="text-3xl mb-2">📬</div>
              <div className="text-sm font-bold text-slate-800">Your email is empty</div>
              <div className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Drag blocks from the left sidebar into this canvas, or load a starter template to get started.
              </div>
            </div>
          ) : (
            blocks.map((block, index) => {
              const isSelected = block.id === selectedBlockId;
              const isHovered = block.id === hoveredBlockId && !isSelected;
              const isDragOver = dragOverIndex === index;

              // Width wrapper style for any resized block
              const blockWidth = block.width && block.width < 100 && block.type !== "image" ? `${block.width}%` : "100%";
              const align = "align" in block ? block.align : "center";
              const marginStyle =
                align === "center"
                  ? "0 auto"
                  : align === "right"
                  ? "0 0 0 auto"
                  : "0 auto 0 0";

              return (
                <div
                  key={block.id}
                  className="relative group transition-all"
                  style={{
                    width: blockWidth,
                    margin: marginStyle,
                  }}
                  onMouseEnter={() => setHoveredBlockId(block.id)}
                  onMouseLeave={() => setHoveredBlockId(null)}
                >
                  {/* Drop indicator line */}
                  {isDragOver && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 z-30 shadow-sm animate-pulse" />
                  )}

                  {/* Main Block Container */}
                  <div
                    ref={(node) => {
                      blockRefs.current[block.id] = node;
                    }}
                    draggable={!isResizing}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBlock(block.id);
                    }}
                    className={`relative transition-all cursor-pointer ${
                      isSelected
                        ? "z-30 ring-2 ring-blue-500 shadow-xs"
                        : isHovered
                        ? "ring-1 ring-blue-400/40 ring-inset"
                        : ""
                    }`}
                  >
                    {/* Top Action Toolbar (Attached to Selection Border) */}
                    {(isSelected || isHovered) && !isResizing && (
                      <div
                        className={`absolute z-40 flex items-center bg-blue-600 text-white shadow-md overflow-hidden text-[10px] font-bold tracking-wider uppercase pointer-events-auto h-7 ${
                          index === 0 ? "top-0 left-0 rounded-b-md" : "-top-7 left-0 rounded-t-md"
                        }`}
                      >
                        {/* Drag Handle Grip */}
                        <div
                          className="px-2 h-full flex items-center justify-center cursor-move hover:bg-blue-700 border-r border-blue-500/50"
                          title="Drag to reorder block"
                        >
                          ⋮⋮
                        </div>

                        {/* Widget Type Name */}
                        <div className="px-2.5 h-full flex items-center cursor-default border-r border-blue-500/50">
                          {block.type}
                        </div>

                        {/* Move Up */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (index > 0) onReorderBlocks(index, index - 1);
                          }}
                          disabled={index === 0}
                          className="px-1.5 h-full hover:bg-blue-700 disabled:opacity-40 border-r border-blue-500/50"
                          title="Move up"
                        >
                          ↑
                        </button>

                        {/* Move Down */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (index < blocks.length - 1) onReorderBlocks(index, index + 1);
                          }}
                          disabled={index === blocks.length - 1}
                          className="px-1.5 h-full hover:bg-blue-700 disabled:opacity-40 border-r border-blue-500/50"
                          title="Move down"
                        >
                          ↓
                        </button>

                        {/* Duplicate */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateBlock(block.id);
                          }}
                          className="px-1.5 h-full hover:bg-blue-700 border-r border-blue-500/50"
                          title="Duplicate block"
                        >
                          📋
                        </button>

                        {/* Delete */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBlock(block.id);
                          }}
                          className="px-2 h-full hover:bg-red-600 text-white transition-colors"
                          title="Delete block"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Block Preview Content */}
                    <div className="relative pointer-events-auto">
                      {renderBlockContent(block)}
                    </div>

                    {/* ======================================================== */}
                    {/* BORDER RESIZE HANDLES (8 handles matching SortableComponent) */}
                    {/* ======================================================== */}
                    {isSelected && (
                      <>
                        {/* Edge Handle: Left (Width) */}
                        <div
                          className="absolute top-0 -left-1.5 w-3 h-full cursor-col-resize z-40 hover:bg-blue-400/20 active:bg-blue-500/30 flex items-center justify-center pointer-events-auto group/eh"
                          onMouseDown={(e) => handleResizeMouseDown(e, "left", block)}
                          title="Drag to resize width"
                        >
                          <div className="w-1.5 h-6 bg-blue-600 border border-white rounded-full shadow-xs group-hover/eh:scale-125 transition-transform" />
                        </div>

                        {/* Edge Handle: Right (Width) */}
                        <div
                          className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-40 hover:bg-blue-400/20 active:bg-blue-500/30 flex items-center justify-center pointer-events-auto group/eh"
                          onMouseDown={(e) => handleResizeMouseDown(e, "right", block)}
                          title="Drag to resize width"
                        >
                          <div className="w-1.5 h-6 bg-blue-600 border border-white rounded-full shadow-xs group-hover/eh:scale-125 transition-transform" />
                        </div>

                        {/* Edge Handle: Top (Height/Spacing) */}
                        <div
                          className="absolute -top-1.5 left-0 w-full h-3 cursor-row-resize z-40 hover:bg-blue-400/20 active:bg-blue-500/30 flex items-center justify-center pointer-events-auto group/eh"
                          onMouseDown={(e) => handleResizeMouseDown(e, "top", block)}
                          title="Drag to resize height & vertical spacing"
                        >
                          <div className="w-6 h-1.5 bg-blue-600 border border-white rounded-full shadow-xs group-hover/eh:scale-125 transition-transform" />
                        </div>

                        {/* Edge Handle: Bottom (Height/Spacing) */}
                        <div
                          className="absolute -bottom-1.5 left-0 w-full h-3 cursor-row-resize z-40 hover:bg-blue-400/20 active:bg-blue-500/30 flex items-center justify-center pointer-events-auto group/eh"
                          onMouseDown={(e) => handleResizeMouseDown(e, "bottom", block)}
                          title="Drag to resize height & vertical spacing"
                        >
                          <div className="w-6 h-1.5 bg-blue-600 border border-white rounded-full shadow-xs group-hover/eh:scale-125 transition-transform" />
                        </div>

                        {/* Corner Handle: Top-Left */}
                        <div
                          className="absolute -top-2 -left-2 w-4 h-4 cursor-nwse-resize z-50 bg-blue-600 border-2 border-white rounded-xs shadow-md pointer-events-auto hover:scale-125 transition-transform"
                          onMouseDown={(e) => handleResizeMouseDown(e, "top-left", block)}
                          title="Drag corner to resize width & height"
                        />

                        {/* Corner Handle: Top-Right */}
                        <div
                          className="absolute -top-2 -right-2 w-4 h-4 cursor-nesw-resize z-50 bg-blue-600 border-2 border-white rounded-xs shadow-md pointer-events-auto hover:scale-125 transition-transform"
                          onMouseDown={(e) => handleResizeMouseDown(e, "top-right", block)}
                          title="Drag corner to resize width & height"
                        />

                        {/* Corner Handle: Bottom-Left */}
                        <div
                          className="absolute -bottom-2 -left-2 w-4 h-4 cursor-nesw-resize z-50 bg-blue-600 border-2 border-white rounded-xs shadow-md pointer-events-auto hover:scale-125 transition-transform"
                          onMouseDown={(e) => handleResizeMouseDown(e, "bottom-left", block)}
                          title="Drag corner to resize width & height"
                        />

                        {/* Corner Handle: Bottom-Right */}
                        <div
                          className="absolute -bottom-2 -right-2 w-4 h-4 cursor-nwse-resize z-50 bg-blue-600 border-2 border-white rounded-xs shadow-md pointer-events-auto hover:scale-125 transition-transform"
                          onMouseDown={(e) => handleResizeMouseDown(e, "bottom-right", block)}
                          title="Drag corner to resize width & height"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* End-of-canvas Drop Zone */}
          <div
            onDragOver={(e) => handleDragOver(e, blocks.length)}
            onDrop={(e) => handleDrop(e, blocks.length)}
            className={`h-8 transition-colors ${
              dragOverIndex === blocks.length ? "bg-blue-100 border-2 border-dashed border-blue-400" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}
