/**
 * Quality Pipeline Orchestrator
 *
 * Coordinates the multi-stage quality pipeline:
 * 1. Pre-validation - Check for issues
 * 2. Auto-correction - Fix auto-fixable issues
 * 3. Formatting - Apply consistent formatting
 * 4. Post-validation - Final quality gate
 */

import { preValidate } from './preValidator.js';
import { autoCorrect, normalizeBullets, cleanWhitespace } from './autoCorrector.js';
import { formatPost, parseDocumentIntoRawChunks } from './formatter.js';
import { postValidate } from './postValidator.js';
import { QualityIssue } from './qualityRules.js';

export interface PipelineResult {
  originalContent: string;
  processedContent: string;
  isValid: boolean;
  qualityScore: number;
  allIssues: QualityIssue[];
  corrections: string[];
  stage: 'pre-validation' | 'auto-correction' | 'formatting' | 'post-validation' | 'complete';
  rejectionReason?: string;
}

/**
 * Run a single post through the complete quality pipeline
 */
export function runQualityPipeline(rawContent: string): PipelineResult {
  const allIssues: QualityIssue[] = [];
  const allCorrections: string[] = [];

  // ============================================
  // STAGE 1: Pre-validation
  // ============================================
  const preResult = preValidate(rawContent);
  allIssues.push(...preResult.issues);

  // If pre-validation finds non-fixable errors, reject early
  const hasNonFixablePreErrors = preResult.issues.some(
    issue => issue.severity === 'error' && !issue.autoFixable
  );

  if (hasNonFixablePreErrors) {
    return {
      originalContent: rawContent,
      processedContent: rawContent,
      isValid: false,
      qualityScore: preResult.score,
      allIssues,
      corrections: [],
      stage: 'pre-validation',
      rejectionReason: preResult.issues
        .filter(i => i.severity === 'error' && !i.autoFixable)
        .map(i => i.description)
        .join('; ')
    };
  }

  // ============================================
  // STAGE 2: Auto-correction
  // ============================================
  let processedContent = rawContent;

  // Apply auto-corrections for detected issues
  const fixableIssues = preResult.issues.filter(i => i.autoFixable);
  if (fixableIssues.length > 0) {
    const correctionResult = autoCorrect(processedContent, fixableIssues);
    processedContent = correctionResult.content;
    allCorrections.push(...correctionResult.corrections);
  }

  // Normalize bullets (* to •)
  const bulletResult = normalizeBullets(processedContent);
  processedContent = bulletResult.content;
  allCorrections.push(...bulletResult.corrections);

  // Clean up whitespace
  const whitespaceResult = cleanWhitespace(processedContent);
  processedContent = whitespaceResult.content;
  allCorrections.push(...whitespaceResult.corrections);

  // ============================================
  // STAGE 3: Formatting
  // ============================================
  processedContent = formatPost(processedContent);

  // ============================================
  // STAGE 4: Post-validation
  // ============================================
  const postResult = postValidate(processedContent);
  allIssues.push(...postResult.issues);

  // If post-validation finds auto-fixable issues, fix them
  const postFixableIssues = postResult.issues.filter(i => i.autoFixable);
  if (postFixableIssues.length > 0) {
    const finalFixResult = autoCorrect(processedContent, postFixableIssues);
    processedContent = finalFixResult.content;
    allCorrections.push(...finalFixResult.corrections);

    // Re-format after additional corrections
    processedContent = formatPost(processedContent);
  }

  // Calculate final quality score (average of pre and post, weighted toward post)
  const finalScore = Math.round((preResult.score * 0.3) + (postResult.score * 0.7));

  // Determine if post is valid
  const isValid = postResult.isValid && finalScore >= 50;

  // Build rejection reason if not valid
  let rejectionReason: string | undefined;
  if (!isValid) {
    const errorIssues = allIssues.filter(i => i.severity === 'error');
    if (errorIssues.length > 0) {
      rejectionReason = errorIssues.map(i => i.description).join('; ');
    } else if (finalScore < 50) {
      rejectionReason = `Quality score too low (${finalScore}/100)`;
    }
  }

  return {
    originalContent: rawContent,
    processedContent: processedContent.trim(),
    isValid,
    qualityScore: finalScore,
    allIssues,
    corrections: [...new Set(allCorrections)], // Dedupe corrections
    stage: 'complete',
    rejectionReason
  };
}

/**
 * Process multiple posts through the pipeline
 */
export function runBatchPipeline(rawPosts: string[]): PipelineResult[] {
  return rawPosts.map(post => runQualityPipeline(post));
}

/**
 * Parse a document and run all posts through the pipeline
 */
export function processDocument(documentContent: string): {
  rawChunks: string[];
  results: PipelineResult[];
  summary: {
    total: number;
    valid: number;
    rejected: number;
    corrected: number;
    avgQualityScore: number;
  };
} {
  // Parse document into raw chunks
  const rawChunks = parseDocumentIntoRawChunks(documentContent);

  // Run each chunk through the pipeline
  const results = runBatchPipeline(rawChunks);

  // Calculate summary
  const valid = results.filter(r => r.isValid).length;
  const rejected = results.filter(r => !r.isValid).length;
  const corrected = results.filter(r => r.corrections.length > 0).length;
  const totalScore = results.reduce((sum, r) => sum + r.qualityScore, 0);
  const avgQualityScore = results.length > 0 ? Math.round(totalScore / results.length) : 0;

  return {
    rawChunks,
    results,
    summary: {
      total: results.length,
      valid,
      rejected,
      corrected,
      avgQualityScore
    }
  };
}

// Re-export for convenience
export { formatPost, parseDocumentIntoRawChunks } from './formatter.js';
export { preValidate } from './preValidator.js';
export { postValidate } from './postValidator.js';
export { autoCorrect, normalizeBullets, cleanWhitespace } from './autoCorrector.js';
export * from './qualityRules.js';
