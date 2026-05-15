import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { DM_Sans, DM_Mono, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "KILN — AI Creation Platform",
  description:
    "Create AI Agents, Websites & Workflows with Natural Language.",
  manifest: "/manifest.json",
  themeColor: "#1a1918",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KILN",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  icons: {
    apple: "/icons/icon-192x192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sprint 19.9 — i18n. Locale + messages come from src/i18n/request.ts
  // which reads cookie / User.preferredLanguage / Accept-Language. The
  // <html lang> tag follows so screen-readers, browser translation
  // suggestions, and SEO bots see the correct language.
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <ClerkProvider
      appearance={{ baseTheme: dark }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html
        lang={locale}
        className={`${dmSans.variable} ${dmMono.variable} ${instrumentSerif.variable}`}
      >
        <body className="font-sans antialiased">
          <NextIntlClientProvider locale={locale} messages={messages}>
            <TooltipProvider>{children}</TooltipProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
