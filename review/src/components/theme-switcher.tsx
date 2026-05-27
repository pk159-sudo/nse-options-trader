"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

const THEMES = [
  {
    id: "dark",
    name: "Dark",
    emoji: "\u25CF",
    preview: "bg-zinc-900",
    ring: "ring-zinc-500",
    dot: "bg-zinc-400",
  },
  {
    id: "light",
    name: "Light",
    emoji: "\u25CF",
    preview: "bg-slate-100",
    ring: "ring-slate-400",
    dot: "bg-slate-500",
  },
  {
    id: "gold-neo",
    name: "Gold Neo",
    emoji: "\u25CF",
    preview: "bg-amber-400",
    ring: "ring-amber-500",
    dot: "bg-amber-200",
  },
  {
    id: "midnight-blue",
    name: "Midnight",
    emoji: "\u25CF",
    preview: "bg-slate-900",
    ring: "ring-blue-500",
    dot: "bg-blue-400",
  },
  {
    id: "matrix",
    name: "Matrix",
    emoji: "\u25CF",
    preview: "bg-green-950",
    ring: "ring-green-500",
    dot: "bg-green-400",
  },
  {
    id: "terminal",
    name: "Terminal",
    emoji: "\u25CF",
    preview: "bg-amber-950",
    ring: "ring-amber-500",
    dot: "bg-amber-400",
  },
  {
    id: "purple",
    name: "Purple",
    emoji: "\u25CF",
    preview: "bg-purple-950",
    ring: "ring-purple-500",
    dot: "bg-purple-400",
  },
  {
    id: "ocean",
    name: "Ocean",
    emoji: "\u25CF",
    preview: "bg-teal-950",
    ring: "ring-teal-500",
    dot: "bg-teal-400",
  },
  {
    id: "crimson",
    name: "Crimson",
    emoji: "\u25CF",
    preview: "bg-red-950",
    ring: "ring-red-500",
    dot: "bg-red-400",
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">
        <Palette className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs font-medium ${
          open
            ? "bg-zinc-700 border-zinc-600 text-zinc-200"
            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50"
        }`}
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {THEMES.find((t) => t.id === theme)?.name || "Theme"}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2 min-w-[180px]">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold px-2 py-1 mb-1">
              Themes
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                    theme === t.id
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full ${t.dot} ${
                      theme === t.id ? `ring-2 ${t.ring} ring-offset-1 ring-offset-zinc-900` : ""
                    }`}
                  />
                  <span className="text-xs font-medium">{t.name}</span>
                  {theme === t.id && (
                    <span className="ml-auto text-[10px] text-zinc-500 font-bold">
                      Active
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
