/**
 * The playlist's track names, read at build time from the Spotify embed page
 * (it carries the track list as JSON in __NEXT_DATA__). The embed only tells
 * the page which track is playing, not its name, so the strip looks it up
 * here. Changes to the playlist show up on the next build.
 */

export interface PlaylistTrack {
  uri: string;
  /** "artist – title" */
  label: string;
  /** milliseconds */
  duration: number;
}

interface EmbedTrack {
  uri: string;
  title: string;
  subtitle: string;
  duration: number;
}

const cache = new Map<string, Promise<PlaylistTrack[]>>();

/** Empty when Spotify can't be reached: the strip then just says "playlist". */
export function playlistTracks(playlistId: string) {
  if (!cache.has(playlistId)) {
    cache.set(playlistId, fetchTracks(playlistId));
  }
  return cache.get(playlistId)!;
}

async function fetchTracks(playlistId: string): Promise<PlaylistTrack[]> {
  try {
    const response = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseTracks(await response.text());
  } catch (error) {
    console.warn(`playlist: couldn't read the track list (${(error as Error).message})`);
    return [];
  }
}

function parseTracks(html: string): PlaylistTrack[] {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  if (!json) {
    throw new Error('no __NEXT_DATA__ on the embed page');
  }
  const trackList: EmbedTrack[] = JSON.parse(json)?.props?.pageProps?.state?.data?.entity?.trackList ?? [];
  return trackList.map((track) => ({
    uri: track.uri,
    label: `${track.subtitle} – ${track.title}`,
    duration: track.duration,
  }));
}
