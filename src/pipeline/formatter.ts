/**
 * Post Formatter
 *
 * Applies consistent formatting rules to post content:
 * - Proper spacing between paragraphs
 * - No blank lines between list items
 * - Blank line before/after lists
 * - Flush-left list items (no indentation)
 */

/**
 * Check if a line is a list item (bullet or numbered)
 */
function isListItem(line: string): boolean {
  // Bullet points: •, *, -, ✓, ✗, x, X, →
  const bulletPattern = /^[•\*\-✓✗xX→][\s]/;
  // Numbered lists: 1. 2. 3. or 1) 2) 3)
  const numberedPattern = /^\d+[.\)]\s/;

  const trimmed = line.trimStart();
  return bulletPattern.test(trimmed) || numberedPattern.test(trimmed);
}

/**
 * Format a post with proper spacing and structure
 *
 * Rules:
 * 1. Remove indentation from list items (flush left)
 * 2. No blank lines between consecutive list items
 * 3. One blank line before the first list item (if preceded by text)
 * 4. One blank line after the last list item (if followed by text)
 * 5. One blank line between text paragraphs
 * 6. No consecutive blank lines (max 1)
 */
export function formatPost(post: string): string {
  // Split into lines for processing
  const lines = post.split('\n');
  const result: string[] = [];

  let inList = false;
  let lastWasBlank = false;
  let lastWasText = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check if this line is a list item
    const lineIsListItem = isListItem(line);

    // Remove indentation from list items - make flush left
    if (lineIsListItem) {
      line = line.trimStart();
    }

    const isBlank = line.trim() === '';

    if (isBlank) {
      // Only add one blank line, skip consecutive blanks
      if (!lastWasBlank && result.length > 0) {
        result.push('');
        lastWasBlank = true;
      }
      continue;
    }

    // For list items
    if (lineIsListItem) {
      if (!inList && result.length > 0 && !lastWasBlank) {
        // Add one blank line before first list item (if coming from text)
        result.push('');
      }
      inList = true;
      lastWasText = false;
      // NO blank lines between list items - just add the line
      result.push(line);
      lastWasBlank = false;
    } else {
      // Regular text
      if (inList && !lastWasBlank) {
        // Add blank line after list ends (before text)
        result.push('');
        inList = false;
      } else if (lastWasText && !lastWasBlank) {
        // Add blank line between consecutive text paragraphs
        result.push('');
      }
      lastWasText = true;
      inList = false;
      result.push(line);
      lastWasBlank = false;
    }
  }

  return result.join('\n').trim();
}

/**
 * Parse a document into individual post chunks (raw, unformatted)
 * This extracts the raw content that will then go through the quality pipeline
 *
 * Splitting rules:
 * 1. Split by underscore separators (___) - these separate days
 * 2. Split by em-dash (—) on its own line - these separate posts within a day
 */
export function parseDocumentIntoRawChunks(content: string): string[] {
  // Normalize line endings
  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Split by day separators (3+ underscores on their own line)
  const chunks = text.split(/^[_]{3,}$/m);
  const allPosts: string[] = [];

  for (const chunk of chunks) {
    // Then split each day by em dash on its own line
    const dayPosts = chunk.split(/^—$/m);
    allPosts.push(...dayPosts);
  }

  // Return raw chunks - they'll be processed through the pipeline
  return allPosts
    .map(p => p.trim())
    .filter(p => p.length > 0);
}
