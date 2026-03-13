import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata: Metadata = {
  title: "Impressum — KILN",
};

export default function ImpressumPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0C0A09] text-neutral-200">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded font-serif text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              K
            </div>
            <span className="font-serif text-base">KILN</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="font-serif text-4xl text-white">Impressum</h1>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-neutral-400">
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Angaben gemäß § 5 DDG
            </h2>
            <p className="text-neutral-300">
              André Bäcker<br />
              KILN — ein Projekt von Hephaistos Systems<br />
              Alicenstraße 48<br />
              35390 Gießen<br />
              Deutschland
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Kontakt
            </h2>
            <p className="text-neutral-300">
              Telefon: +49 (0) 176 21878801<br />
              E-Mail:{" "}
              <a href="mailto:hello@kiln.ai" className="text-[#F97316] hover:underline">
                hello@kiln.ai
              </a>
            </p>
          </section>

          <section>
            <p className="text-neutral-300">
              USt-IdNr. gemäß § 27a UStG: DE459461407
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
            </h2>
            <p className="text-neutral-300">
              André Bäcker<br />
              Alicenstraße 48<br />
              35390 Gießen
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Haftung für Inhalte
            </h2>
            <p>
              Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die
              Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine
              Gewähr übernehmen. Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene
              Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8
              bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder
              gespeicherte fremde Informationen zu überwachen.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Haftung für Links
            </h2>
            <p>
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir
              keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige
              Anbieter verantwortlich.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Urheberrecht
            </h2>
            <p>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
              unterliegen dem deutschen Urheberrecht.
            </p>
          </section>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
