/**
 * Hallyu content model — see docs/design/02-content-model-and-rules.md
 */
export type ID = string;

export type SpoilerLevel = 'none' | 'episode' | 'season' | 'ending';
export type SpoilerProtection = 'strict' | 'balanced' | 'off';
export type WatchStatus = 'want' | 'watching' | 'completed' | 'dropped';
export type DramaStatus = 'upcoming' | 'airing' | 'completed';
export type PostType = 'post' | 'reaction' | 'discussion' | 'review' | 'recommendation' | 'short';
export type DiscussionKind = 'general' | 'theory' | 'ending' | 'character' | 'scene' | 'question';
export type ReactionKind = 'loved' | 'cried' | 'screamed' | 'swooned' | 'laughed' | 'furious';
export type NotificationGroup = 'social' | 'drama' | 'mentions' | 'system';
export type Visibility = 'public' | 'private';

export const REACTIONS: { kind: ReactionKind; label: string; glyph: string }[] = [
  { kind: 'loved', label: 'Loved', glyph: '♥' },
  { kind: 'cried', label: 'Cried', glyph: '💧' },
  { kind: 'screamed', label: 'Screamed', glyph: '⚡' },
  { kind: 'swooned', label: 'Swooned', glyph: '✿' },
  { kind: 'laughed', label: 'Laughed', glyph: '☺' },
  { kind: 'furious', label: 'Furious', glyph: '✖' },
];

export type ReactionCounts = Record<ReactionKind, number>;
export const emptyReactions = (): ReactionCounts => ({ loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0 });

export interface User {
  id: ID;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  favoriteGenres: string[];
  favoriteDramaIds: ID[];
  followers: number;
  following: number;
  joinedAt: string;
  verified?: boolean;
  isPrivate?: boolean;
}

export interface Episode {
  id: ID;
  dramaId: ID;
  season: number;
  number: number;
  title?: string;
  airDate?: string; // ISO
  runtime?: number; // minutes
  synopsis?: string;
  stillUrl?: string;
}

export interface Season {
  number: number;
  name?: string;
  year?: number;
  episodeCount: number;
}

export interface CastCredit {
  actorId: ID;
  role: string;
  order: number;
}

export interface Drama {
  id: ID; // slug
  title: string;
  originalTitle?: string;
  year: number;
  endYear?: number;
  status: DramaStatus;
  network?: string;
  streamingOn?: string[];
  genres: string[];
  tags?: string[];
  synopsis: string;
  posterUrl?: string;
  posterLocal?: number; // require()
  backdropUrl?: string;
  tone: string; // fallback poster colour
  rating?: number; // community 1–10
  episodeCount: number;
  seasons: Season[];
  episodes: Episode[];
  cast: CastCredit[];
  creators?: string[];
  airsOn?: string; // e.g. "Sat–Sun 21:20 KST"
  nextEpisodeAt?: string; // ISO
  followerCount: number;
  provider?: { name: 'tmdb'; id: number };
}

export interface Actor {
  id: ID;
  name: string;
  koreanName?: string;
  photoUrl?: string;
  birthDate?: string;
  bio?: string;
  knownFor: ID[];
  followerCount: number;
  provider?: { name: 'tmdb'; id: number };
}

export interface PostContext {
  dramaId?: ID;
  season?: number;
  episode?: number; // episode number within season
  actorIds?: ID[];
  secondaryDramaId?: ID; // "if you liked …" for recommendations
}

export interface Post {
  id: ID;
  type: PostType;
  authorId: ID;
  createdAt: string;
  editedAt?: string;
  body: string;
  title?: string; // discussion
  kind?: DiscussionKind; // discussion
  rating?: number; // review 1–10
  verdict?: string; // review one-liner
  images?: (string | number)[];
  video?: { url: string; poster?: string | number; duration: number };
  spoiler: SpoilerLevel;
  context: PostContext;
  hashtags: string[];
  mentions: ID[];
  reactions: ReactionCounts;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  /** pending/failed = waiting for / rejected by the backend (only ever true for your own content) */
  state?: 'active' | 'deleted' | 'hidden' | 'pending' | 'failed';
}

export interface Comment {
  id: ID;
  postId: ID;
  authorId: ID;
  parentId?: ID; // one level of threading
  replyToUserId?: ID;
  body: string;
  createdAt: string;
  spoiler: SpoilerLevel;
  reactions: ReactionCounts;
  state?: 'active' | 'deleted' | 'hidden' | 'pending' | 'failed';
}

export interface WatchlistItem {
  dramaId: ID;
  status: WatchStatus;
  season: number;
  currentEpisode: number; // last watched episode number (0 = none)
  note?: string;
  addedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CollectionItem {
  dramaId: ID;
  note?: string;
  addedAt: string;
}

export interface Collection {
  id: ID;
  ownerId: ID;
  title: string;
  description?: string;
  visibility: Visibility;
  items: CollectionItem[];
  followerCount: number;
  updatedAt: string;
}

export interface Notification {
  id: ID;
  group: NotificationGroup;
  kind:
    | 'reaction'
    | 'comment'
    | 'reply'
    | 'follow'
    | 'mention'
    | 'episode_aired'
    | 'episode_live'
    | 'drama_trending'
    | 'collection_saved'
    | 'system';
  actorIds?: ID[];
  postId?: ID;
  commentId?: ID;
  dramaId?: ID;
  episode?: number;
  collectionId?: ID;
  title?: string;
  body?: string;
  createdAt: string;
  read: boolean;
}

export interface Draft {
  id: ID;
  type: PostType;
  updatedAt: string;
  title?: string;
  body: string;
  rating?: number;
  verdict?: string;
  kind?: DiscussionKind;
  spoiler: SpoilerLevel;
  context: PostContext;
  images: string[];
}

export const LIMITS = {
  post: 1000,
  reaction: 140,
  discussionTitle: 90,
  discussionBody: 5000,
  reviewVerdict: 120,
  reviewBody: 5000,
  recommendation: 500,
  shortCaption: 300,
  comment: 1000,
  images: 4,
  actors: 3,
  bio: 160,
  displayName: 40,
  collectionTitle: 60,
  collectionDescription: 240,
  note: 200,
  editWindowMs: 15 * 60 * 1000,
} as const;

export const GENRES = [
  'Romance',
  'Thriller',
  'Fantasy',
  'Comedy',
  'Melodrama',
  'Crime',
  'Historical',
  'Slice of life',
  'Mystery',
  'Action',
  'Medical',
  'Legal',
  'Youth',
  'Family',
  'Horror',
  'Sci-fi',
] as const;

export type Genre = (typeof GENRES)[number];
