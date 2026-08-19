import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";
import { NO_FLASH_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Inter for UI, JetBrains Mono for figures.
 *
 * The variable names MUST match what @theme in globals.css reads. They previously
 * did not: the theme mapped font-sans to `--font-sans` while the layout defined
 * `--font-geist-sans`, so the variable resolved to nothing and every page silently
 * fell back to the browser's default serif.
 */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Viewly",
    template: "%s | Viewly",
  },
  description:
    "YouTube creator analytics and competitor intelligence: retention diagnostics, " +
    "breakout competitor tracking, and keyword research in one dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is required: the no-flash script writes the theme class onto
    // <html> before React hydrates, so the server and client markup differ by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* next/script rather than a JSX <script>: React 19 refuses to execute a
            script element it encounters during a client render, and Next injects
            beforeInteractive into the document itself so it still runs ahead of
            first paint and there is no theme flash. */}
        <Script id="viewly-theme-no-flash" strategy="beforeInteractive">
          {NO_FLASH_SCRIPT}
        </Script>
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
