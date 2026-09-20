import type { Demographics, MatchBand, SearchQuery } from "./types";

function normalize(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function digits(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function tokens(value?: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function familyTokens(family?: string): string[] {
  return normalize(family)
    .split(" ")
    .flatMap((part) => part.split("-"))
    .filter(Boolean);
}

/** Jaro similarity, then Winkler prefix boost. */
export function jaroWinkler(aRaw: string, bRaw: string): number {
  const s1 = normalize(aRaw).replace(/ /g, "");
  const s2 = normalize(bRaw).replace(/ /g, "");
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const matchDistance = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function levenshtein(aRaw: string, bRaw: string): number {
  const a = normalize(aRaw);
  const b = normalize(bRaw);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function tokenOverlap(a?: string, b?: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / new Set([...ta, ...tb]).size;
}

function nameScore(query: SearchQuery, record: Demographics): number {
  const qGiven = query.given ?? "";
  const qFamily = query.family ?? "";
  const rGiven = record.given;
  const rFamily = record.family;

  const givenJw = qGiven ? jaroWinkler(qGiven, rGiven) : 0;

  const qFamTok = familyTokens(qFamily);
  const rFamTok = familyTokens(rFamily);
  let familyJw = qFamily ? jaroWinkler(qFamily, rFamily) : 0;
  if (qFamTok.length && rFamTok.length) {
    let best = familyJw;
    for (const q of qFamTok) {
      for (const r of rFamTok) {
        best = Math.max(best, jaroWinkler(q, r));
      }
    }
    familyJw = best;
  }

  if (!qGiven && !qFamily) return 0;
  if (!qGiven) return familyJw;
  if (!qFamily) return givenJw;
  return givenJw * 0.45 + familyJw * 0.55;
}

function phoneScore(query?: string, record?: string): number {
  const q = digits(query).slice(-10);
  const r = digits(record).slice(-10);
  if (!q || !r) return 0;
  return q === r ? 1 : 0;
}

function ninScore(query?: string, record?: string): number {
  const q = digits(query);
  const r = digits(record);
  if (!q || !r) return 0;
  return q === r ? 1 : 0;
}

export function bandFor(score: number, ninExact: boolean, dobExact: boolean): MatchBand {
  if (ninExact && dobExact) return "auto-link";
  if (score >= 0.9) return "confirm";
  if (score >= 0.6) return "workbench";
  return "no-match";
}

export interface MatchBreakdown {
  score: number;
  band: MatchBand;
  reasons: string[];
  components: {
    name: number;
    dob: number;
    sex: number;
    phone: number;
    address: number;
    nin: number;
  };
}

/**
 * Weighted demographic matcher.
 * NIN+DOB forces auto-link. Name alone never auto-merges.
 */
export function scoreMatch(query: SearchQuery, record: Demographics): MatchBreakdown {
  const name = nameScore(query, record);
  const dob = query.birthDate && query.birthDate === record.birthDate ? 1 : 0;
  const sex = query.sex && query.sex === record.sex ? 1 : 0;
  const phone = phoneScore(query.phone, record.phone);
  const address = tokenOverlap(
    [query.address, ""].join(" "),
    [record.addressLine, record.city, record.lga, record.state].join(" "),
  );
  const nin = ninScore(query.nin, record.nin);

  let score =
    name * 0.3 +
    dob * 0.25 +
    sex * 0.1 +
    phone * 0.2 +
    address * 0.05 +
    nin * 0.1;

  const reasons: string[] = [];
  if (nin && dob) {
    score = Math.max(score, 0.99);
    reasons.push("NIN exact and date of birth consistent");
  }
  if (name >= 0.85 && dob && (phone || nin)) {
    score = Math.max(score, 0.91);
    reasons.push("Strong name + DOB + identifier");
  }
  if (name >= 0.7) reasons.push(`Name similarity ${name.toFixed(2)}`);
  if (dob) reasons.push("Date of birth exact");
  if (sex) reasons.push("Sex matches");
  if (phone) reasons.push("Phone last-10 match");
  if (address >= 0.2) reasons.push("Address tokens overlap");
  if (nin) reasons.push("NIN exact");
  if (!nin && !phone && name > 0 && score < 0.9) {
    reasons.push("No shared identifier; will not auto-merge");
  }

  score = Math.min(0.995, Math.round(score * 1000) / 1000);
  const band = bandFor(score, Boolean(nin), Boolean(dob));

  return {
    score,
    band,
    reasons,
    components: { name, dob, sex, phone, address, nin },
  };
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}
