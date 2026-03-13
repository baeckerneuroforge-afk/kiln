import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-6 w-6 items-center justify-center rounded font-serif text-[10px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
          >
            K
          </div>
          <span className="font-serif text-sm">KILN</span>
          <span className="text-xs text-neutral-600">by Hephaistos Systems</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-neutral-600">
          <Link href="/impressum" className="transition-colors hover:text-neutral-300">Impressum</Link>
          <Link href="/privacy" className="transition-colors hover:text-neutral-300">Privacy</Link>
          <Link href="/terms" className="transition-colors hover:text-neutral-300">Terms</Link>
          <span>&copy; {new Date().getFullYear()} Hephaistos Systems</span>
        </div>
      </div>
    </footer>
  );
}
