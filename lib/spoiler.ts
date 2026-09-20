import { Drama, Post, Comment, SpoilerLevel, SpoilerProtection, WatchlistItem } from './model';

export interface Viewer {
  protection: SpoilerProtection;
  watchlist: Record<string, WatchlistItem | undefined>;
  revealed: Record<string, true | undefined>;
}

export const SPOILER_LABEL: Record<SpoilerLevel, string> = {
  none: 'No spoilers',
  episode: 'Episode spoiler',
  season: 'Season spoiler',
  ending: 'Ending spoiler',
};

export const SPOILER_HELP: Record<SpoilerLevel, string> = {
  none: 'Safe for anyone, including people who have not started.',
  episode: 'Reveals something from a specific episode. Hidden from people who have not reached it.',
  season: 'Reveals something from anywhere in the season. Hidden until the season is finished.',
  ending: 'Reveals how it ends. Hidden from everyone who has not completed the drama.',
};

/**
 * What the veil says. It names the spoiler precisely and, when we know where you are, why it is
 * hidden from *you* — "Spoiler for Episode 8 — you’re on Episode 5" earns more trust than a generic
 * warning, and tells you exactly how far to watch before tapping Reveal.
 */
export function veilCopy(
  level: SpoilerLevel,
  dramaTitle?: string,
  season?: number,
  episode?: number,
  multiSeason = false,
  progress?: Pick<WatchlistItem, 'status' | 'season' | 'currentEpisode'>,
): string {
  const ep = episode ? `${multiSeason && season ? `S${season} ` : ''}Episode ${episode}` : undefined;
  const at =
    progress && progress.status === 'watching'
      ? progress.currentEpisode
        ? `you’re on ${multiSeason ? `S${progress.season} ` : ''}Episode ${progress.currentEpisode}`
        : 'you haven’t started yet'
      : undefined;
  const want = progress?.status === 'want';
  switch (level) {
    case 'episode':
      if (ep && at && (!multiSeason || progress!.season === season)) return `Spoiler for ${ep} — ${at}`;
      if (ep && want) return `Spoiler for ${ep} — ${dramaTitle ?? 'this drama'} is on your watchlist`;
      return ep ? `Spoiler for ${ep}${dramaTitle ? ` of ${dramaTitle}` : ''}` : `Episode spoiler${dramaTitle ? ` · ${dramaTitle}` : ''}`;
    case 'season': {
      const label = `Season${season && multiSeason ? ` ${season}` : ''} spoiler`;
      if (at) return `${label} — ${at}`;
      if (want) return `${label} — ${dramaTitle ?? 'this drama'} is on your watchlist`;
      return `${label}${dramaTitle ? ` · ${dramaTitle}` : ''}`;
    }
    case 'ending':
      if (at) return `Ending spoiler — ${at}`;
      if (want) return `Ending spoiler — finish ${dramaTitle ?? 'it'} first`;
      return `Ending spoiler${dramaTitle ? ` · ${dramaTitle}` : ''}`;
    default:
      return '';
  }
}

/**
 * The veil rule (docs/design/02 §3.3):
 *  - none → never veiled
 *  - protection off → never veiled
 *  - completed / dropped → never veiled
 *  - watching → veiled when the spoiler is beyond current progress (episode), season not finished (season), or always (ending)
 *  - want → all spoilers veiled
 *  - not tracked → veiled only in Strict mode (Balanced trusts you; Strict protects you)
 */
export function isVeiled(item: Pick<Post, 'spoiler' | 'context'> | Pick<Comment, 'spoiler'>, dramaId: string | undefined, viewer: Viewer, drama?: Drama, idForReveal?: string): boolean {
  if (item.spoiler === 'none') return false;
  if (viewer.protection === 'off') return false;
  if (idForReveal && viewer.revealed[idForReveal]) return false;
  const wl = dramaId ? viewer.watchlist[dramaId] : undefined;
  if (!wl) return viewer.protection === 'strict';
  if (wl.status === 'completed' || wl.status === 'dropped') return false;
  if (wl.status === 'want') return true;
  // watching
  const ctx = 'context' in item ? item.context : undefined;
  const season = ctx?.season ?? 1;
  const episode = ctx?.episode;
  if (item.spoiler === 'ending') return true;
  if (item.spoiler === 'season') {
    if (season < wl.season) return false;
    if (season > wl.season) return true;
    const count = drama?.seasons.find((s) => s.number === season)?.episodeCount ?? drama?.episodeCount ?? 0;
    return wl.currentEpisode < count;
  }
  // episode
  if (season < wl.season) return false;
  if (season > wl.season) return true;
  return episode !== undefined && episode > wl.currentEpisode;
}

/** Has the viewer watched a given episode (for the Episode gate)? */
export function hasWatched(wl: WatchlistItem | undefined, season: number, episode: number): boolean {
  if (!wl) return false;
  if (wl.status === 'completed') return true;
  if (season < wl.season) return true;
  if (season > wl.season) return false;
  return wl.currentEpisode >= episode;
}

/**
 * A soft safety net for the composer: if the text reads like a spoiler but no level is set, suggest
 * one. Heuristic on purpose — it nudges, never blocks. Returns null when nothing looks risky.
 */
export function suggestSpoilerLevel(text: string, ctx: { episode?: number; totalEpisodes?: number } = {}): { level: Exclude<SpoilerLevel, 'none'>; reason: string } | null {
  const t = text.toLowerCase();
  if (t.length < 12) return null;
  if (/\b(finale|final episode|last episode|the ending|ending was|how it ends|ends with|dies at the end|end of the show|last ep)\b/.test(t))
    return { level: 'ending', reason: 'This talks about how it ends.' };
  const nums = [...t.matchAll(/\b(?:ep|episode|e)\.?\s*(\d{1,3})\b/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 200);
  const max = nums.length ? Math.max(...nums) : 0;
  if (max && ctx.totalEpisodes && max >= ctx.totalEpisodes) return { level: 'ending', reason: `Episode ${max} is the last one.` };
  if (max && (!ctx.episode || max > ctx.episode)) return { level: 'episode', reason: `You mention Episode ${max}.` };
  if (/\b(dies|died|killed|death|murderer|the killer is|turns out|plot twist|twist was|reveal(ed)? that|is actually|secretly|breaks? up|gets? married|pregnant|betray(s|ed)?)\b/.test(t))
    return { level: ctx.episode ? 'episode' : 'season', reason: 'This sounds like a plot reveal.' };
  return null;
}
