"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="nse-trader-theme"
      themes={[
        "dark",
        "light",
        "gold-neo",
        "midnight-blue",
        "matrix",
        "terminal",
        "purple",
        "ocean",
        "crimson",
      ]}
    >
      {children}
    </NextThemesProvider>
  );
}
