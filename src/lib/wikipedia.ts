import wiki from 'wikipedia';

export async function fetchWikiSummary(wikipediaUrl: string): Promise<string> {
  try {
    const title = decodeURIComponent(wikipediaUrl.split('/wiki/')[1] ?? '');
    const summary = await wiki.summary(title);
    const sentences = summary.extract.match(/[^.!?]+[.!?]+/g) ?? [];
    return sentences.slice(0, 3).join(' ').trim();
  } catch (err) {
    console.warn(`  Summary fetch failed for ${wikipediaUrl}: ${err}`);
    return '';
  }
}
