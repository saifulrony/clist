"use client";

import React, { useState, useRef, useEffect } from "react";

interface ImageUploadButtonProps {
  onUploadSuccess: (url: string) => void;
  currentImageUrl?: string;
  buttonText?: string;
  label?: string;
}

interface StockImage {
  name: string;
  category: "Banners" | "Logos & Icons" | "Business & Tech" | "Ecommerce";
  url: string;
}

const STOCK_GALLERY: StockImage[] = [
  // Banners & Heros
  {
    name: "Modern SaaS Dashboard",
    category: "Banners",
    url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1000&auto=format&fit=crop&q=80",
  },
  {
    name: "Technology Workspace",
    category: "Banners",
    url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&auto=format&fit=crop&q=80",
  },
  {
    name: "Minimal Blue Abstract",
    category: "Banners",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80",
  },
  {
    name: "Team Strategy Conference",
    category: "Banners",
    url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&auto=format&fit=crop&q=80",
  },

  // Business & Tech
  {
    name: "Data Analytics Graph",
    category: "Business & Tech",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Creative Modern Office",
    category: "Business & Tech",
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Cloud Server Infrastructure",
    category: "Business & Tech",
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80",
  },

  // Logos & Icons
  {
    name: "Apex Geometric Logo",
    category: "Logos & Icons",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80",
  },
  {
    name: "Hexagon Modern Emblem",
    category: "Logos & Icons",
    url: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&auto=format&fit=crop&q=80",
  },
  {
    name: "Vibrant Gradient Sphere",
    category: "Logos & Icons",
    url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&auto=format&fit=crop&q=80",
  },

  // Ecommerce & Products
  {
    name: "Premium Packaging Mockup",
    category: "Ecommerce",
    url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Minimalist Retail Showcase",
    category: "Ecommerce",
    url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
  },
];

export default function ImageUploadButton({
  onUploadSuccess,
  currentImageUrl,
  buttonText,
  label = "Image Source",
}: ImageUploadButtonProps) {
  const [mode, setMode] = useState<"upload" | "gallery" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(currentImageUrl || "");
  const [galleryTab, setGalleryTab] = useState<string>("All");
  const [uploadedMedia, setUploadedMedia] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentImageUrl) {
      setUrlInput(currentImageUrl);
    }
  }, [currentImageUrl]);

  const getBackendUrl = () => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      return `http://${hostname}:18001`;
    }
    return "http://192.168.10.203:18001";
  };

  const fetchUploadedMedia = async () => {
    setLoadingMedia(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/media`);
      if (res.ok) {
        const data = await res.json();
        setUploadedMedia(data.media || []);
      }
    } catch (err) {
      console.warn("Could not fetch media library:", err);
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleModeChange = (newMode: "upload" | "gallery" | "url") => {
    setMode(newMode);
    setError(null);
    if (newMode === "gallery") {
      fetchUploadedMedia();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, SVG, GIF, WebP)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be less than 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${getBackendUrl()}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const finalUrl = data.image_url || data.url;
        onUploadSuccess(finalUrl);
        setUrlInput(finalUrl);
        setMode("url");
      } else {
        throw new Error(`Upload returned status ${response.status}`);
      }
    } catch (err) {
      console.warn("Backend upload failed, attempting local dataURL fallback...", err);
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          onUploadSuccess(result);
          setUrlInput(result);
          setMode("url");
        };
        reader.readAsDataURL(file);
      } catch (fallbackErr) {
        setError("Failed to upload image. Please enter a direct image URL instead.");
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onUploadSuccess(urlInput.trim());
    }
  };

  const categories = ["All", "My Uploads", "Banners", "Logos & Icons", "Business & Tech", "Ecommerce"];

  const filteredStock = STOCK_GALLERY.filter(
    (item) => galleryTab === "All" || item.category === galleryTab
  );

  return (
    <div className="space-y-3 bg-white border border-gray-200 p-3 rounded-xl shadow-2xs">
      {/* Mode Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleModeChange("upload")}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 border-b-2 transition-colors cursor-pointer ${
            mode === "upload"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>⬆️</span> Upload
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("gallery")}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 border-b-2 transition-colors cursor-pointer ${
            mode === "gallery"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>🖼️</span> Gallery
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("url")}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 border-b-2 transition-colors cursor-pointer ${
            mode === "url"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>🔗</span> URL
        </button>
      </div>

      {/* Content based on selected mode */}
      <div className="pt-1">
        {mode === "upload" && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="image-upload-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center px-4 py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium text-gray-700 group cursor-pointer"
            >
              {uploading ? (
                <div className="flex items-center gap-2 text-indigo-600">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Uploading image...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg group-hover:bg-indigo-100 group-hover:scale-105 transition-all">
                    📁
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 group-hover:text-indigo-600">
                      {buttonText || "Click to browse & upload"}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, SVG, GIF or WebP (max 10MB)</p>
                  </div>
                </div>
              )}
            </button>
          </div>
        )}

        {mode === "gallery" && (
          <div className="space-y-2.5">
            {/* Gallery Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGalleryTab(cat)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0 transition-colors cursor-pointer ${
                    galleryTab === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Gallery Image Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
              {galleryTab === "My Uploads" ? (
                loadingMedia ? (
                  <div className="col-span-2 text-center text-xs text-slate-400 py-6">Loading uploads...</div>
                ) : uploadedMedia.length === 0 ? (
                  <div className="col-span-2 text-center text-xs text-slate-400 py-6">
                    No uploads yet. Click the Upload tab to add images!
                  </div>
                ) : (
                  uploadedMedia.map((m, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        onUploadSuccess(m.url);
                        setUrlInput(m.url);
                      }}
                      className="group relative aspect-video bg-white border border-slate-200 rounded-lg overflow-hidden cursor-pointer hover:border-indigo-500 hover:shadow-xs transition-all"
                    >
                      <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-indigo-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white bg-indigo-600 px-2 py-0.5 rounded shadow-xs">
                          Select
                        </span>
                      </div>
                    </div>
                  ))
                )
              ) : (
                filteredStock.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onUploadSuccess(item.url);
                      setUrlInput(item.url);
                    }}
                    className="group relative aspect-video bg-white border border-slate-200 rounded-lg overflow-hidden cursor-pointer hover:border-indigo-500 hover:shadow-xs transition-all"
                    title={item.name}
                  >
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                      <div className="text-[9px] text-white font-medium truncate">{item.name}</div>
                    </div>
                    <div className="absolute inset-0 bg-indigo-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white bg-indigo-600 px-2.5 py-1 rounded shadow-xs">
                        Select
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {mode === "url" && (
          <div className="space-y-2">
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}

      {currentImageUrl && (
        <div className="text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1.5">
          <span className="truncate max-w-[200px]" title={currentImageUrl}>
            Active: {currentImageUrl}
          </span>
          <button
            type="button"
            onClick={() => {
              onUploadSuccess("");
              setUrlInput("");
            }}
            className="text-red-500 hover:text-red-700 font-semibold cursor-pointer shrink-0 ml-1"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
