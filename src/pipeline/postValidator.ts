/**
 * Post-Validator
 *
 * Validates post content AFTER formatting has been applied.
 * This is the final quality gate before sending to Hypefury.
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
 * Run post-validation checks on formatted content
 * This is the final gate before sending
 */
export function postValidate(processedPost: string): QualityResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  const trimmed = processedPost.trim();

  // Final empty check
  if (!trimmed) {
    return {
      isValid: false,
      score: 0,
      issues: [{
        code: ISSUE_CODES.EMPTY,
        severity: 'error',
        description: 'Post is empty after processing',
        autoFixable: false
      }],
      corrections: []
    };
  }

  // Final garbage check
  if (isGarbageContent(trimmed)) {
    return {
      isValid: false,
      score: 0,
      issues: [{
        code: ISSUE_CODES.GARBAGE_CONTENT,
        severity: 'error',
        description: 'Post contains only symbols after processing',
        autoFixable: false
      }],
      corrections: []
    };
  }

  // Check for any remaining artifacts that slipped through
  // These would be auto-fixable in a second pass

  if (ARTIFACT_PATTERNS.dayHeaders.test(processedPost)) {
    issues.push({
      code: ISSUE_CODES.DAY_HEADER,
      severity: 'warning',
      description: 'Day header still present after processing',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.dayHeader;
  }

  if (ARTIFACT_PATTERNS.underscoreSeparators.test(processedPost)) {
    issues.push({
      code: ISSUE_CODES.UNDERSCORE_SEP,
      severity: 'warning',
      description: 'Underscore separator still present',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.underscoreSeparator;
  }

  if (ARTIFACT_PATTERNS.emDashSeparators.test(processedPost)) {
    issues.push({
      code: ISSUE_CODES.EMDASH_SEP,
      severity: 'warning',
      description: 'Em-dash separator still present',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.emDashSeparator;
  }

  // Check for orphaned/empty list items
  const lines = processedPost.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Empty bullet point
    if (/^[•\*\-][\s]*$/.test(line)) {
      issues.push({
        code: ISSUE_CODES.STRAY_BULLET,
        severity: 'warning',
        description: `Empty bullet point on line ${i + 1}`,
        autoFixable: true,
        position: { line: i + 1, column: 0 }
      });
      score -= SCORE_PENALTIES.strayBullet;
    }
    // Empty numbered item
    if (/^\d+[.\)][\s]*$/.test(line)) {
      issues.push({
        code: ISSUE_CODES.ORPHANED_MARKER,
        severity: 'warning',
        description: `Empty numbered item on line ${i + 1}`,
        autoFixable: true,
        position: { line: i + 1, column: 0 }
      });
      score -= SCORE_PENALTIES.orphanedMarker;
    }
  }

  // Check for excessive blank lines (more than 2 newlines in a row)
  if (/\n\n\n/.test(processedPost)) {
    issues.push({
      code: ISSUE_CODES.EXCESSIVE_BLANKS,
      severity: 'info',
      description: 'Contains more than one consecutive blank line',
      autoFixable: true
    });
    score -= SCORE_PENALTIES.excessiveBlanks;
  }

  // Final content requirements check
  if (trimmed.length < CONTENT_MINIMUMS.length) {
    issues.push({
      code: ISSUE_CODES.TOO_SHORT,
      severity: 'error',
      description: `Post is too short after processing (${trimmed.length} chars, minimum ${CONTENT_MINIMUMS.length})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooShort);
  }

  const letterCount = countLetters(trimmed);
  if (letterCount < CONTENT_MINIMUMS.letterCount) {
    issues.push({
      code: ISSUE_CODES.TOO_FEW_LETTERS,
      severity: 'error',
      description: `Post has too few letters after processing (${letterCount}, minimum ${CONTENT_MINIMUMS.letterCount})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooFewLetters);
  }

  const wordCount = countWords(trimmed);
  if (wordCount < CONTENT_MINIMUMS.wordCount) {
    issues.push({
      code: ISSUE_CODES.TOO_FEW_WORDS,
      severity: 'error',
      description: `Post has too few words after processing (${wordCount}, minimum ${CONTENT_MINIMUMS.wordCount})`,
      autoFixable: false
    });
    score = Math.max(0, score - SCORE_PENALTIES.tooFewWords);
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  // Post is valid if no non-fixable errors and score is acceptable
  const hasNonFixableErrors = issues.some(
    issue => issue.severity === 'error' && !issue.autoFixable
  );

  return {
    isValid: !hasNonFixableErrors && score >= 50,
    score,
    issues,
    corrections: []
  };
}
