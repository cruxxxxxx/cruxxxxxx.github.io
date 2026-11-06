/**
 * The week's listening from Last.fm, read at build time: the top albums of
 * the last 7 days (with cover art) and the top artist, shown in the
 * playlist strip's dropdown (BlogLayout.astro). The deploy workflow
 * rebuilds every Monday so it stays current. Needs LASTFM_API_KEY (a repo
 * secret in CI, `.env` locally); without it, or when Last.fm can't be
 * reached, the row just doesn't show.
 */

export interface WeeklyAlbum {
  name: string;
  artist: string;
  url: string;
  /** '' when Last.fm has no cover */
  cover: string;
}

export interface WeeklyArtist {
  name: string;
  url: string;
}

export interface WeeklyListening {
  albums: WeeklyAlbum[];
  topArtist: WeeklyArtist | null;
}

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/';
const ALBUM_COUNT = 5;

interface ApiImage {
  size: string;
  '#text': string;
}

interface ApiAlbum {
  name: string;
  url: string;
  artist: { name: string };
  image: ApiImage[];
}

interface ApiArtist {
  name: string;
  url: string;
}

const cache = new Map<string, Promise<WeeklyListening | null>>();

export function weeklyListening(user: string) {
  if (!cache.has(user)) {
    cache.set(user, fetchListening(user));
  }
  return cache.get(user)!;
}

async function fetchListening(user: string): Promise<WeeklyListening | null> {
  const apiKey = import.meta.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.warn('lastfm: no LASTFM_API_KEY, skipping the listening row');
    return null;
  }
  try {
    const [albumData, artistData] = await Promise.all([
      callApi('user.gettopalbums', user, apiKey, ALBUM_COUNT),
      callApi('user.gettopartists', user, apiKey, 1),
    ]);
    const albums: ApiAlbum[] = albumData?.topalbums?.album ?? [];
    const artists: ApiArtist[] = artistData?.topartists?.artist ?? [];
    if (albums.length === 0) {
      return null;
    }
    return {
      albums: albums.map(toWeeklyAlbum),
      topArtist: artists[0] ? { name: artists[0].name, url: artists[0].url } : null,
    };
  } catch (error) {
    console.warn(`lastfm: couldn't read this week's listening (${(error as Error).message})`);
    return null;
  }
}

async function callApi(method: string, user: string, apiKey: string, limit: number) {
  const params = new URLSearchParams({
    method,
    user,
    api_key: apiKey,
    period: '7day',
    limit: String(limit),
    format: 'json',
  });
  const response = await fetch(`${API_ROOT}?${params}`);
  if (!response.ok) {
    throw new Error(`${method}: HTTP ${response.status}`);
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(`${method}: ${data.message}`);
  }
  return data;
}

function toWeeklyAlbum(album: ApiAlbum): WeeklyAlbum {
  return {
    name: album.name,
    artist: album.artist.name,
    url: album.url,
    cover: largestImage(album.image),
  };
}

function largestImage(images: ApiImage[]) {
  return images.find((image) => image.size === 'extralarge')?.['#text']
    || images.at(-1)?.['#text']
    || '';
}
