import { BookOpen, Download, UtensilsCrossed } from "lucide-react";
export default function MenuPage() {
  return (
    <main className="guest-menu-page">
      <header>
        <UtensilsCrossed size={30} />
        <span>MO BISTRO</span>
      </header>
      <div className="guest-menu-heading">
        <div>
          <h1>Something delicious awaits.</h1>
          <p>Explore the Mo Bistro menu.</p>
        </div>
        <div className="guest-menu-actions">
          <a
            href="/menus/mo-bistro-menu.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen size={18} /> Open menu
          </a>
          <a href="/menus/mo-bistro-menu.pdf" download>
            <Download size={18} /> Download PDF
          </a>
        </div>
      </div>
      <section className="guest-menu-pages" aria-label="Mo Bistro menu pages">
        <p className="guest-small-note">
          Browse the menu below. Tap a page to view it full size, or open the
          PDF above.
        </p>
        {Array.from({ length: 27 }, (_, index) => (
          <figure key={index}>
            <a
              href={`/menus/menu-page-${String(index + 1).padStart(2, "0")}.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open menu page ${index + 1} full size`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Static PDF renditions; no external image service is required. */}
              <img
                src={`/menus/menu-page-${String(index + 1).padStart(2, "0")}.jpg`}
                width={1400}
                height={2126}
                alt={`Mo Bistro menu, page ${index + 1} of 27`}
                loading={index === 0 ? "eager" : "lazy"}
              />
            </a>
            <figcaption>Page {index + 1} of 27</figcaption>
          </figure>
        ))}
      </section>
      <footer>
        Mo Bistro · District 5 <a href="/join">Join the waitlist</a>
      </footer>
    </main>
  );
}
