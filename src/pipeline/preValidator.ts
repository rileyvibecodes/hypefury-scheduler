/**
 * Pre-Validator
 *
 * Checks raw post content BEFORE formatting is applied.
 * Detects issues that need to be auto-corrected or that should reject the post.
 */

import {
  QualityIssue,
  QualityResult,
  ARTIFACT_PATTERNS,
  CONTENT_MINIMUMS,
  SCORE_PENALTIES,
  ISSUE_CODES,
  isGarbageContent,
  countLetters,
  countWords,
} from './qualityRules.js';

/**
 * Run pre-validation checks on raw post content
 */
export function preValidate(rawPost: string): QualityResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Check for empty/whitespace only
  if (!rawPost || rawPost.trim().length === 0) {
    return {
      isValid: false,
      score: 0,
      issues: [{
        code: ISSUE_CODES.EMPTY,
        severity: 'error',
        description: 'Post is empty',
        autoFixable: false
      }],
      corrections: []
    };
  }

  const trimmed = rawPost.trim();

  // Check for garbage content (fatal - not auto-fixable)
  if (isGarbageContent(trimmed)) {
    return {
      isValid: false,
      score: 0,
      issues: [{
        code: ISSUE_CODES.GARBAGE_CONTENT,
        severity: 'error',
        description: 'Content appears to be only symbols/separators with no real text',
        autoFixable: false
      }],
      corrections: []
    };
  }

  // Check for day headers (auto-fixable)
  if (ARTIFACT_PATTERNS.dayHeaders.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.DAY_HEADER,
      severity: 'warning',
      description: 'Contains "Day X:" header that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.dayHeader;
  }

  // Check for underscore separators (auto-fixable)
  if (ARTIFACT_PATTERNS.underscoreSeparators.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.UNDERSCORE_SEP,
      severity: 'warning',
      description: 'Contains underscore separator line that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.underscoreSeparator;
  }

  // Check for em-dash separators (auto-fixable)
  if (ARTIFACT_PATTERNS.emDashSeparators.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.EMDASH_SEP,
      severity: 'warning',
      description: 'Contains em-dash separator that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.emDashSeparator;
  }

  // Check for regular dash separators (auto-fixable)
  if (ARTIFACT_PATTERNS.dashSeparators.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.DASH_SEP,
      severity: 'warning',
      description: 'Contains dash separator that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.dashSeparator;
  }

  // Check for stray bullets (auto-fixable)
  if (ARTIFACT_PATTERNS.strayBullets.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.STRAY_BULLET,
      severity: 'warning',
      description: 'Contains empty bullet point(s) that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.strayBullet;
  }

  // Check for orphaned number markers (auto-fixable)
  if (ARTIFACT_PATTERNS.orphanedNumbers.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.ORPHANED_MARKER,
      severity: 'warning',
      description: 'Contains orphaned numbered list marker(s) that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.orphanedMarker;
  }

  // Check for HTML entities (auto-fixable)
  const hasHtmlEntities = Object.values(ARTIFACT_PATTERNS.htmlEntities)
    .some(pattern => pattern.test(rawPost));
  if (hasHtmlEntities) {
    issues.push({
      code: ISSUE_CODES.HTML_ENTITY,
      severity: 'info',
      description: 'Contains HTML entities that will be converted',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.htmlEntity;
  }

  // Check for zero-width characters (auto-fixable)
  if (ARTIFACT_PATTERNS.zeroWidthChars.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.ZERO_WIDTH,
      severity: 'info',
      description: 'Contains invisible zero-width characters that will be removed',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.zeroWidthChar;
  }

  // Check for excessive blank lines (auto-fixable)
  if (ARTIFACT_PATTERNS.excessiveBlankLines.test(rawPost)) {
    issues.push({
      code: ISSUE_CODES.EXCESSIVE_BLANKS,
      severity: 'info',
      description: 'Contains excessive consecutive blank lines that will be reduced',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.excessiveBlanks;
  }

  // Check minimum length (after potential auto-fixes, content might still be too short)
  // We do a preliminary check here
  if (trimmed.length < CONTENT_MINIMUMS.length) {
    issues.push({
      code: ISSUE_CODES.TOO_SHORT,
      severity: 'error',
      description: `Post is too short (${trimmed.length} chars, minimum ${CONTENT_MINIMUMS.length})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooShort);
  }

  // Check letter count
  const letterCount = countLetters(trimmed);
  if (letterCount < CONTENT_MINIMUMS.letterCount) {
    issues.push({
      code: ISSUE_CODES.TOO_FEW_LETTERS,
      severity: 'error',
      description: `Post has too few letters (${letterCount}, minimum ${CONTENT_MINIMUMS.letterCount})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooFewLetters);
  }

  // Check word count
  const wordCount = countWords(trimmed);
  if (wordCount < CONTENT_MINIMUMS.wordCount) {
    issues.push({
      code: ISSUE_CODES.TOO_FEW_WORDS,
      severity: 'error',
      description: `Post has too few words (${wordCount}, minimum ${CONTENT_MINIMUMS.wordCount})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooFewWords);
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  // Post is valid if no non-fixable errors
  const hasNonFixableErrors = issues.some(
    issue => issue.severity === 'error' && !issue.autoFixable
  );

  return {
    isValid: !hasNonFixableErrors,
    score,
    issues,
    corrections: []
  };
}
