// Server-side chat profanity masking.
// Strategy:
//  1) Normalize each WORD to a latin, de-obfuscated form: maps Cyrillic / Azerbaijani /
//     Turkish letters to latin, converts leetspeak digits, strips separators (so "с.у.к.а"
//     -> "suka"), and collapses repeated letters ("сууука" -> "suka").
//  2) LONG roots (>=4 chars) match as a SUBSTRING of the normalized word -> catches
//     inflections and suffixes ("fucking", "сукой", "пиздец", "siktir", "qancıq").
//  3) SHORT roots (<=3 chars) match only as a whole word or word-prefix (avoids false positives).
//  4) If a word matches, the WHOLE original word is replaced with asterisks.
// To extend: just add a normalized (latin, no repeated letters) root to the lists below.

const CHAR_MAP: Record<string, string> = {
  // Cyrillic
  "а": "a",
  "б": "b",
  "в": "v",
  "г": "g",
  "д": "d",
  "е": "e",
  "ё": "e",
  "ж": "j",
  "з": "z",
  "и": "i",
  "й": "i",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "х": "h",
  "ц": "c",
  "ч": "ch",
  "ш": "sh",
  "щ": "sh",
  "ъ": "",
  "ы": "i",
  "ь": "",
  "э": "e",
  "ю": "yu",
  "я": "ya",
  // Azerbaijani / Turkish
  "ə": "e",
  "ı": "i",
  "ö": "o",
  "ü": "u",
  "ç": "c",
  "ş": "s",
  "ğ": "g",
  "â": "a",
  "î": "i",
  "û": "u",
  // Symbols / leet
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i"
};

function normalizeToken(word: string): string {
  const lower = String(word || "").toLowerCase();
  let out = "";
  for (const ch of lower) {
    out += ch in CHAR_MAP ? CHAR_MAP[ch] : ch;
  }
  out = out
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
    .replace(/8/g, "b").replace(/9/g, "g");
  out = out.replace(/[^a-z]/g, "");   // keep latin letters only
  out = out.replace(/(.)\1+/g, "$1"); // collapse repeated letters
  return out;
}

// Roots are stored already normalized (latin, no repeated letters).
const LONG_ROOTS: string[] = [
  // Russian
  "huy","hui","hue","huya","huyu","huyn","ohue","ohuen","ohuet","nahuy","pohuy","nihuya","huynya",
  "pizd","spizd","pizdec","pizdet","pizdat","pizdabol",
  "ebal","ebat","ebut","eban","ebuch","ebla","eblan","zaeb","naeb","ueba","poeb","vyeb","yobn","zaebis",
  "blyad","blyat",
  "suka","suki","suku","sukoy","sukoi","sukin","sukam","suchk","suchar",
  "mudak","mudil","mudoz",
  "gandon","gondon",
  "pidor","pidar","pidoras","pidr","pedik",
  "zalup","manda","droch","droc",
  "govno","govn","ublyud","ubludok",
  "shlyuh","shluh","shlyux","svoloch","padla","padlo","gnida","mraz",
  "nasrat","posrat","obosr","obosan","dolboeb","dolbaeb",
  // Azerbaijani / Turkish
  "sikim","sikis","sikdir","sikey","siken","siktir","sikij",
  "amcig","amciq","amcik","amina","amik",
  "qehbe","qehpe","kehbe","qancig","qanciq","ogras","oqras",
  "yaraq","yarak","yarag","dasaq","dasak",
  "gotver","gotun","gotlu","gotden","orospu","kahpe","kahbe","pezevenk","yavsak","gavat","pust","surtuk",
  // English
  "fuck","fucker","fuckin","fucken","motherfuck",
  "shit","bullshit","bulshit","bitch","biatch","ashole","bastard",
  "slut","whore","niger","niga","fagot","wanker","prick","pusi","pusy","cock","cocksuk","coksuk","dildo","dick"
];

// Matched only as a whole word or as a word-prefix (kept short to limit false positives).
const SHORT_ROOTS: string[] = ["sik","amk","amq","fck","fuk"];

function isProfaneToken(norm: string): boolean {
  if (!norm) return false;
  for (const root of LONG_ROOTS) {
    if (norm.includes(root)) return true;
  }
  for (const root of SHORT_ROOTS) {
    if (norm === root || norm.startsWith(root)) return true;
  }
  return false;
}

export const CHAT_MESSAGE_FLOOD_MAX = 5;
export const CHAT_MESSAGE_FLOOD_WINDOW_MS = 10_000;

export function maskProfanity(text: string): { text: string; masked: boolean } {
  const original = String(text || "");
  if (!original) return { text: original, masked: false };

  let masked = false;
  const result = original.replace(/\S+/gu, (word) => {
    const norm = normalizeToken(word);
    if (norm && isProfaneToken(norm)) {
      masked = true;
      return "*".repeat(Array.from(word).length);
    }
    return word;
  });

  return { text: result, masked };
}
