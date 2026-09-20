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

export function veilCopy(level: SpoilerLevel, dramaTitle?: string, season?: number, episode?: number, multiSeason = false): string {
  const ep = episode ? `${multiSeason && season ? `S${season} ` : ''}Episode ${episode}` : undefined;
  switch (level) {
    case 'episode':
      return ep ? `Spoiler for ${ep}${dramaTitle ? ` of ${dramaTitle}` : ''}` : `Episode spoiler${dramaTitle ? ` · ${dramaTitle}` : ''}`;
    case 'season':
      return `Season${season && multiSeason ? ` ${season}` : ''} spoiler${dramaTitle ? ` · ${dramaTitle}` : ''}`;
    case 'ending':
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
