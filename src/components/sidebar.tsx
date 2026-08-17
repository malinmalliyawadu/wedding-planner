import { count } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { LogOut, Settings } from "lucide-react";
import { signOut } from "@/app/admin/access/actions";
import { db } from "@/db";
import { guests, households, tables } from "@/db/schema";
import { getSettings } from "@/lib/queries";
import { daysUntilNZ, formatDateLong } from "@/lib/dates";
import { Duogram } from "./duogram";
import { NavList } from "./nav-list";

export async function Sidebar() {
  // Render at request time, never at build time: the build environment
  // has no database (see Dockerfile), and counts must be fresh anyway.
  await connection();

  const [settings, [guestCount], [householdCount], [tableCount]] =
    await Promise.all([
      getSettings(),
      db.select({ n: count() }).from(guests),
      db.select({ n: count() }).from(households),
      db.select({ n: count() }).from(tables),
    ]);

  const days =
    settings.weddingDate !== null ? daysUntilNZ(settings.weddingDate) : null;

  return (
    <>
      <div className="px-6 pt-8 pb-6">
        <Duogram a={settings.partnerAName} b={settings.partnerBName} />
        <p className="mt-4 font-display text-xl leading-snug">
          {settings.partnerAName}{" "}
          <span className="text-brass-bright">&amp;</span>{" "}
          {settings.partnerBName}
        </p>
        {settings.weddingDate !== null && (
          <p className="mt-1 text-xs text-spine-ink-soft">
            {formatDateLong(settings.weddingDate)}
          </p>
        )}
      </div>

      <div className="mx-6 border-t border-spine-hairline" />

      <NavList
        counts={{
          guests: guestCount.n,
          households: householdCount.n,
          tables: tableCount.n,
        }}
      />

      <div className="mt-auto px-6 pb-8">
        <div className="flex items-end justify-between gap-3 border-t border-spine-hairline pt-5">
          {days !== null && days >= 0 ? (
            <p className="text-xs text-spine-ink-soft">
              <span className="figures text-2xl text-spine-ink">{days}</span>
              <span className="ml-2 eyebrow tracking-caps">
                days to go
              </span>
            </p>
          ) : (
            <p className="eyebrow text-spine-ink-soft">The Wedding Ledger</p>
          )}
          {/* Settled to the right so the countdown keeps the left edge. */}
          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              href="/admin/settings"
              aria-label="Settings"
              title="Settings"
              className="rounded-md p-1.5 text-spine-ink-soft transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink pointer-coarse:p-2.5"
            >
              <Settings size={16} strokeWidth={1.75} aria-hidden />
            </Link>
            {/*
             * A plain form, so signing out needs no JavaScript and cannot
             * be triggered by a GET - a bare link here would let any page
             * that could get an <img> in front of you log you out.
             */}
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="rounded-md p-1.5 text-spine-ink-soft transition-colors duration-150 hover:bg-spine-raised hover:text-spine-ink pointer-coarse:p-2.5"
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

/** The couple's mark and names, for the phone header. */
export async function SpineBrand() {
  await connection();
  const settings = await getSettings();
  return (
    <p className="flex min-w-0 items-center gap-2">
      <Duogram
        a={settings.partnerAName}
        b={settings.partnerBName}
        size="sm"
      />
      <span className="truncate font-display text-base">
        {settings.partnerAName}{" "}
        <span className="text-brass-bright">&amp;</span>{" "}
        {settings.partnerBName}
      </span>
    </p>
  );
}
