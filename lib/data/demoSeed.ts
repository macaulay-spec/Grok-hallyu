/**
 * Demo content for the frontend-only build.
 *
 * The app no longer talks to a server, so the social half of Hallyu (feeds, threads, profiles,
 * collections, activity) is composed from these fixtures instead of pulled from a database. The
 * drama/actor catalog is NOT faked here: it still comes from TMDB live (lib/catalog.ts), and the
 * four classics below carry their real TMDB provider ids so a live catalog result resolves onto
 * these richer local records instead of producing a duplicate card.
 *
 * Everything is a plain function of "now" so a fresh install always reads as a live product rather
 * than a screenshot: post ages, unread activity and thread ordering are all relative to first run.
 */
import { Actor, Collection, Comment, Drama, Episode, Notification, Post, ReactionCounts, User, WatchlistItem } from '../model';
import { AppState, freshMemberState } from '../store';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** ISO timestamp `ms` in the past — fixtures age with the reader, they never expire. */
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

/** Reaction counts with only the meaningful keys set. */
const rx = (o: Partial<ReactionCounts> = {}): ReactionCounts => ({ loved: 0, cried: 0, screamed: 0, swooned: 0, laughed: 0, furious: 0, ...o });

/** Weekly episode slot (Korean dramas air two episodes a week; one is enough for a demo schedule). */
function weekly(dramaId: string, season: number, count: number, startIso: string, runtime = 65): Episode[] {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, i) => ({
    id: `${dramaId}-s${season}e${i + 1}`,
    dramaId,
    season,
    number: i + 1,
    title: `Episode ${i + 1}`,
    airDate: new Date(start + i * WEEK).toISOString(),
    runtime,
  }));
}

/**
 * The four titles the app already ships poster artwork for (assets/dramas). Keeping them as rich
 * local records means the demo has real art, real casts and real episode schedules with no network
 * — and because each carries its TMDB id, the live catalog enriches them rather than duplicating them.
 */
export const DEMO_ACTORS: Actor[] = [
  { id: 'a-hyunbin', name: 'Hyun Bin', koreanName: '현빈', knownFor: ['demo-cloy'], followerCount: 41_200, bio: 'One of the defining leading men of modern Korean television.' },
  { id: 'a-yejin', name: 'Son Ye-jin', koreanName: '손예진', knownFor: ['demo-cloy'], followerCount: 38_900, bio: 'Romance and melodrama lead with a decade of hit dramas behind her.' },
  { id: 'a-songhyekyo', name: 'Song Hye-kyo', koreanName: '송혜교', knownFor: ['demo-glory'], followerCount: 52_400, bio: 'A career built on quiet, exacting performances across romance and revenge drama.' },
  { id: 'a-dohyun', name: 'Lee Do-hyun', koreanName: '이도현', knownFor: ['demo-glory'], followerCount: 29_700, bio: 'Genre-hopping actor known for emotionally raw supporting and lead roles.' },
  { id: 'a-gongyoo', name: 'Gong Yoo', koreanName: '공유', knownFor: ['demo-goblin'], followerCount: 47_100, bio: 'Film and television lead whose fantasy roles became fandom touchstones.' },
  { id: 'a-goeun', name: 'Kim Go-eun', koreanName: '김고은', knownFor: ['demo-goblin'], followerCount: 33_500, bio: 'Critically praised for grounded, unshowy character work.' },
  { id: 'a-dongwook', name: 'Lee Dong-wook', koreanName: '이동욱', knownFor: ['demo-goblin'], followerCount: 35_800, bio: 'A comic and romantic lead with unusually sharp timing.' },
  { id: 'a-hyoseop', name: 'Ahn Hyo-seop', koreanName: '안효섭', knownFor: ['demo-proposal'], followerCount: 24_300, bio: 'Romantic comedy lead and one of the newer generation of K-drama stars.' },
  { id: 'a-sejeong', name: 'Kim Se-jeong', koreanName: '김세정', knownFor: ['demo-proposal'], followerCount: 26_900, bio: 'Singer turned actor, best known for bright comic heroines.' },
];

export const DEMO_DRAMAS: Drama[] = [
  {
    id: 'demo-cloy',
    title: 'Crash Landing on You',
    originalTitle: '사랑의 불시착',
    year: 2019,
    endYear: 2020,
    status: 'completed',
    network: 'tvN',
    streamingOn: ['Netflix'],
    genres: ['Romance', 'Melodrama', 'Comedy'],
    tags: ['chaebol', 'slow burn', 'north korea', 'found family'],
    synopsis:
      'A South Korean heiress is swept off course by a paragliding accident and lands in North Korea, where a soldier chooses to hide her rather than turn her in.',
    tone: '#2F3A46',
    rating: 8.7,
    episodeCount: 16,
    seasons: [{ number: 1, episodeCount: 16, year: 2019 }],
    episodes: weekly('demo-cloy', 1, 16, '2019-12-14T12:00:00Z', 70),
    cast: [
      { actorId: 'a-hyunbin', role: 'Ri Jeong-hyeok', order: 0 },
      { actorId: 'a-yejin', role: 'Yoon Se-ri', order: 1 },
    ],
    creators: ['Park Ji-eun'],
    airsOn: 'Sat–Sun 21:00 KST',
    followerCount: 184_300,
    posterLocal: require('../../assets/dramas/cloy.png'),
    provider: { name: 'tmdb', id: 94796 },
  },
  {
    id: 'demo-goblin',
    title: 'Guardian: The Lonely and Great God',
    originalTitle: '쓸쓸하고 찬란하神 – 도깨비',
    year: 2016,
    endYear: 2017,
    status: 'completed',
    network: 'tvN',
    streamingOn: ['Netflix', 'Viki'],
    genres: ['Fantasy', 'Romance', 'Melodrama'],
    tags: ['immortal', 'reincarnation', 'slow burn', 'found family', 'supernatural'],
    synopsis:
      'An immortal goblin cursed to live forever searches for the human bride who can end his life, while sharing a house with an amnesiac grim reaper.',
    tone: '#3A3348',
    rating: 8.9,
    episodeCount: 16,
    seasons: [{ number: 1, episodeCount: 16, year: 2016 }],
    episodes: weekly('demo-goblin', 1, 16, '2016-12-02T12:00:00Z', 75),
    cast: [
      { actorId: 'a-gongyoo', role: 'Kim Shin', order: 0 },
      { actorId: 'a-goeun', role: 'Ji Eun-tak', order: 1 },
      { actorId: 'a-dongwook', role: 'Grim Reaper', order: 2 },
    ],
    creators: ['Kim Eun-sook'],
    airsOn: 'Fri–Sat 20:00 KST',
    followerCount: 152_800,
    posterLocal: require('../../assets/dramas/goblin.png'),
    provider: { name: 'tmdb', id: 67915 },
  },
  {
    id: 'demo-glory',
    title: 'The Glory',
    originalTitle: '더 글로리',
    year: 2022,
    endYear: 2023,
    status: 'completed',
    network: 'Netflix',
    streamingOn: ['Netflix'],
    genres: ['Thriller', 'Melodrama', 'Crime'],
    tags: ['revenge', 'slow burn', 'school violence', 'adult'],
    synopsis:
      'A woman whose life was destroyed by high-school bullies rebuilds herself around one plan: to reach the perpetrators as an adult and take everything from them.',
    tone: '#3C2A2E',
    rating: 8.5,
    episodeCount: 16,
    seasons: [
      { number: 1, episodeCount: 8, year: 2022, name: 'Part 1' },
      { number: 2, episodeCount: 8, year: 2023, name: 'Part 2' },
    ],
    episodes: [...weekly('demo-glory', 1, 8, '2022-12-30T12:00:00Z', 50), ...weekly('demo-glory', 2, 8, '2023-03-10T12:00:00Z', 50)],
    cast: [
      { actorId: 'a-songhyekyo', role: 'Moon Dong-eun', order: 0 },
      { actorId: 'a-dohyun', role: 'Joo Yeo-jeong', order: 1 },
    ],
    creators: ['Kim Eun-sook'],
    followerCount: 131_600,
    posterLocal: require('../../assets/dramas/glory.png'),
    provider: { name: 'tmdb', id: 136283 },
  },
  {
    id: 'demo-proposal',
    title: 'A Business Proposal',
    originalTitle: '사내맞선',
    year: 2022,
    status: 'completed',
    network: 'SBS',
    streamingOn: ['Netflix'],
    genres: ['Romance', 'Comedy'],
    tags: ['office romance', 'fake dating', 'light', 'enemies to lovers'],
    synopsis:
      'A researcher goes on a blind date disguised as her friend, only to discover the man across the table is the CEO of her own company.',
    tone: '#46323A',
    rating: 8.1,
    episodeCount: 12,
    seasons: [{ number: 1, episodeCount: 12, year: 2022 }],
    episodes: weekly('demo-proposal', 1, 12, '2022-02-28T12:00:00Z', 62),
    cast: [
      { actorId: 'a-hyoseop', role: 'Kang Tae-moo', order: 0 },
      { actorId: 'a-sejeong', role: 'Shin Ha-ri', order: 1 },
    ],
    followerCount: 96_400,
    posterLocal: require('../../assets/dramas/proposal.png'),
    provider: { name: 'tmdb', id: 154825 },
  },
];

/** Creators who author the seeded posts. `id`s are stable so threads survive a re-seed. */
export const DEMO_USERS: User[] = [
  {
    id: 'u-haneul',
    handle: 'haneul',
    displayName: 'Haneul',
    bio: 'Slow burns and sad endings. 도깨비 is a personality, not a preference.',
    favoriteGenres: ['Fantasy', 'Romance', 'Melodrama'],
    favoriteDramaIds: ['demo-goblin', 'demo-cloy'],
    followers: 4_820,
    following: 132,
    joinedAt: ago(420 * DAY),
    verified: true,
  },
  {
    id: 'u-mina',
    handle: 'minawatches',
    displayName: 'Mina',
    bio: 'Revenge drama apologist. I will defend the second half of everything.',
    favoriteGenres: ['Thriller', 'Crime', 'Mystery'],
    favoriteDramaIds: ['demo-glory'],
    followers: 2_310,
    following: 88,
    joinedAt: ago(300 * DAY),
  },
  {
    id: 'u-tae',
    handle: 'taelog',
    displayName: 'Tae',
    bio: 'Episode-by-episode notes. Mostly wrong about the ending.',
    favoriteGenres: ['Comedy', 'Romance', 'Slice of life'],
    favoriteDramaIds: ['demo-proposal'],
    followers: 1_140,
    following: 210,
    joinedAt: ago(260 * DAY),
  },
  {
    id: 'u-jihoon',
    handle: 'jihoon',
    displayName: 'Jihoon',
    bio: 'Soundtrack first, plot second.',
    favoriteGenres: ['Melodrama', 'Romance', 'Historical'],
    favoriteDramaIds: ['demo-cloy', 'demo-goblin'],
    followers: 3_050,
    following: 74,
    joinedAt: ago(500 * DAY),
  },
  {
    id: 'u-soyeon',
    handle: 'soyeon',
    displayName: 'Soyeon',
    bio: 'Character analysis, long posts, no spoilers before you are caught up.',
    favoriteGenres: ['Fantasy', 'Thriller', 'Youth'],
    favoriteDramaIds: ['demo-glory', 'demo-goblin'],
    followers: 6_400,
    following: 61,
    joinedAt: ago(610 * DAY),
    verified: true,
  },
  {
    id: 'u-owen',
    handle: 'owensubs',
    displayName: 'Owen',
    bio: 'Subtitles changed my life. Watching from Dublin, always one episode behind.',
    favoriteGenres: ['Crime', 'Action', 'Sci-fi'],
    favoriteDramaIds: ['demo-glory'],
    followers: 880,
    following: 340,
    joinedAt: ago(150 * DAY),
  },
  {
    id: 'u-naeun',
    handle: 'naeun',
    displayName: 'Naeun',
    bio: 'Comfort dramas only, please. A real plot is optional.',
    favoriteGenres: ['Comedy', 'Romance', 'Family'],
    favoriteDramaIds: ['demo-proposal', 'demo-cloy'],
    followers: 1_620,
    following: 190,
    joinedAt: ago(120 * DAY),
  },
  {
    id: 'u-ria',
    handle: 'riadramas',
    displayName: 'Ria',
    bio: 'Watches for the second leads. They always deserved better.',
    favoriteGenres: ['Romance', 'Youth', 'Melodrama'],
    favoriteDramaIds: ['demo-cloy', 'demo-proposal'],
    followers: 2_760,
    following: 143,
    joinedAt: ago(220 * DAY),
  },
];

/**
 * The seeded feed. Deliberately mixed: discussions carry a kind and a title, reviews a rating and a
 * one-line verdict, recommendations pair two titles, and only a few posts carry a spoiler level so
 * the veil machinery is visible without turning the feed into a wall of blurs.
 */
export function demoPosts(): Post[] {
  return [
    {
      id: 'demo-p-01',
      type: 'discussion',
      authorId: 'u-soyeon',
      createdAt: ago(2 * HOUR),
      title: 'The reaper’s amnesia is the whole tragedy, not the romance',
      kind: 'theory',
      body:
        'Everyone talks about the goblin’s curse, but the reaper is the one who was punished twice: he loses his memory, then he loses the person who made him remember. Rewatch the tea room scenes knowing what he is and the whole show changes shape.',
      spoiler: 'none',
      context: { dramaId: 'demo-goblin' },
      hashtags: ['goblin', 'character', 'rewatch'],
      mentions: [],
      reactions: rx({ loved: 412, cried: 188, swooned: 96 }),
      commentCount: 3,
      saveCount: 74,
      shareCount: 21,
    },
    {
      id: 'demo-p-02',
      type: 'review',
      authorId: 'u-mina',
      createdAt: ago(5 * HOUR),
      title: 'The Glory — a revenge drama that actually respects its own patience',
      rating: 9,
      verdict: 'Revenge built as architecture, not as a montage.',
      body:
        'Most revenge dramas burn their best idea in episode four. This one spends eight hours making you understand exactly how long a plan like this takes to build, and then gives you the payoff with almost no music underneath it. The restraint is the point.',
      spoiler: 'none',
      context: { dramaId: 'demo-glory' },
      hashtags: ['theglory', 'review', 'revenge'],
      mentions: [],
      reactions: rx({ loved: 356, screamed: 84, furious: 42 }),
      commentCount: 2,
      saveCount: 121,
      shareCount: 38,
    },
    {
      id: 'demo-p-03',
      type: 'recommendation',
      authorId: 'u-haneul',
      createdAt: ago(7 * HOUR),
      body:
        'If you liked the quiet, doomed version of a fantasy romance — immortal man, mortal deadline, a house that becomes a family — start here next. Same ache, completely different flavour.',
      spoiler: 'none',
      context: { dramaId: 'demo-glory', secondaryDramaId: 'demo-goblin' },
      hashtags: ['ifYoutLiked', 'slowburn', 'fantasy'],
      mentions: [],
      reactions: rx({ loved: 268, swooned: 74, cried: 41 }),
      commentCount: 0,
      saveCount: 143,
      shareCount: 52,
    },
    {
      id: 'demo-p-04',
      type: 'discussion',
      authorId: 'u-owen',
      createdAt: ago(11 * HOUR),
      title: 'Is it worth waiting for the second part, or should I watch weekly?',
      kind: 'question',
      body:
        'Part 1 ended on something that felt like a lie and I have not stopped thinking about it. Genuinely asking: does the weekly wait make it better or should I just batch the whole thing in one go?',
      spoiler: 'episode',
      context: { dramaId: 'demo-glory', season: 1, episode: 8 },
      hashtags: ['theglory', 'watchalong'],
      mentions: ['u-mina'],
      reactions: rx({ loved: 96, laughed: 18 }),
      commentCount: 2,
      saveCount: 12,
      shareCount: 4,
    },
    {
      id: 'demo-p-05',
      type: 'reaction',
      authorId: 'u-naeun',
      createdAt: ago(14 * HOUR),
      body: 'The office scene in episode 6. That is it. That is the whole post.',
      spoiler: 'none',
      context: { dramaId: 'demo-proposal', season: 1, episode: 6 },
      hashtags: ['abusinessproposal', 'comfortwatch'],
      mentions: [],
      reactions: rx({ loved: 512, laughed: 344, swooned: 128 }),
      commentCount: 1,
      saveCount: 33,
      shareCount: 47,
    },
    {
      id: 'demo-p-06',
      type: 'review',
      authorId: 'u-jihoon',
      createdAt: ago(19 * HOUR),
      title: 'Crash Landing on You still has the best first hour in the genre',
      rating: 9,
      verdict: 'The premise is absurd and it never once apologises for it.',
      body:
        'A paragliding accident puts a chaebol heiress in the wrong country and the show commits to playing the consequences completely straight. What makes it work is that the romance never outranks the danger — the village, the soldiers, the families all get their own weight.',
      spoiler: 'none',
      context: { dramaId: 'demo-cloy' },
      hashtags: ['cloy', 'review', 'romance'],
      mentions: [],
      reactions: rx({ loved: 634, cried: 212, swooned: 187 }),
      commentCount: 1,
      saveCount: 98,
      shareCount: 64,
    },
    {
      id: 'demo-p-07',
      type: 'post',
      authorId: 'u-ria',
      createdAt: ago(22 * HOUR),
      body: 'Set up a watchlist with three titles I have been avoiding for a year. Talk me out of it before Saturday.',
      spoiler: 'none',
      context: {},
      hashtags: ['watchlist', 'help'],
      mentions: [],
      images: [require('../../assets/ui/post-01.png')],
      reactions: rx({ loved: 141, laughed: 66 }),
      commentCount: 1,
      saveCount: 18,
      shareCount: 9,
    },
    {
      id: 'demo-p-08',
      type: 'discussion',
      authorId: 'u-tae',
      createdAt: ago(26 * HOUR),
      title: 'The second lead was the actual love story and I will not be taking questions',
      kind: 'character',
      body:
        'Every time the show cut to the friend who had already decided to lose quietly, it was doing better work than the main pairing. Rewatch the scenes where nobody says anything out loud.',
      spoiler: 'none',
      context: { dramaId: 'demo-proposal' },
      hashtags: ['abusinessproposal', 'secondlead'],
      mentions: [],
      reactions: rx({ loved: 187, laughed: 92, cried: 24 }),
      commentCount: 1,
      saveCount: 27,
      shareCount: 15,
    },
    {
      id: 'demo-p-09',
      type: 'reaction',
      authorId: 'u-soyeon',
      createdAt: ago(31 * HOUR),
      body: 'I have watched the last four minutes of this episode nine times and I am not done.',
      spoiler: 'ending',
      context: { dramaId: 'demo-goblin', season: 1, episode: 16 },
      hashtags: ['goblin', 'endings'],
      mentions: [],
      reactions: rx({ cried: 498, loved: 376, screamed: 52 }),
      commentCount: 2,
      saveCount: 41,
      shareCount: 88,
    },
    {
      id: 'demo-p-10',
      type: 'post',
      authorId: 'u-haneul',
      createdAt: ago(38 * HOUR),
      body:
        'Built a collection of dramas where the couple ends up somewhere neither of them expected. Add to it, I know I am missing obvious ones.',
      spoiler: 'none',
      context: {},
      hashtags: ['collections', 'recommendations'],
      mentions: [],
      images: [require('../../assets/ui/post-02.png')],
      reactions: rx({ loved: 224, swooned: 61 }),
      commentCount: 1,
      saveCount: 156,
      shareCount: 31,
    },
    {
      id: 'demo-p-11',
      type: 'discussion',
      authorId: 'u-mina',
      createdAt: ago(2 * DAY),
      title: 'Episode 8, the reveal — was it earned, or was it a shortcut?',
      kind: 'theory',
      body:
        'I think it is earned, and I will argue the camera told us in the first ten minutes. But I want to hear the other reading, because the show does withhold one thing it did not have to withhold.',
      spoiler: 'episode',
      context: { dramaId: 'demo-glory', season: 1, episode: 8 },
      hashtags: ['theglory', 'theory', 'episode8'],
      mentions: ['u-soyeon'],
      reactions: rx({ loved: 302, screamed: 118, furious: 37 }),
      commentCount: 2,
      saveCount: 62,
      shareCount: 19,
    },
    {
      id: 'demo-p-12',
      type: 'post',
      authorId: 'u-owen',
      createdAt: ago(2 * DAY + 9 * HOUR),
      body:
        'Two years into K-dramas and I have finally stopped calling them "Korean shows" to friends. They are just shows, and most of them are better paced than what I was watching before.',
      spoiler: 'none',
      context: {},
      hashtags: ['newfan', 'kdrama'],
      mentions: [],
      reactions: rx({ loved: 388, laughed: 41, cried: 29 }),
      commentCount: 0,
      saveCount: 24,
      shareCount: 12,
    },
    {
      id: 'demo-p-13',
      type: 'recommendation',
      authorId: 'u-naeun',
      createdAt: ago(3 * DAY),
      body: 'Same energy, zero homework. If the slow burn is too slow this month, this is the one that never once makes you wait.',
      spoiler: 'none',
      context: { dramaId: 'demo-proposal', secondaryDramaId: 'demo-cloy' },
      hashtags: ['ifYoutLiked', 'light', 'comedy'],
      mentions: [],
      reactions: rx({ loved: 176, laughed: 58, swooned: 34 }),
      commentCount: 0,
      saveCount: 89,
      shareCount: 26,
    },
    {
      id: 'demo-p-14',
      type: 'reaction',
      authorId: 'u-jihoon',
      createdAt: ago(3 * DAY + 7 * HOUR),
      body: 'The moment she recognises the piano piece. Nothing else happens in the scene. Perfect.',
      spoiler: 'season',
      context: { dramaId: 'demo-cloy', season: 1, episode: 9 },
      hashtags: ['cloy'],
      mentions: [],
      reactions: rx({ cried: 421, loved: 289, swooned: 144 }),
      commentCount: 0,
      saveCount: 37,
      shareCount: 42,
    },
    {
      id: 'demo-p-15',
      type: 'discussion',
      authorId: 'u-tae',
      createdAt: ago(4 * DAY),
      title: 'Comfort dramas are a real category and nobody tracks them properly',
      kind: 'general',
      body:
        'There is a difference between a drama you rewatch and a drama you put on to feel normal again. Nobody has a shelf for the second one. I want that shelf.',
      spoiler: 'none',
      context: {},
      hashtags: ['comfortwatch', 'productwish'],
      mentions: [],
      reactions: rx({ loved: 247, laughed: 63 }),
      commentCount: 1,
      saveCount: 73,
      shareCount: 18,
    },
    {
      id: 'demo-p-16',
      type: 'review',
      authorId: 'u-naeun',
      createdAt: ago(5 * DAY),
      title: 'A Business Proposal — a romcom that knows exactly how silly it is',
      rating: 8,
      verdict: 'Light, fast, and much smarter about its own clichés than it looks.',
      body:
        'The fake-dating premise is baked into the first ten minutes and then the show just enjoys itself. Twelve episodes is the correct length for this, which is the most underrated decision anyone made.',
      spoiler: 'none',
      context: { dramaId: 'demo-proposal' },
      hashtags: ['abusinessproposal', 'review', 'romcom'],
      mentions: [],
      reactions: rx({ loved: 291, laughed: 172, swooned: 96 }),
      commentCount: 0,
      saveCount: 84,
      shareCount: 22,
    },
  ];
}

/** Threads for the posts above, so opening a discussion is not an empty room. */
export function demoComments(): Comment[] {
  return [
    {
      id: 'demo-c-01',
      postId: 'demo-p-01',
      authorId: 'u-haneul',
      body: 'The tea room is the single best device in the show and it is doing four things at once every time it appears.',
      createdAt: ago(90 * MIN),
      spoiler: 'none',
      reactions: rx({ loved: 64, cried: 22 }),
    },
    {
      id: 'demo-c-02',
      postId: 'demo-p-01',
      authorId: 'u-jihoon',
      body: 'Reaper is the only character whose ending is not a reward or a punishment. It is just rest.',
      createdAt: ago(70 * MIN),
      spoiler: 'none',
      reactions: rx({ loved: 51, cried: 37 }),
    },
    {
      id: 'demo-c-03',
      postId: 'demo-p-01',
      authorId: 'u-naeun',
      body: 'Reading this at 2am was a mistake.',
      createdAt: ago(41 * MIN),
      spoiler: 'none',
      reactions: rx({ laughed: 28 }),
    },
    {
      id: 'demo-c-04',
      postId: 'demo-p-02',
      authorId: 'u-soyeon',
      body: 'The lack of score in the final act is the whole thesis. Most shows would have put strings under it.',
      createdAt: ago(4 * HOUR),
      spoiler: 'none',
      reactions: rx({ loved: 88, screamed: 14 }),
    },
    {
      id: 'demo-c-05',
      postId: 'demo-p-02',
      authorId: 'u-owen',
      body: 'Watched it in two nights and barely slept. Agreed on the restraint.',
      createdAt: ago(3 * HOUR),
      spoiler: 'none',
      reactions: rx({ loved: 33 }),
    },
    {
      id: 'demo-c-06',
      postId: 'demo-p-04',
      authorId: 'u-mina',
      body: 'Batch it. The tone shift between the parts lands harder when you are not waiting a week for it.',
      createdAt: ago(9 * HOUR),
      spoiler: 'none',
      reactions: rx({ loved: 41 }),
    },
    {
      id: 'demo-c-07',
      postId: 'demo-p-04',
      authorId: 'u-soyeon',
      body: 'Opposite answer. The weekly wait is when the theories happen and that is half the fun.',
      createdAt: ago(8 * HOUR),
      spoiler: 'none',
      reactions: rx({ loved: 29, laughed: 11 }),
    },
    {
      id: 'demo-c-08',
      postId: 'demo-p-09',
      authorId: 'u-haneul',
      body: 'Nine times is nothing. Come back when you are at thirty and can quote the blocking.',
      createdAt: ago(28 * HOUR),
      spoiler: 'ending',
      reactions: rx({ laughed: 76, cried: 19 }),
    },
    {
      id: 'demo-c-09',
      postId: 'demo-p-09',
      authorId: 'u-jihoon',
      body: 'The last line is doing so much work. It reframes the entire first episode.',
      createdAt: ago(20 * HOUR),
      spoiler: 'ending',
      reactions: rx({ cried: 54, loved: 31 }),
    },
    {
      id: 'demo-c-10',
      postId: 'demo-p-11',
      authorId: 'u-soyeon',
      body: 'Earned. The thing it withholds is not information, it is consent to believe her. That is deliberate.',
      createdAt: ago(45 * HOUR),
      spoiler: 'episode',
      reactions: rx({ loved: 71, screamed: 26 }),
    },
    {
      id: 'demo-c-11',
      postId: 'demo-p-11',
      authorId: 'u-tae',
      body: 'Shortcut, and I say that as someone who loved the episode. The reveal does the work the script should have.',
      createdAt: ago(40 * HOUR),
      spoiler: 'episode',
      reactions: rx({ loved: 44, furious: 9 }),
    },
    {
      id: 'demo-c-12',
      postId: 'demo-p-15',
      authorId: 'u-naeun',
      body: 'A "put it on to feel normal" shelf is the feature I did not know I wanted.',
      createdAt: ago(3 * DAY + 20 * HOUR),
      spoiler: 'none',
      reactions: rx({ loved: 58 }),
    },
  ];
}

/** Public collections, so the community shelf is not empty for a brand-new member. */
export function demoCollections(): Collection[] {
  return [
    {
      id: 'demo-col-01',
      ownerId: 'u-haneul',
      title: 'Immortals who are tired',
      description: 'Fantasy leads who have been alive too long and know it.',
      visibility: 'public',
      items: [
        { dramaId: 'demo-goblin', note: 'The blueprint.', addedAt: ago(60 * DAY) },
        { dramaId: 'demo-cloy', note: 'Mortal version of the same ache.', addedAt: ago(41 * DAY) },
      ],
      followerCount: 1_284,
      updatedAt: ago(6 * DAY),
    },
    {
      id: 'demo-col-02',
      ownerId: 'u-mina',
      title: 'Patient revenge',
      description: 'Nobody in these shows is in a hurry, and that is the point.',
      visibility: 'public',
      items: [
        { dramaId: 'demo-glory', note: 'The one that set the standard.', addedAt: ago(88 * DAY) },
        { dramaId: 'demo-proposal', note: 'Palette cleanser. Trust me.', addedAt: ago(12 * DAY) },
      ],
      followerCount: 612,
      updatedAt: ago(11 * DAY),
    },
  ];
}

/** Seeded activity: a mix of unread social/drama items so the Activity tab and badge have substance. */
export function demoNotifications(): Notification[] {
  return [
    {
      id: 'demo-n-01',
      group: 'social',
      kind: 'comment',
      actorIds: ['u-haneul'],
      postId: 'demo-p-01',
      title: 'Haneul replied to your theory',
      body: 'The tea room is the single best device in the show…',
      createdAt: ago(90 * MIN),
      read: false,
    },
    {
      id: 'demo-n-02',
      group: 'social',
      kind: 'reaction',
      actorIds: ['u-soyeon', 'u-jihoon', 'u-naeun'],
      postId: 'demo-p-01',
      title: '3 people reacted to your post',
      createdAt: ago(3 * HOUR),
      read: false,
    },
    {
      id: 'demo-n-03',
      group: 'drama',
      kind: 'episode_aired',
      dramaId: 'demo-goblin',
      episode: 16,
      title: 'Guardian: The Lonely and Great God',
      body: 'Episode 16 is in the room — spoilers are veiled until you mark it watched.',
      createdAt: ago(5 * HOUR),
      read: false,
    },
    {
      id: 'demo-n-04',
      group: 'mentions',
      kind: 'mention',
      actorIds: ['u-mina'],
      postId: 'demo-p-04',
      title: 'Mina mentioned you',
      body: 'Batch it. The tone shift lands harder…',
      createdAt: ago(9 * HOUR),
      read: false,
    },
    {
      id: 'demo-n-05',
      group: 'social',
      kind: 'follow',
      actorIds: ['u-ria'],
      title: 'Ria started following you',
      createdAt: ago(20 * HOUR),
      read: true,
    },
    {
      id: 'demo-n-06',
      group: 'drama',
      kind: 'drama_trending',
      dramaId: 'demo-glory',
      title: 'The Glory is trending',
      body: 'Most-talked-about title in your fandoms this week.',
      createdAt: ago(26 * HOUR),
      read: true,
    },
    {
      id: 'demo-n-07',
      group: 'social',
      kind: 'collection_saved',
      actorIds: ['u-tae'],
      collectionId: 'demo-col-01',
      title: 'Tae saved your collection',
      body: '“Immortals who are tired”',
      createdAt: ago(2 * DAY),
      read: true,
    },
    {
      id: 'demo-n-08',
      group: 'system',
      kind: 'system',
      title: 'Welcome to Hallyu',
      body: 'Mark episodes watched as you go and spoilers stay veiled until you are caught up.',
      createdAt: ago(3 * DAY),
      read: true,
    },
  ];
}

/**
 * The member behind "Explore the demo".
 *
 * A brand-new account starts empty on purpose (the first-run states are part of the product), but a
 * demo that opens onto empty states cannot be reviewed. So this member arrives mid-everything: two
 * fandoms followed, one drama half-watched — which is what makes the spoiler veil, "Up next", the
 * Following tab and the recommendations visible on the very first screen instead of three taps in.
 */
export function demoMemberState(): AppState {
  const now = new Date().toISOString();
  const profile: User = {
    id: 'demo-member',
    handle: 'you',
    displayName: 'You',
    bio: 'Slow burns, sad endings, and one drama on the go at all times.',
    favoriteGenres: ['Fantasy', 'Romance', 'Thriller'],
    favoriteDramaIds: ['demo-goblin', 'demo-glory'],
    followers: 128,
    following: 5,
    joinedAt: ago(90 * DAY),
  };
  const watchlist: Record<string, WatchlistItem> = {
    'demo-goblin': {
      dramaId: 'demo-goblin',
      status: 'watching',
      season: 1,
      currentEpisode: 8,
      note: 'Second watch. The tea room episode still lands hardest.',
      addedAt: ago(40 * DAY),
      updatedAt: ago(2 * DAY),
    },
    'demo-cloy': { dramaId: 'demo-cloy', status: 'completed', season: 1, currentEpisode: 16, addedAt: ago(120 * DAY), updatedAt: ago(60 * DAY), completedAt: ago(60 * DAY) },
    'demo-proposal': { dramaId: 'demo-proposal', status: 'want', season: 1, currentEpisode: 0, addedAt: ago(6 * DAY), updatedAt: ago(6 * DAY) },
  };
  const base = freshMemberState(profile);
  return {
    ...base,
    prefs: { ...base.prefs, guidelinesAccepted: true, termsVersion: 1 },
    onboarding: { done: true, step: 0, intent: 'discover', genres: ['Fantasy', 'Romance', 'Thriller'] },
    watchlist,
    follows: { users: ['u-haneul', 'u-soyeon'], dramas: ['demo-goblin', 'demo-glory'], actors: ['a-gongyoo'], collections: ['demo-col-01'] },
    dramaNotify: { 'demo-goblin': true },
    recentSearches: ['slow burn', '#goblin'],
    lastSeenActivity: ago(2 * DAY),
    seen: { onboarded: now },
  };
}
