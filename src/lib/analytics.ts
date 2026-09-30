/**
 * First-party product analytics. Events go straight into the `events` table
 * (insert-only for visitors; only the admin account can read them).
 */
import { supabase } from "@/integrations/supabase/client";

const VID_KEY = "reeler_vid";
const FIRST_KEY = "reeler_first_touch";
const LINKED_KEY = "reeler_linked_user";

type FirstTouch = {
  referrer: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  landing_path: string;
  first_seen: string;
};

let userId: string | null = null;
let started = false;

function isBrowser() {
  return typeof window !== "undefined";
}

export function getVisitorId(): string {
  if (!isBrowser()) return "server";
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-visitor";
  }
}

function getFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(FIRST_KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

/** Record where this visitor first came from (only once, ever). */
function captureFirstTouch(): FirstTouch | null {
  if (getFirstTouch()) return null;
  const params = new URLSearchParams(window.location.search);
  let host: string | null = null;
  const ref = document.referrer || null;
  try {
    if (ref) host = new URL(ref).hostname;
    if (host === window.location.hostname) host = null;
  } catch {
    host = null;
  }
  const touch: FirstTouch = {
    referrer: host ? ref : null,
    referrer_host: host,
    utm_source: params.get("utm_source"),
    utm_campaign: params.get("utm_campaign"),
    landing_path: window.location.pathname,
    first_seen: new Date().toISOString(),
  };
  try {
    localStorage.setItem(FIRST_KEY, JSON.stringify(touch));
  } catch {
    /* ignore */
  }
  return touch;
}

export function track(event_name: string, properties: Record<string, unknown> = {}) {
  if (!isBrowser()) return;
  const first = getFirstTouch();
  const props = {
    ...properties,
    first_source: first?.utm_source ?? first?.referrer_host ?? null,
    first_campaign: first?.utm_campaign ?? null,
  };
  void supabase
    .from("events")
    .insert({ visitor_id: getVisitorId(), user_id: userId, event_name, properties: props as never })
    .then(({ error }) => {
      if (error) console.warn("analytics:", error.message);
    });
}

/** Call once on app start. Sets up first-touch + visitor↔user linking. */
export function initAnalytics() {
  if (!isBrowser() || started) return;
  started = true;
  getVisitorId();
  const touch = captureFirstTouch();
  if (touch) track("first_visit", touch);

  const link = (uid: string | null, event?: string) => {
    userId = uid;
    if (!uid) return;
    let linked: string | null = null;
    try {
      linked = localStorage.getItem(LINKED_KEY);
    } catch {
      /* ignore */
    }
    if (linked !== uid) {
      track("identify", { ...(getFirstTouch() ?? {}) });
      try {
        localStorage.setItem(LINKED_KEY, uid);
      } catch {
        /* ignore */
      }
    }
    // A brand-new account that just got its first session = signup completed.
    if (event === "SIGNED_IN") {
      void supabase.auth.getUser().then(({ data }) => {
        const u = data.user;
        if (!u) return;
        const age = Date.now() - new Date(u.created_at).getTime();
        const key = `reeler_signup_done_${u.id}`;
        if (age < 10 * 60_000 && !localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          track("signup_completed", { method: u.app_metadata?.provider ?? "email" });
        }
      });
    }
  };

  void supabase.auth.getSession().then(({ data }) => link(data.session?.user.id ?? null, "SIGNED_IN"));
  supabase.auth.onAuthStateChange((event, session) => {
    link(session?.user.id ?? null, event);
  });
}

export function trackPageView(path: string) {
  track("page_view", { path, referrer: document.referrer || null });
}
