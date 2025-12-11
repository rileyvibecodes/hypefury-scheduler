/**
 * Auto-Corrector
 *
 * Automatically fixes detected issues in post content.
 * Only fixes issues marked as autoFixable.
 */

import {
  QualityIssue,
  ARTIFACT_PATTERNS,
  ISSUE_CODES,
} from './qualityRules.js';

export interface CorrectionResult {
  content: string;
  corrections: string[];
}

/**
 * Apply automatic corrections to content based on detected issues
 */
export function autoCorrect(content: string, issues: QualityIssue[]): CorrectionResult {
  let result = content;
  const corrections: string[] = [];

  for (const issue of issues) {
    if (!issue.autoFixable) continue;

    switch (issue.code) {
      case ISSUE_CODES.DAY_HEADER: {
        const before = result;
        // Remove "Day X:" patterns at the start of lines
        result = result.replace(/^Day\s*\d+:?\s*\n*/gim, '');
        if (before !== result) {
          corrections.push('Removed "Day X:" header(s)');
        }
        break;
      }

      case ISSUE_CODES.UNDERSCORE_SEP: {
        const before = result;
        // Remove lines that are only underscores
        result = result.replace(/^[_]{3,}$/gm, '');
        if (before !== result) {
          corrections.push('Removed underscore separator(s)');
        }
        break;
      }

      case ISSUE_CODES.EMDASH_SEP: {
        const before = result;
        // Remove lines that are only em-dashes
        result = result.replace(/^[—]+$/gm, '');
        if (before !== result) {
          corrections.push('Removed em-dash separator(s)');
        }
        break;
      }

      case ISSUE_CODES.DASH_SEP: {
        const before = result;
        // Remove lines that are only dashes (2+)
        result = result.replace(/^[-]{2,}$/gm, '');
        if (before !== result) {
          corrections.push('Removed dash separator(s)');
        }
        break;
      }

      case ISSUE_CODES.STRAY_BULLET: {
        const before = result;
        // Remove lines that are just a bullet with nothing after
        result = result.replace(/^[\s]*[•\*\-][\s]*$/gm, '');
        if (before !== result) {
          corrections.push('Removed empty bullet point(s)');
        }
        break;
      }

      case ISSUE_CODES.ORPHANED_MARKER: {
        const before = result;
        // Remove lines that are just a number marker with nothing after
        result = result.replace(/^\s*\d+[.\)]\s*$/gm, '');
        if (before !== result) {
          corrections.push('Removed orphaned number marker(s)');
        }
        break;
      }

      case ISSUE_CODES.HTML_ENTITY: {
        const before = result;
        // Convert HTML entities to their actual characters
        result = result
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        if (before !== result) {
          corrections.push('Converted HTML entities to text');
        }
        break;
      }

      case ISSUE_CODES.ZERO_WIDTH: {
        const before = result;
        // Remove zero-width and invisible characters
        result = result.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
        if (before !== result) {
          corrections.push('Removed invisible zero-width characters');
        }
        break;
      }

      case ISSUE_CODES.EXCESSIVE_BLANKS: {
        const before = result;
        // Reduce multiple consecutive blank lines to just one
        result = result.replace(/\n{3,}/g, '\n\n');
        if (before !== result) {
          corrections.push('Reduced excessive blank lines');
        }
        break;
      }
    }
  }

  // Always clean up any resulting empty lines at start/end
  result = result.trim();

  // Clean up any double-blank lines that may have resulted from removals
  result = result.replace(/\n{3,}/g, '\n\n');

  return { content: result, corrections };
}

/**
 * Normalize bullet characters to standard bullet point
 */
export function normalizeBullets(content: string): CorrectionResult {
  let result = content;
  const corrections: string[] = [];

  const before = result;
  // Convert asterisk bullets to bullet point
  result = result.replace(/^\* /gm, '• ');
  // Convert dash bullets at start of line to bullet point (but not dashes in middle of text)
  result = result.replace(/^- (?=\S)/gm, '• ');

  if (before !== result) {
    corrections.push('Normalized bullet characters to •');
  }

  return { content: result, corrections };
}

/**
 * Clean up whitespace issues
 */
export function cleanWhitespace(content: string): CorrectionResult {
  let result = content;
  const corrections: string[] = [];

  const before = result;

  // Remove trailing whitespace from each line
  result = result.replace(/[ \t]+$/gm, '');

  // Remove leading whitespace from non-list lines
  // (but preserve intentional indentation for code blocks if any)
  const lines = result.split('\n');
  const cleanedLines = lines.map(line => {
    // If it's a list item, just trim leading whitespace to make flush left
    if (/^[\s]*[•\*\-✓✗→][\s]/.test(line) || /^[\s]*\d+[.\)]\s/.test(line)) {
      return line.replace(/^[\s]+/, '');
    }
    // For regular text, trim leading whitespace
    return line.trimStart();
  });
  result = cleanedLines.join('\n');

  if (before !== result) {
    corrections.push('Cleaned up whitespace');
  }

  return { content: result, corrections };
}
