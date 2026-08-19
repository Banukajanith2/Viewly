"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTheme,
  getThemeServerSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }>;

const ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle() {
  // useSyncExternalStore rather than state mirrored in an effect: the theme lives in
  // localStorage and on <html>, both outside React, and this is the hook for exactly
  // that. It also gives a correct server snapshot, so hydration has nothing to
  // disagree about, and picks up changes made in other tabs.
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  // While the choice is "system" the OS can change under us. Without this the page
  // would keep whatever the OS reported at load and quietly go stale.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  // Derived from the stored SETTING, never from matchMedia.
  //
  // Resolving "system" during render reads the OS preference, which the server
  // cannot know, so the server rendered a sun while a dark-mode client rendered a
  // moon and hydration failed. Showing the setting is also the more honest label:
  // "system" is a real choice and deserves its own icon rather than masquerading
  // as whichever mode it currently resolves to.
  const Current = ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Current className="size-4" />
          <span className="sr-only">Change theme, currently {theme}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? "bg-accent" : undefined}
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
