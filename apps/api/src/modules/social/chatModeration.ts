const PROFANITY_TERMS = [
  // Russian
  "blyad",
  "blyat",
  "huy",
  "khuy",
  "pizda",
  "suka",
  // Azerbaijani / common transliterations
  "qehbe",
  "sik",
  // Turkish
  "amk",
  "orospu",
  "pust",
  // English
  "asshole",
  "bitch",
  "fuck",
  "shit"
] as const;

const CHAR_NORMALIZATION_MAP: Record<string, string> = {
  "@": "a",
  "а": "a",
  "á": "a",
  "à": "a",
  "â": "a",
  "ä": "a",
  "б": "b",
  "8": "b",
  "ç": "c",
  "с": "s",
  "$": "s",
  "5": "s",
  "ş": "s",
  "ё": "e",
  "е": "e",
  "ə": "e",
  "3": "e",
  "ф": "f",
  "г": "g",
  "ğ": "g",
  "9": "g",
  "һ": "h",
  "х": "h",
  "1": "i",
  "!": "i",
  "|": "i",
  "і": "i",
  "ı": "i",
  "й": "y",
  "ж": "j",
  "к": "k",
  "қ": "q",
  "л": "l",
  "м": "m",
  "н": "n",
  "0": "o",
  "о": "o",
  "ө": "o",
  "р": "p",
  "п": "p",
  "2": "z",
  "з": "z",
  "т": "t",
  "7": "t",
  "у": "u",
  "ü": "u",
  "v": "u",
  "в": "v",
  "w": "w",
  "ш": "w",
  "щ": "w",
  "x": "x",
  "ы": "y",
  "э": "e",
  "ю": "yu",
  "я": "ya"
};

const CHAR_CLASS_MAP: Record<string, string[]> = {
  a: ["a", "а", "@", "4"],
  b: ["b", "б", "8"],
  c: ["c", "с", "ç", "ć", "č"],
  d: ["d", "д"],
  e: ["e", "е", "ё", "э", "3"],
  f: ["f", "ф"],
  g: ["g", "г", "ğ", "9"],
  h: ["h", "х", "һ"],
  i: ["i", "і", "1", "!", "|", "ı"],
  j: ["j", "ж"],
  k: ["k", "к", "қ"],
  l: ["l", "л", "1", "|"],
  m: ["m", "м"],
  n: ["n", "н"],
  o: ["o", "о", "0", "ө"],
  p: ["p", "р", "п"],
  q: ["q", "қ"],
  r: ["r", "р"],
  s: ["s", "с", "$", "5", "ş"],
  t: ["t", "т", "7", "+"],
  u: ["u", "у", "ü", "v"],
  v: ["v", "в", "u"],
  w: ["w", "ш", "щ"],
  x: ["x", "х", "×"],
  y: ["y", "у", "й", "ы"],
  z: ["z", "з", "2"]
};

function escapeCharClass(value: string) {
  return String(value).replace(/[\\\]\^-]/g, "\\$&");
}

function normalizeForLookup(value: string) {
  const lower = String(value || "").toLowerCase();
  const mapped = Array.from(lower, (char) => CHAR_NORMALIZATION_MAP[char] || char)
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!mapped) return "";

  const tokens = mapped.split(" ").map((token) => token.replace(/([a-z0-9])\1+/g, "$1"));
  const merged: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    const last = merged[merged.length - 1];
    if (token.length === 1 && last && last.length === 1) {
      merged[merged.length - 1] = `${last}${token}`;
      continue;
    }
    merged.push(token);
  }
  return merged.join(" ");
}

function buildProfanityPattern(term: string) {
  const source = Array.from(term).map((char) => {
    const alternatives = CHAR_CLASS_MAP[char] || [char];
    const classBody = alternatives.map(escapeCharClass).join("");
    return `[${classBody}]+`;
  }).join("[\\W_]*");

  return new RegExp(`(^|[^\\p{L}\\p{N}])(${source})(?=$|[^\\p{L}\\p{N}])`, "giu");
}

const NORMALIZED_PROFANITY_TERMS = PROFANITY_TERMS.map((term) => normalizeForLookup(term));
const PROFANITY_PATTERNS = PROFANITY_TERMS.map((term) => buildProfanityPattern(term));

export const CHAT_MESSAGE_FLOOD_MAX = 5;
export const CHAT_MESSAGE_FLOOD_WINDOW_MS = 10_000;

export function maskProfanity(text: string): { text: string; masked: boolean } {
  const original = String(text || "");
  if (!original) {
    return { text: original, masked: false };
  }

  const probe = normalizeForLookup(original);
  if (!probe) {
    return { text: original, masked: false };
  }

  const hasMatch = NORMALIZED_PROFANITY_TERMS.some((term) => probe.includes(term));
  if (!hasMatch) {
    return { text: original, masked: false };
  }

  let masked = false;
  let result = original;

  for (const pattern of PROFANITY_PATTERNS) {
    result = result.replace(pattern, (match, prefix: string, dirtyWord: string) => {
      masked = true;
      return `${prefix}${"*".repeat(String(dirtyWord || "").length)}`;
    });
  }

  return { text: result, masked };
}
