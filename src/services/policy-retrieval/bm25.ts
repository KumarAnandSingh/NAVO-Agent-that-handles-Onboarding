/**
 * Small, dependency-free BM25 ranker for the policy library. The library is a few dozen
 * sections, so lexical ranking with a light synonym map is fast, explainable and fully
 * deterministic, which matters more here than semantic recall. Devanagari is kept, so
 * common Hindi words reach the English policies through the same synonym map.
 */

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them then there this to up was we what when where which who why will with you your".split(
    " ",
  ),
);

/** Expansions that map how joiners ask to how policies are written. */
const SYNONYMS: Record<string, string[]> = {
  wfh: ["remote"],
  home: ["remote"],
  remotely: ["remote"],
  insurance: ["health", "cover"],
  medical: ["health", "cover"],
  parents: ["parents"],
  bring: ["bring", "arrival"],
  first: ["day"],
  late: ["overdue", "escalation", "reminder"],
  respond: ["reminder", "escalation", "answered"],
  reply: ["reminder", "escalation", "answered"],
  escalate: ["escalation"],
  laptop: ["laptop", "laptops"],
  loaner: ["loaner"],
  documents: ["document", "documents"],
  privacy: ["documents", "access", "encrypted"],
  see: ["view", "access"],
  view: ["access"],
  vacation: ["leave"],
  holiday: ["leave", "holidays"],
  // Hindi words joiners use, mapped to the policy language (the library is in English).
  "छुट्टी": ["leave"],
  "छुट्टियाँ": ["leave"],
  "अवकाश": ["leave"],
  "सुरक्षा": ["security"],
  "प्रशिक्षण": ["training"],
  "ट्रेनिंग": ["training"],
  "दस्तावेज़": ["documents"],
  "दस्तावेज": ["documents"],
  "आवास": ["housing"],
  "होटल": ["housing", "hotel"],
  "स्थानांतरण": ["relocation"],
  "शिफ्ट": ["relocation", "moving"],
  "घर": ["remote", "home"],
  "शुक्रवार": ["friday"],
  "दफ़्तर": ["office"],
  "ऑफिस": ["office"],
  "पार्किंग": ["parking"],
  "देखेगा": ["view", "access"],
  "देख": ["view", "access"],
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/§/g, " ")
    .replace(/[^a-z0-9₹\u0900-\u0963\u0966-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Minimal suffix stripping so "reminders"/"reminder" and "laptops"/"laptop" match. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function expandQuery(query: string): string[] {
  const tokens = tokenize(query);
  const expanded = [...tokens];
  for (const token of tokens) {
    for (const extra of SYNONYMS[token] ?? []) expanded.push(...tokenize(extra));
  }
  return expanded;
}

export interface RankableDoc {
  id: string;
  text: string;
}

export interface RankedDoc {
  id: string;
  score: number;
}

const K1 = 1.4;
const B = 0.75;

export function rankBm25(docs: readonly RankableDoc[], query: string): RankedDoc[] {
  const queryTerms = [...new Set(expandQuery(query))];
  if (queryTerms.length === 0 || docs.length === 0) return [];
  const tokenized = docs.map((d) => tokenize(d.text));
  const avgLength = tokenized.reduce((sum, t) => sum + t.length, 0) / tokenized.length;
  const docFreq = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }

  const results: RankedDoc[] = [];
  tokenized.forEach((tokens, index) => {
    const termFreq = new Map<string, number>();
    for (const token of tokens) termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const tf = termFreq.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * tokens.length) / avgLength));
    }
    const doc = docs[index];
    if (score > 0 && doc) results.push({ id: doc.id, score });
  });
  return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
