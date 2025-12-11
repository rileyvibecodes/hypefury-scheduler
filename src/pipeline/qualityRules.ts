/**
 * Quality Rules for Post Validation and Auto-Correction
 *
 * These rules define what artifacts to detect, how to fix them,
 * and what constitutes a valid post for Hypefury.
 */

export interface QualityIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  position?: { line: number; column: number };
  autoFixable: boolean;
}

export interface QualityResult {
  isValid: boolean;
  score: number;            // 0-100
  issues: QualityIssue[];
  corrections: string[];    // Applied auto-corrections
}

/**
 * Artifact detection patterns
 */
export const ARTIFACT_PATTERNS = {
  // Day headers like "Day 1:", "Day 2", "DAY 3:"
  dayHeaders: /^Day\s*\d+:?\s*/gim,

  // Underscore separators (3 or more underscores on their own line)
  underscoreSeparators: /^[_]{3,}$/gm,

  // Em-dash separators (em dash alone on a line)
  emDashSeparators: /^[—]+$/gm,

  // Regular dash separators (2+ dashes alone on a line)
  dashSeparators: /^[-]{2,}$/gm,

  // Stray/lonely bullets (bullet with nothing after it)
  strayBullets: /^[\s]*[•\*\-][\s]*$/gm,

  // Common HTML entities that might sneak through
  htmlEntities: {
    nbsp: /&nbsp;/g,
    amp: /&amp;/g,
    lt: /&lt;/g,
    gt: /&gt;/g,
    quot: /&quot;/g,
    apos: /&apos;/g,
  },

  // Zero-width and invisible characters
  zeroWidthChars: /[\u200B-\u200D\uFEFF\u00AD]/g,

  // Multiple consecutive blank lines (3+ newlines)
  excessiveBlankLines: /\n{3,}/g,

  // Leading/trailing whitespace on lines
  lineWhitespace: /^[ \t]+|[ \t]+$/gm,

  // Orphaned list markers (numbered items with nothing after)
  orphanedNumbers: /^\s*\d+[.\)]\s*$/gm,
};

/**
 * Content validation minimums
 */
export const CONTENT_MINIMUMS = {
  // Minimum character count after trimming
  length: 10,

  // Must have at least this many letters
  letterCount: 3,

  // Must have at least this many words
  wordCount: 2,
};

/**
 * Patterns that indicate garbage/invalid content
 * Posts matching these are rejected entirely
 */
export const GARBAGE_PATTERNS = [
  // Only symbols and separators
  /^[\s\-_•\*—→✓✗\[\](){}|\\\/]+$/,

  // Just numbers or numbers with punctuation
  /^\d+[.\-\/]?\s*$/,

  // No word characters at all
  /^[^\w]*$/,

  // Only whitespace
  /^\s*$/,

  // Only emojis (might be valid in some cases, but risky)
  // /^[\p{Emoji}\s]+$/u,
];

/**
 * Quality score penalties for different issues
 */
export const SCORE_PENALTIES = {
  dayHeader: 5,
  underscoreSeparator: 10,
  emDashSeparator: 10,
  dashSeparator: 5,
  strayBullet: 5,
  htmlEntity: 3,
  zeroWidthChar: 2,
  excessiveBlanks: 5,
  tooShort: 50,
  tooFewLetters: 30,
  tooFewWords: 20,
  garbageContent: 100,
  orphanedMarker: 5,
};

/**
 * Check if content matches any garbage pattern
 */
export function isGarbageContent(content: string): boolean {
  const trimmed = content.trim();
  return GARBAGE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Count letters in content
 */
export function countLetters(content: string): number {
  const matches = content.match(/[a-zA-Z]/g);
  return matches ? matches.length : 0;
}

/**
 * Count words in content
 */
export function countWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Issue codes for tracking
 */
export const ISSUE_CODES = {
  EMPTY: 'EMPTY',
  TOO_SHORT: 'TOO_SHORT',
  TOO_FEW_LETTERS: 'TOO_FEW_LETTERS',
  TOO_FEW_WORDS: 'TOO_FEW_WORDS',
  GARBAGE_CONTENT: 'GARBAGE_CONTENT',
  DAY_HEADER: 'DAY_HEADER',
  UNDERSCORE_SEP: 'UNDERSCORE_SEP',
  EMDASH_SEP: 'EMDASH_SEP',
  DASH_SEP: 'DASH_SEP',
  STRAY_BULLET: 'STRAY_BULLET',
  HTML_ENTITY: 'HTML_ENTITY',
  ZERO_WIDTH: 'ZERO_WIDTH',
  EXCESSIVE_BLANKS: 'EXCESSIVE_BLANKS',
  ORPHANED_MARKER: 'ORPHANED_MARKER',
} as const;

export type IssueCode = typeof ISSUE_CODES[keyof typeof ISSUE_CODES];
