import { ArrowUpRight, BookOpen, MapPin } from "lucide-react";

export default function MoBistroMenuCard() {
  return (
    <aside className="overflow-hidden rounded-[26px] border border-[#DED6C8] bg-[#34382E] text-[#F9F4E9] shadow-[0_14px_35px_rgba(44,43,34,0.08)]">
      <div className="relative overflow-hidden px-7 pb-8 pt-9 sm:px-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-[#D6B681]/20"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-[#D6B681]/20"
        />

        <div className="relative">
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D6B681]">
            Something to look forward to
          </span>

          <BookOpen
            size={29}
            strokeWidth={1.4}
            className="mt-7 text-[#D6B681]"
          />

          <h2 className="mt-5 max-w-[300px] font-serif text-[34px] leading-[1.12] tracking-[-0.035em]">
            Good food
            <br />
            is worth the wait.
          </h2>

          <p className="mt-4 max-w-[300px] text-[13px] leading-6 text-[#E0DDCF]/80">
            While we get your table ready, take a little peek at
            what&apos;s waiting for you at Mo Bistro.
          </p>

          <a
            href="/menu"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 flex w-full items-center justify-between rounded-xl bg-[#D6B681] px-5 py-4 text-[13px] font-semibold text-[#2C3028] transition hover:bg-[#E8C997]"
          >
            Explore our menu
            <ArrowUpRight size={18} />
          </a>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[#F5EBD5]/15 px-7 py-5 text-[12px] text-[#DAD4C5] sm:px-9">
        <MapPin size={15} className="text-[#D6B681]" />
        Mo Bistro · District 5
      </div>
    </aside>
  );
}
