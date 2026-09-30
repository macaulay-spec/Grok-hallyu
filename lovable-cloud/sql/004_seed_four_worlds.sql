-- =============================================================================
-- HALLYU — LOVABLE CLOUD BACKEND
-- 004_seed_four_worlds.sql
-- Initial 4-world catalog seed (K-Drama, C-Drama, Anime, Hollywood)
-- =============================================================================

insert into public.dramas (
  id, tmdb_id, media_type, format, world, title, original_title, original_language, region,
  year, end_year, status, network, streaming_on, genres, tags, synopsis,
  poster_url, backdrop_url, trailer_url, tone, rating, runtime, episode_count, seasons, airs_on, creators, follower_count
)
values
  -- K-Dramas
  (
    'demo-cloy', 94796, 'tv', 'kdrama', 'kdrama',
    'Crash Landing on You', '사랑의 불시착', 'ko', 'KR',
    2019, 2020, 'completed', 'tvN', array['Netflix'],
    array['Romance', 'Melodrama', 'Comedy'],
    array['chaebol', 'slow burn', 'north korea', 'found family'],
    'A South Korean heiress is swept off course by a paragliding accident and lands in North Korea, where a soldier chooses to hide her rather than turn her in.',
    'https://image.tmdb.org/t/p/w342/dv0a4dW9M6vE7y5d7vX9kR6h8W.jpg',
    'https://image.tmdb.org/t/p/w780/n5A7brJCjejceZmHyujwUTVgQNC.jpg',
    'https://www.youtube.com/watch?v=GVQGWgeVc4k',
    '#2F3A46', 8.7, 70, 16,
    '[{"number":1,"episodeCount":16,"year":2019}]'::jsonb,
    'Sat–Sun 21:00 KST', array['Park Ji-eun'], 184300
  ),
  (
    'demo-goblin', 67915, 'tv', 'kdrama', 'kdrama',
    'Guardian: The Lonely and Great God', '쓸쓸하고 찬란하神 – 도깨비', 'ko', 'KR',
    2016, 2017, 'completed', 'tvN', array['Netflix', 'Viki'],
    array['Fantasy', 'Romance', 'Melodrama'],
    array['immortal', 'reincarnation', 'slow burn', 'found family', 'supernatural'],
    'An immortal goblin cursed to live forever searches for the human bride who can end his life, while sharing a house with an amnesiac grim reaper.',
    'https://image.tmdb.org/t/p/w342/t7a2p9V1qZ2m5L8k3N9v4X1w6Y.jpg',
    'https://image.tmdb.org/t/p/w780/s1t2u3v4w5x6y7z8a9b0c1d2e3.jpg',
    'https://www.youtube.com/watch?v=8AcNEVUzV4o',
    '#3A3348', 8.9, 75, 16,
    '[{"number":1,"episodeCount":16,"year":2016}]'::jsonb,
    'Fri–Sat 20:00 KST', array['Kim Eun-sook'], 152800
  ),
  (
    'demo-glory', 136283, 'tv', 'kdrama', 'kdrama',
    'The Glory', '더 글로리', 'ko', 'KR',
    2022, 2023, 'completed', 'Netflix', array['Netflix'],
    array['Thriller', 'Melodrama', 'Crime'],
    array['revenge', 'slow burn', 'school violence', 'adult'],
    'A woman whose life was destroyed by high-school bullies rebuilds herself around one plan: to reach the perpetrators as an adult and take everything from them.',
    'https://image.tmdb.org/t/p/w342/uUM4LVlPgIrWW07OoEKjcGW0S1Ej.jpg',
    'https://image.tmdb.org/t/p/w780/a2b3c4d5e6f7g8h9i0j1k2l3m4.jpg',
    'https://www.youtube.com/watch?v=tqVVrTvrI8U',
    '#3C2A2E', 8.5, 50, 16,
    '[{"number":1,"episodeCount":8,"year":2022,"name":"Part 1"},{"number":2,"episodeCount":8,"year":2023,"name":"Part 2"}]'::jsonb,
    null, array['Kim Eun-sook'], 131600
  ),
  (
    'demo-proposal', 154825, 'tv', 'kdrama', 'kdrama',
    'A Business Proposal', '사내맞선', 'ko', 'KR',
    2022, null, 'airing', 'SBS', array['Netflix'],
    array['Romance', 'Comedy'],
    array['office romance', 'fake dating', 'light', 'enemies to lovers'],
    'A researcher goes on a blind date disguised as her friend, only to discover the man across the table is the CEO of her own company.',
    'https://image.tmdb.org/t/p/w342/b3c4d5e6f7g8h9i0j1k2l3m4n5.jpg',
    null,
    'https://www.youtube.com/watch?v=M-PHcxPyasA',
    '#46323A', 8.1, 62, 12,
    '[{"number":1,"episodeCount":12,"year":2022}]'::jsonb,
    'Mon–Tue 22:00 KST', array[]::text[], 96400
  ),
  (
    'world-parasite', 496243, 'movie', 'kdrama', 'kdrama',
    'Parasite', '기생충', 'ko', 'KR',
    2019, null, 'completed', null, array['Max', 'Hulu'],
    array['Thriller', 'Melodrama', 'Comedy'],
    array['class', 'satire', 'twist', 'awards'],
    'A family with no money talks its way into the household of a family with too much of it, and the arrangement holds right up until it does not.',
    'https://image.tmdb.org/t/p/w342/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
    'https://image.tmdb.org/t/p/w780/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg',
    'https://www.youtube.com/watch?v=5xH0HfJHsaY',
    '#33303A', 8.5, 133, 0,
    '[]'::jsonb,
    null, array['Bong Joon-ho'], 143100
  ),
  -- C-Dramas
  (
    'world-untamed', 90761, 'tv', 'cdrama', 'cdrama',
    'The Untamed', '陈情令', 'zh', 'CN',
    2019, null, 'completed', 'Tencent Video', array['Netflix', 'Viki'],
    array['Fantasy', 'Romance', 'Mystery'],
    array['xianxia', 'cultivation', 'found family', 'slow burn'],
    'Two cultivators on opposite sides of a war between clans spend a lifetime circling the same grief, one of them refusing to let the other disappear.',
    'https://image.tmdb.org/t/p/w342/8TZbpPpLQVS2i7P7yUVhrFlFsmW.jpg',
    'https://image.tmdb.org/t/p/w780/ampkwvfwO7o5YMwYAVPKx1PLDaB.jpg',
    'https://www.youtube.com/watch?v=1R0d2jW7aFk',
    '#33304A', 8.6, 45, 50,
    '[{"number":1,"episodeCount":50,"year":2019}]'::jsonb,
    null, array['Zheng Weiwen'], 96400
  ),
  (
    'world-lbfad', 130368, 'tv', 'cdrama', 'cdrama',
    'Love Between Fairy and Devil', '苍兰诀', 'zh', 'CN',
    2022, null, 'completed', 'iQIYI', array['iQIYI', 'Netflix'],
    array['Fantasy', 'Romance', 'Comedy'],
    array['xianxia', 'body swap', 'enemies to lovers'],
    'A fairy whose soul is accidentally bound to the realm’s most feared demon discovers that the monster everyone warned her about is the only one who tells her the truth.',
    'https://image.tmdb.org/t/p/w342/mNgUuTGkOj19Z09zKa76bE6J5Di.jpg',
    'https://image.tmdb.org/t/p/w780/pECcUE53TjkrR2VsAgF7JICzH7k.jpg',
    'https://www.youtube.com/watch?v=1X_X0M5J7bI',
    '#3A2E3E', 8.3, 45, 36,
    '[{"number":1,"episodeCount":36,"year":2022}]'::jsonb,
    null, array[]::text[], 71200
  ),
  (
    'world-lotus', 230835, 'tv', 'cdrama', 'cdrama',
    'Mysterious Lotus Casebook', '莲花楼', 'zh', 'CN',
    2023, null, 'airing', 'iQIYI', array['iQIYI'],
    array['Mystery', 'Historical', 'Action'],
    array['wuxia', 'detective', 'found family'],
    'A once-feared swordsman who has quietly retired into medicine keeps getting dragged into murder investigations by a detective who will not take no for an answer.',
    'https://image.tmdb.org/t/p/w342/jpMyCVieu5JlGT52KzBTOOh9VFo.jpg',
    'https://image.tmdb.org/t/p/w780/v0It4jPMkYT3H57x6ot4Fd56C8E.jpg',
    'https://www.youtube.com/watch?v=0Q6L3t8k7uU',
    '#2F3A3A', 8.4, 45, 40,
    '[{"number":1,"episodeCount":40,"year":2023}]'::jsonb,
    null, array[]::text[], 58800
  ),
  -- Anime
  (
    'world-jjk', 95479, 'tv', 'anime', 'anime',
    'JUJUTSU KAISEN', '呪術廻戦', 'ja', 'JP',
    2020, null, 'airing', 'MBS', array['Crunchyroll', 'Netflix'],
    array['Action', 'Fantasy', 'Horror'],
    array['shōnen', 'curses', 'tournament', 'supernatural'],
    'A high-schooler swallows a cursed relic to save a friend and ends up sharing his body with the most dangerous spirit in Japan, enrolled at the school that hunts them.',
    'https://image.tmdb.org/t/p/w342/6qQzMJG27XOJsyAEEIisoJB45j2.jpg',
    'https://image.tmdb.org/t/p/w780/qpin8cASXEVtwhzNsprHYFiOAGk.jpg',
    'https://www.youtube.com/watch?v=4A_X-Dvl0ws',
    '#2E3038', 8.8, 24, 47,
    '[{"number":1,"episodeCount":24,"year":2020},{"number":2,"episodeCount":23,"year":2023}]'::jsonb,
    null, array[]::text[], 138600
  ),
  (
    'world-aot', 1429, 'tv', 'anime', 'anime',
    'Attack on Titan', '進撃の巨人', 'ja', 'JP',
    2013, 2023, 'completed', 'NHK', array['Crunchyroll'],
    array['Action', 'Fantasy', 'Mystery'],
    array['shōnen', 'apocalypse', 'military', 'dark'],
    'Humanity survives behind three walls and a lie. When the outermost wall falls, a boy joins the last army that can fight back, and the truth turns out to be worse than the monsters.',
    'https://image.tmdb.org/t/p/w342/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg',
    'https://image.tmdb.org/t/p/w780/rqbCbjB19amtOtFQbb3K2lgm2zv.jpg',
    'https://www.youtube.com/watch?v=MGRm4IzK1SQ',
    '#3A3226', 9.1, 24, 89,
    '[{"number":1,"episodeCount":25,"year":2013},{"number":2,"episodeCount":12,"year":2017},{"number":3,"episodeCount":22,"year":2018},{"number":4,"episodeCount":30,"year":2020}]'::jsonb,
    null, array[]::text[], 210400
  ),
  (
    'world-frieren', 209867, 'tv', 'anime', 'anime',
    'Frieren: Beyond Journey''s End', '葬送のフリーレン', 'ja', 'JP',
    2023, null, 'completed', 'NTV', array['Crunchyroll', 'Netflix'],
    array['Fantasy', 'Comedy', 'Slice of life'],
    array['slow burn', 'found family', 'melancholy', 'adventure'],
    'After the heroes defeat the demon king, their elven mage realises she never knew the people she travelled with. She sets out to meet the humans she outlived.',
    'https://image.tmdb.org/t/p/w342/dqZENchTd7lp5zht7BdlqM7RBhD.jpg',
    'https://image.tmdb.org/t/p/w780/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg',
    'https://www.youtube.com/watch?v=Iwr1aLEDpe4',
    '#2F3A46', 9.0, 24, 28,
    '[{"number":1,"episodeCount":28,"year":2023}]'::jsonb,
    null, array[]::text[], 132900
  ),
  -- Hollywood
  (
    'world-breakingbad', 1396, 'tv', 'hollywood-series', 'hollywood',
    'Breaking Bad', null, 'en', 'US',
    2008, 2013, 'completed', 'AMC', array['Netflix'],
    array['Crime', 'Thriller', 'Melodrama'],
    array['antihero', 'slow burn', 'prestige tv', 'new mexico'],
    'A chemistry teacher with a terminal diagnosis starts making the purest drug in the Southwest, and discovers he is very good at being someone else.',
    'https://image.tmdb.org/t/p/w342/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg',
    'https://image.tmdb.org/t/p/w780/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    'https://www.youtube.com/watch?v=HhesaQXLuRY',
    '#3A3226', 9.3, 47, 62,
    '[{"number":1,"episodeCount":7,"year":2008},{"number":2,"episodeCount":13,"year":2009},{"number":3,"episodeCount":13,"year":2010},{"number":4,"episodeCount":13,"year":2011},{"number":5,"episodeCount":16,"year":2012}]'::jsonb,
    null, array['Vince Gilligan'], 168200
  ),
  (
    'world-severance', 95396, 'tv', 'hollywood-series', 'hollywood',
    'Severance', null, 'en', 'US',
    2022, null, 'airing', 'Apple TV+', array['Apple TV+'],
    array['Sci-fi', 'Thriller', 'Mystery'],
    array['dystopia', 'workplace', 'prestige tv', 'theories'],
    'Employees at Lumon consent to a surgical procedure that splits their memories between work and home, until one of them starts asking why the work is worth forgetting.',
    'https://image.tmdb.org/t/p/w342/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg',
    'https://image.tmdb.org/t/p/w780/ixgFmf1X59PUZam2qbAfskx2gQr.jpg',
    'https://www.youtube.com/watch?v=xEQP4VVuyrY',
    '#2E3440', 8.7, 50, 19,
    '[{"number":1,"episodeCount":9,"year":2022},{"number":2,"episodeCount":10,"year":2025}]'::jsonb,
    null, array[]::text[], 104500
  ),
  (
    'world-dune2', 693134, 'movie', 'hollywood-movie', 'hollywood',
    'Dune: Part Two', null, 'en', 'US',
    2024, null, 'completed', null, array['Max', 'Apple TV'],
    array['Sci-fi', 'Action', 'Adventure'],
    array['epic', 'desert', 'prophecy', 'franchise'],
    'Paul Atreides unites with the Fremen to wage war on the house that destroyed his family, and finds himself becoming the thing he feared in the prophecy.',
    'https://image.tmdb.org/t/p/w342/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
    'https://image.tmdb.org/t/p/w780/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    'https://www.youtube.com/watch?v=Way9Dexny3w',
    '#3A3226', 8.2, 167, 0,
    '[]'::jsonb,
    null, array['Denis Villeneuve'], 92700
  )
on conflict (id) do update set
  trailer_url = excluded.trailer_url,
  streaming_on = excluded.streaming_on,
  seasons = excluded.seasons,
  updated_at = now();

insert into public.actors (id, tmdb_id, name, korean_name, birth_date, bio, known_for, follower_count)
values
  ('a-hyunbin', 109803, 'Hyun Bin', '현빈', '1982-09-25', 'One of the defining leading men of modern Korean television.', array['demo-cloy'], 41200),
  ('a-yejin', 86892, 'Son Ye-jin', '손예진', '1982-01-11', 'Romance and melodrama lead with a decade of hit dramas behind her.', array['demo-cloy'], 38900),
  ('a-songhyekyo', 70615, 'Song Hye-kyo', '송혜교', '1981-11-22', 'A career built on quiet, exacting performances across romance and revenge drama.', array['demo-glory'], 52400),
  ('a-dohyun', 2079434, 'Lee Do-hyun', '이도현', '1995-04-11', 'Genre-hopping actor known for emotionally raw supporting and lead roles.', array['demo-glory'], 29700),
  ('a-gongyoo', 150903, 'Gong Yoo', '공유', '1979-07-10', 'Film and television lead whose fantasy roles became fandom touchstones.', array['demo-goblin'], 47100),
  ('a-goeun', 1117313, 'Kim Go-eun', '김고은', '1991-07-02', 'Critically praised for grounded, unshowy character work.', array['demo-goblin'], 33500),
  ('a-dongwook', 123071, 'Lee Dong-wook', '이동욱', '1981-11-06', 'A comic and romantic lead with unusually sharp timing.', array['demo-goblin'], 35800),
  ('a-hyoseop', 1564846, 'Ahn Hyo-seop', '안효섭', '1995-04-17', 'Romantic comedy lead and one of the newer generation of K-drama stars.', array['demo-proposal'], 24300),
  ('a-sejeong', 1856910, 'Kim Se-jeong', '김세정', '1996-08-28', 'Singer turned actor, best known for bright comic heroines.', array['demo-proposal'], 26900),
  ('a-songkangho', 20738, 'Song Kang-ho', '송강호', '1967-01-17', 'Towering figure of modern Korean cinema and frequent collaborator of Bong Joon-ho.', array['world-parasite'], 44500),
  ('a-choiwooshik', 1255881, 'Choi Woo-shik', '최우식', '1990-03-26', 'Film and drama lead known for expressive, sympathetic underdogs.', array['world-parasite'], 31400),
  ('a-xiaozhan', 2067855, 'Xiao Zhan', '肖战', '1991-10-05', 'Singer and actor at the centre of the biggest C-drama fandom of the last decade.', array['world-untamed'], 38600),
  ('a-wangyibo', 1922525, 'Wang Yibo', '王一博', '1997-08-05', 'Dancer, racer and actor, best known for playing the coldest man in cultivation.', array['world-untamed'], 34200),
  ('a-dylanwang', 2092500, 'Dylan Wang', '王鹤棣', '1998-12-20', 'Xianxia lead who made being the villain the fun part.', array['world-lbfad'], 21700),
  ('a-estheryu', 2436115, 'Esther Yu', '虞书欣', '1995-12-18', 'Bright comic timing and warm xianxia heroines.', array['world-lbfad'], 20400),
  ('a-chengyi', 1966085, 'Cheng Yi', '成毅', '1990-05-17', 'Wuxia lead with a talent for tired, funny, quietly lethal swordsmen.', array['world-lotus'], 17400),
  ('a-nakamura', 93622, 'Yuichi Nakamura', '中村悠一', '1980-02-20', 'Voice actor behind some of modern anime’s most quoted lines.', array['world-jjk'], 29300),
  ('a-yukikaji', 114660, 'Yuki Kaji', '梶裕貴', '1985-09-03', 'One of the defining shōnen voices of his generation.', array['world-aot'], 27800),
  ('a-tanezaki', 1255652, 'Atsumi Tanezaki', '種﨑敦美', '1990-09-27', 'Voice actor with an unusually wide range of leads.', array['world-frieren'], 16900),
  ('a-cranston', 17419, 'Bryan Cranston', null, '1956-03-07', 'The prestige-TV antihero performance every other one is measured against.', array['world-breakingbad'], 33100),
  ('a-aaronpaul', 84497, 'Aaron Paul', null, '1979-08-27', 'Television’s most heartbreaking sidekick.', array['world-breakingbad'], 24600),
  ('a-adamscott', 36801, 'Adam Scott', null, '1973-04-03', 'Comedy mainstay turned sci-fi everyman.', array['world-severance'], 19200),
  ('a-brittlower', 1030513, 'Britt Lower', null, '1985-08-02', 'Sharp, fearless co-lead of Lumon’s Macrodata Refinement floor.', array['world-severance'], 14800),
  ('a-chalamet', 1190668, 'Timothée Chalamet', null, '1995-12-27', 'Film lead of the decade’s biggest science-fiction epic.', array['world-dune2'], 46800),
  ('a-zendaya', 505710, 'Zendaya', null, '1996-09-01', 'Film and prestige television lead.', array['world-dune2'], 49200)
on conflict (id) do nothing;

insert into public.drama_cast (drama_id, actor_id, role, cast_order)
values
  ('demo-cloy', 'a-hyunbin', 'Ri Jeong-hyeok', 0),
  ('demo-cloy', 'a-yejin', 'Yoon Se-ri', 1),
  ('demo-goblin', 'a-gongyoo', 'Kim Shin', 0),
  ('demo-goblin', 'a-goeun', 'Ji Eun-tak', 1),
  ('demo-goblin', 'a-dongwook', 'Grim Reaper', 2),
  ('demo-glory', 'a-songhyekyo', 'Moon Dong-eun', 0),
  ('demo-glory', 'a-dohyun', 'Joo Yeo-jeong', 1),
  ('demo-proposal', 'a-hyoseop', 'Kang Tae-moo', 0),
  ('demo-proposal', 'a-sejeong', 'Shin Ha-ri', 1),
  ('world-parasite', 'a-songkangho', 'Kim Ki-taek', 0),
  ('world-parasite', 'a-choiwooshik', 'Kim Ki-woo', 1),
  ('world-untamed', 'a-xiaozhan', 'Wei Wuxian', 0),
  ('world-untamed', 'a-wangyibo', 'Lan Wangji', 1),
  ('world-lbfad', 'a-dylanwang', 'Dongfang Qingcang', 0),
  ('world-lbfad', 'a-estheryu', 'Xiao Lanhua', 1),
  ('world-lotus', 'a-chengyi', 'Li Lianhua', 0),
  ('world-jjk', 'a-nakamura', 'Satoru Gojo', 0),
  ('world-aot', 'a-yukikaji', 'Eren Yeager', 0),
  ('world-frieren', 'a-tanezaki', 'Frieren', 0),
  ('world-breakingbad', 'a-cranston', 'Walter White', 0),
  ('world-breakingbad', 'a-aaronpaul', 'Jesse Pinkman', 1),
  ('world-severance', 'a-adamscott', 'Mark Scout', 0),
  ('world-severance', 'a-brittlower', 'Helly R.', 1),
  ('world-dune2', 'a-chalamet', 'Paul Atreides', 0),
  ('world-dune2', 'a-zendaya', 'Chani', 1)
on conflict (drama_id, actor_id) do nothing;
