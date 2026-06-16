import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import type { OutlinePayload } from '../api/outlines';

/**
 * Extract the YouTube video ID from the current active tab's URL.
 * Returns null if the user isn't on a /watch URL.
 */
async function getCurrentYtVideoId(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!url.includes('youtube.com/watch')) return null;
  const m = url.match(/[?&]v=([^&#]+)/);
  return m?.[1] ?? null;
}

type CachedOutline = {
  videoId: string;
  ytVideoId: string;
  title: string;
  outline: OutlinePayload;
} | null;

/**
 * Look up the current YouTube video's outline for the signed-in user.
 * Returns null cleanly when:
 *   - User isn't on a /watch page (e.g. homepage, search, no tab open)
 *   - The video has never been analyzed
 *   - User isn't signed in (shouldn't happen post-install)
 */
async function fetchCurrentVideoOutline(): Promise<CachedOutline> {
  const ytVideoId = await getCurrentYtVideoId();
  if (!ytVideoId) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('videos')
    .select('id, yt_video_id, title, outlines(sections)')
    .eq('user_id', user.id)
    .eq('yt_video_id', ytVideoId)
    .maybeSingle();

  if (error) {
    console.warn('[bryteo] cached outline lookup failed:', error);
    return null;
  }

  // Supabase returns the nested outlines table as an array (even with unique
  // FK), so grab the first.
  const sections = (data as any)?.outlines?.[0]?.sections;
  if (!data || !Array.isArray(sections) || sections.length === 0) return null;

  return {
    videoId: data.id,
    ytVideoId: data.yt_video_id,
    title: data.title,
    outline: { sections }
  };
}

/**
 * Hook the side panel uses on every mount to detect "do we already have an
 * outline for the YouTube video this user is looking at?" If yes, render it
 * directly without making them click Analyze again.
 *
 * refetchOnMount: 'always' is critical — closing + reopening the side panel
 * unmounts/remounts the whole React tree, including the QueryClient. We want
 * every fresh mount to immediately re-check the DB for the current tab.
 */
export function useCurrentVideoOutline() {
  return useQuery<CachedOutline>({
    queryKey: ['current-video-outline'],
    queryFn: fetchCurrentVideoOutline,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false
  });
}

/**
 * Listen for tab navigation while the side panel is open: if the user switches
 * to a different YouTube video, re-check for that video's cached outline.
 * Returns a cleanup function — caller passes it into useEffect.
 */
export function watchTabChanges(onChange: () => void): () => void {
  const handler = (
    _tabId: number,
    _changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) => {
    if (tab.active && tab.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
      onChange();
    }
  };
  const activeHandler = () => onChange();

  chrome.tabs.onUpdated.addListener(handler);
  chrome.tabs.onActivated.addListener(activeHandler);
  return () => {
    chrome.tabs.onUpdated.removeListener(handler);
    chrome.tabs.onActivated.removeListener(activeHandler);
  };
}
