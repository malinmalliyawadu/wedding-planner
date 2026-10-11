/**
 * A pretend djay, for trying the whole loop without the laptop: requests
 * go into a queue, each "plays" for `songSeconds`, and Skip moves on at
 * once. When its own queue runs dry it plays something nobody asked for,
 * the way a DJ fills a gap, so the app's handling of that gets exercised
 * too.
 */
export function fakeDriver({ songSeconds = 20, log = console.log } = {}) {
  const queue = [];
  let current = null;
  let startedAt = 0;
  let filler = 0;

  function advance() {
    current = queue.shift() ?? { title: `DJ's choice ${++filler}`, artist: "The House Band" };
    startedAt = Date.now();
    log(`[fake] on air: ${current.title}`);
  }

  return {
    name: `fake (${songSeconds}s songs)`,
    canReadDecks: true,
    async cue(song) {
      // A song called "missing" is never found, to exercise the fallback.
      if (/missing/i.test(song.title)) return { ok: false, note: "fake djay never finds a song called missing" };
      queue.push({ title: song.title, artist: song.artist });
      log(`[fake] queued: ${song.title}`);
      return { ok: true };
    },
    async skip() {
      log(`[fake] skip`);
      advance();
    },
    async nowPlaying() {
      if (current === null || Date.now() - startedAt > songSeconds * 1000) advance();
      return current;
    },
  };
}
