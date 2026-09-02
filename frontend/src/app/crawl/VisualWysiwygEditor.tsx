"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface VisualWysiwygEditorProps {
  value: string;
  onChange: (newHtml: string) => void;
  device?: "desktop" | "mobile";
  onDeviceChange?: (dev: "desktop" | "mobile") => void;
  onSwitchToHtml?: () => void;
  onOpenBuilder?: () => void;
  hasTemplate?: boolean;
  onSelectTemplate?: () => void;
}

export default function VisualWysiwygEditor({
  value,
  onChange,
  device = "desktop",
  onDeviceChange,
  onSwitchToHtml,
  onOpenBuilder,
  hasTemplate = true,
  onSelectTemplate,
}: VisualWysiwygEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastLoadedHtmlRef = useRef<string>("");
  const isEditingRef = useRef<boolean>(false);
  const [activeFormat, setActiveFormat] = useState<string>("p");
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showVariableDropdown, setShowVariableDropdown] = useState<boolean>(false);
  const [iframeHeight, setIframeHeight] = useState<number>(500);

  // Auto-resize iframe to EXACT email content height with zero excess blank space
  const updateIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    try {
      // Look for the main email container, center wrapper, or primary table
      const center = doc.querySelector("center") as HTMLElement | null;
      const container = doc.querySelector(".email-container") as HTMLElement | null;
      const body = doc.body;

      let targetHeight = 0;

      if (center && center.offsetHeight > 50) {
        // center element contains the email table
        targetHeight = center.offsetHeight + 16;
      } else if (container && container.offsetHeight > 50) {
        targetHeight = container.offsetHeight + 24;
      } else if (body) {
        // Measure lowest bottom of all visible elements
        let maxBottom = 0;
        Array.from(body.children).forEach((child) => {
          if (child.id === "editor-wysiwyg-styles") return;
          const el = child as HTMLElement;
          const bottom = (el.offsetTop || 0) + (el.offsetHeight || 0);
          if (bottom > maxBottom) maxBottom = bottom;
        });
        targetHeight = maxBottom > 50 ? maxBottom + 20 : body.scrollHeight;
      }

      if (targetHeight > 60) {
        const finalH = Math.ceil(targetHeight);
        setIframeHeight((prev) => {
          if (Math.abs(prev - finalH) > 4) {
            return finalH;
          }
          return prev;
        });
      }
    } catch (e) {
      console.warn("Could not calculate iframe height", e);
    }
  }, []);

  // Injected helper styles: strictly height: auto with no artificial viewport stretching
  const EDITOR_CSS = `
    html, body {
      overflow: hidden !important;
      overflow-y: hidden !important;
      overflow-x: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }
    ::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    body {
      cursor: text !important;
      outline: none !important;
      box-sizing: border-box;
      -webkit-user-modify: read-write;
      word-break: break-word;
    }
    /* Subtle hover cue like WordPress blocks */
    h1:hover, h2:hover, h3:hover, p:hover, td:hover, a:hover, div:hover, span:hover, img:hover {
      outline: 1px dashed rgba(99, 102, 241, 0.45) !important;
      outline-offset: 2px;
      transition: outline 0.1s ease;
    }
    /* Active focus element ring */
    *:focus {
      outline: 2px solid #4f46e5 !important;
      outline-offset: 2px;
    }
    /* Disable link clicks while editing so caret can be placed inside links */
    a {
      cursor: text !important;
      pointer-events: auto;
    }
  `;

  // Function to serialize and emit clean HTML
  const syncHtmlToParent = useCallback(() => {
    if (!iframeRef.current?.contentDocument) return;
    const doc = iframeRef.current.contentDocument;

    try {
      const clone = doc.documentElement.cloneNode(true) as HTMLElement;
      // Remove temporary injected editor style tag
      const styleTag = clone.querySelector("#editor-wysiwyg-styles");
      if (styleTag) styleTag.remove();

      let cleanHtml = "<!DOCTYPE html>\n" + clone.outerHTML;
      lastLoadedHtmlRef.current = cleanHtml;
      isEditingRef.current = true;
      onChange(cleanHtml);
    } catch (err) {
      console.warn("Failed to serialize iframe HTML", err);
    }
  }, [onChange]);

  // Load HTML into iframe
  const loadHtmlIntoIframe = useCallback((content: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let fullHtml = content;
    if (!fullHtml || !fullHtml.trim()) {
      fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Inter,sans-serif;padding:24px;color:#1e293b;"><p>Hi {{name}},</p><p>Write your email message here...</p></body></html>`;
    }

    const styleBlock = `<style id="editor-wysiwyg-styles">${EDITOR_CSS}</style>`;

    if (fullHtml.includes("</head>")) {
      fullHtml = fullHtml.replace("</head>", `${styleBlock}</head>`);
    } else if (fullHtml.includes("<body")) {
      fullHtml = fullHtml.replace("<body", `<head>${styleBlock}</head><body`);
    } else {
      fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${styleBlock}</head><body>${fullHtml}</body></html>`;
    }

    iframe.srcdoc = fullHtml;
  }, [EDITOR_CSS]);

  // Handle iframe load event
  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    try {
      // Enable WYSIWYG editing
      doc.designMode = "on";
      if (doc.body) {
        doc.body.contentEditable = "true";
        doc.body.spellcheck = true;
      }

      // Prevent link navigation inside editor
      doc.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest("a");
        if (anchor) {
          e.preventDefault();
        }
      });

      // Update height dynamically
      updateIframeHeight();
      setTimeout(updateIframeHeight, 100);
      setTimeout(updateIframeHeight, 300);
      setTimeout(updateIframeHeight, 800);

      // Listen to image loads to resize when external images load
      const images = doc.querySelectorAll("img");
      images.forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", updateIframeHeight);
          img.addEventListener("error", updateIframeHeight);
        }
      });

      // ResizeObserver to watch body height mutations
      if (typeof ResizeObserver !== "undefined" && doc.body) {
        const ro = new ResizeObserver(() => {
          updateIframeHeight();
        });
        ro.observe(doc.body);
      }

      // Capture keystrokes & changes
      const handleInputOrKeyUp = () => {
        syncHtmlToParent();
        updateIframeHeight();
      };

      doc.addEventListener("input", handleInputOrKeyUp);
      doc.addEventListener("keyup", handleInputOrKeyUp);
      doc.addEventListener("paste", () => {
        setTimeout(() => {
          syncHtmlToParent();
          updateIframeHeight();
        }, 20);
      });
      doc.addEventListener("cut", () => {
        setTimeout(() => {
          syncHtmlToParent();
          updateIframeHeight();
        }, 20);
      });
    } catch (err) {
      console.warn("Error initializing designMode on iframe", err);
    }
  };

  // Sync value when changed externally
  useEffect(() => {
    if (value !== lastLoadedHtmlRef.current) {
      lastLoadedHtmlRef.current = value;
      loadHtmlIntoIframe(value);
    }
  }, [value, loadHtmlIntoIframe]);

  // Update height when switching between desktop and mobile preview
  useEffect(() => {
    const timer = setTimeout(updateIframeHeight, 120);
    return () => clearTimeout(timer);
  }, [device, updateIframeHeight]);

  // Execute formatting command on the document
  const execCmd = (command: string, val: string = "") => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;
    iframe.contentWindow?.focus();
    doc.execCommand(command, false, val);
    syncHtmlToParent();
  };

  // Insert merge variable at cursor position
  const insertVariable = (tag: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;
    iframe.contentWindow?.focus();

    try {
      const sel = doc.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = doc.createTextNode(` ${tag} `);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        doc.execCommand("insertText", false, ` ${tag} `);
      }
    } catch (e) {
      doc.execCommand("insertText", false, ` ${tag} `);
    }

    setShowVariableDropdown(false);
    syncHtmlToParent();
  };

  // Insert Link prompt
  const handleInsertLink = () => {
    const url = prompt("Enter link URL (e.g. https://yourwebsite.com):", "https://");
    if (url) {
      execCmd("createLink", url);
    }
  };

  // Change block format
  const handleBlockFormatChange = (tag: string) => {
    setActiveFormat(tag);
    execCmd("formatBlock", tag);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col transition-all">
      {/* WordPress Gutenberg / Classic Editor Top Ribbon Toolbar */}
      <div className="bg-slate-50/90 border-b border-slate-200/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 select-none shrink-0">
        {/* Formatting Actions */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Block Type Dropdown */}
          <select
            value={activeFormat}
            onChange={(e) => handleBlockFormatChange(e.target.value)}
            className="text-xs py-1 px-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 outline-none hover:border-slate-300 transition-colors cursor-pointer"
            title="Heading / Paragraph Format"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote Block</option>
          </select>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Inline Styles: Bold, Italic, Underline, Strike */}
          <button
            type="button"
            onClick={() => execCmd("bold")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-800 transition-colors cursor-pointer shadow-2xs"
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => execCmd("italic")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center italic font-serif text-xs text-slate-800 transition-colors cursor-pointer shadow-2xs"
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => execCmd("underline")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center underline text-xs text-slate-800 transition-colors cursor-pointer shadow-2xs"
            title="Underline (Ctrl+U)"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => execCmd("strikeThrough")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center line-through text-xs text-slate-800 transition-colors cursor-pointer shadow-2xs"
            title="Strikethrough"
          >
            S
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => execCmd("justifyLeft")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Align Left"
          >
            ⫷
          </button>
          <button
            type="button"
            onClick={() => execCmd("justifyCenter")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Align Center"
          >
            ⫸
          </button>
          <button
            type="button"
            onClick={() => execCmd("justifyRight")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Align Right"
          >
            ⫹
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => execCmd("insertUnorderedList")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Bullet List"
          >
            •≡
          </button>
          <button
            type="button"
            onClick={() => execCmd("insertOrderedList")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Numbered List"
          >
            1.≡
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Link & Unlink */}
          <button
            type="button"
            onClick={handleInsertLink}
            className="px-2 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center gap-1 text-xs text-slate-700 font-medium transition-colors cursor-pointer shadow-2xs"
            title="Insert Link"
          >
            <span>🔗</span>
            <span className="hidden sm:inline">Link</span>
          </button>
          <button
            type="button"
            onClick={() => execCmd("unlink")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-500 transition-colors cursor-pointer shadow-2xs"
            title="Remove Link"
          >
            🚫
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Text Color Picker */}
          <label
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-indigo-600 font-bold transition-colors cursor-pointer shadow-2xs relative"
            title="Change Text Color"
          >
            <span>A</span>
            <span className="w-2.5 h-1 bg-indigo-600 rounded-full absolute bottom-1" />
            <input
              type="color"
              defaultValue="#1e293b"
              onChange={(e) => execCmd("foreColor", e.target.value)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            />
          </label>

          {/* Background Highlight Picker */}
          <label
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-amber-600 font-bold transition-colors cursor-pointer shadow-2xs relative"
            title="Highlight Text Color"
          >
            <span>🖍️</span>
            <input
              type="color"
              defaultValue="#fef08a"
              onChange={(e) => execCmd("hiliteColor", e.target.value)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            />
          </label>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => execCmd("undo")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => execCmd("redo")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>

          {/* Clear Format */}
          <button
            type="button"
            onClick={() => execCmd("removeFormat")}
            className="w-7 h-7 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-100 flex items-center justify-center text-xs text-slate-500 transition-colors cursor-pointer shadow-2xs"
            title="Clear Formatting"
          >
            T⨉
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Insert Variable Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVariableDropdown((v) => !v)}
              className="px-2.5 h-7 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <span>✨</span>
              <span>Insert Variable ▾</span>
            </button>

            {showVariableDropdown && (
              <div
                className="absolute left-0 top-8 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-slide-down"
                onMouseLeave={() => setShowVariableDropdown(false)}
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Lead &amp; Company Tags
                </div>
                {[
                  { tag: "{{name}}", label: "Recipient Name" },
                  { tag: "{{company}}", label: "Company Name" },
                  { tag: "{{city}}", label: "City / Location" },
                  { tag: "{{email}}", label: "Email Address" },
                  { tag: "{{category}}", label: "Industry / Category" },
                  { tag: "{{unsubscribe_link}}", label: "Unsubscribe URL" },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertVariable(item.tag)}
                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 flex items-center justify-between text-xs cursor-pointer transition-colors"
                  >
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <code className="text-[10px] bg-slate-100 text-indigo-600 px-1 py-0.5 rounded font-mono font-bold">
                      {item.tag}
                    </code>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Tools: Device Toggle (Desktop / Mobile) */}
        {onDeviceChange && (
          <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => onDeviceChange("desktop")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                device === "desktop" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              🖥️ Desktop
            </button>
            <button
              type="button"
              onClick={() => onDeviceChange("mobile")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                device === "mobile" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              📱 Mobile
            </button>
          </div>
        )}
      </div>

      {/* Visual Canvas Area with live in-place typing */}
      <div className="bg-slate-100/70 p-4 sm:p-5 flex flex-col items-center justify-start overflow-x-auto relative">
        {/* Floating Hint Banner */}
        <div className="mb-2.5 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-medium text-indigo-700 shadow-2xs">
            <span>✍️</span>
            <span><strong>Quick Edit Mode:</strong> Click anywhere on the email text, headlines, or buttons to edit directly!</span>
          </span>
        </div>

        {/* Email Document Canvas Container */}
        <div
          className={`bg-white rounded-xl shadow-md border border-slate-200 transition-all overflow-hidden flex flex-col ${
            device === "desktop" ? "w-full max-w-[620px]" : "w-[375px]"
          }`}
        >
          {/* Inside Canvas: If No Template Selected Hero CTA */}
          {!hasTemplate && (
            <div className="p-8 sm:p-10 text-center flex flex-col items-center justify-center bg-linear-to-b from-slate-50/70 via-white to-slate-50/40 border-b border-dashed border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center text-2xl mb-3 shadow-2xs">
                🎨
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">No Template Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
                Choose from pre-designed templates to instantly populate professional layouts, headlines, images, and call-to-action buttons.
              </p>
              <div className="flex items-center gap-2.5">
                {onSelectTemplate && (
                  <button
                    type="button"
                    onClick={onSelectTemplate}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>🎨</span>
                    <span>Select Template</span>
                  </button>
                )}
                {onOpenBuilder && (
                  <button
                    type="button"
                    onClick={onOpenBuilder}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>⚙️</span>
                    <span>Builder ↗</span>
                  </button>
                )}
              </div>
              <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="h-px w-10 bg-slate-200"></span>
                <span>or type your message directly below</span>
                <span className="h-px w-10 bg-slate-200"></span>
              </div>
            </div>
          )}

          <iframe
            ref={iframeRef}
            onLoad={handleIframeLoad}
            title="Visual WYSIWYG Email Canvas"
            style={{ height: `${iframeHeight}px` }}
            scrolling="no"
            className="w-full border-0 bg-white block overflow-hidden transition-[height] duration-150"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>
      </div>
    </div>
  );
}
