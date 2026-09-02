"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

// Dynamic import with SSR disabled to prevent hydration mismatch
const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
  loading: () => <div className="p-4 text-xs text-slate-400 bg-slate-50 min-h-[140px] flex items-center justify-center">Loading rich editor...</div>,
});

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link", "image", "video"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "align",
  "link",
  "image",
  "video",
];

interface QuillEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function QuillEditor({ value, onChange, placeholder }: QuillEditorProps) {
  const [content, setContent] = useState(value || "");
  const lastEmittedValue = useRef(value || "");

  useEffect(() => {
    if (value !== lastEmittedValue.current) {
      setContent(value || "");
      lastEmittedValue.current = value || "";
    }
  }, [value]);

  const handleChange = (newVal: string, delta: any, source: string) => {
    setContent(newVal);
    if (source === "user") {
      lastEmittedValue.current = newVal;
      onChange(newVal);
    }
  };

  return (
    <div className="quill-editor-wrapper text-xs">
      <ReactQuill
        theme="snow"
        value={content}
        onChange={handleChange}
        modules={quillModules}
        formats={quillFormats}
        placeholder={placeholder || "Write your email message..."}
      />
    </div>
  );
}
