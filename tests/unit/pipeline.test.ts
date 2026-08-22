import { describe, it, expect } from 'vitest';
import { isValidCandidateTransition } from '../../src/lib/validations/candidate';

describe('Unit Tests: Candidate Status Transitions State Machine', () => {
  it('should allow valid forward progression transitions', () => {
    expect(isValidCandidateTransition('REVIEW_REQUIRED', 'APPROVED')).toBe(true);
    expect(isValidCandidateTransition('APPROVED', 'SHORTLISTED')).toBe(true);
    expect(isValidCandidateTransition('SHORTLISTED', 'SCREENING')).toBe(true);
    expect(isValidCandidateTransition('SCREENING', 'INTERVIEW')).toBe(true);
    expect(isValidCandidateTransition('INTERVIEW', 'OFFER')).toBe(true);
    expect(isValidCandidateTransition('OFFER', 'HIRED')).toBe(true);
  });

  it('should allow valid backward fallback transitions for undoing actions', () => {
    expect(isValidCandidateTransition('SHORTLISTED', 'APPROVED')).toBe(true);
    expect(isValidCandidateTransition('SCREENING', 'SHORTLISTED')).toBe(true);
    expect(isValidCandidateTransition('INTERVIEW', 'SCREENING')).toBe(true);
    expect(isValidCandidateTransition('OFFER', 'INTERVIEW')).toBe(true);
    expect(isValidCandidateTransition('HIRED', 'OFFER')).toBe(true);
  });

  it('should allow transitions to terminal states (REJECTED and WITHDRAWN)', () => {
    expect(isValidCandidateTransition('APPROVED', 'REJECTED')).toBe(true);
    expect(isValidCandidateTransition('APPROVED', 'WITHDRAWN')).toBe(true);
    expect(isValidCandidateTransition('SHORTLISTED', 'REJECTED')).toBe(true);
    expect(isValidCandidateTransition('SCREENING', 'REJECTED')).toBe(true);
    expect(isValidCandidateTransition('INTERVIEW', 'REJECTED')).toBe(true);
    expect(isValidCandidateTransition('OFFER', 'REJECTED')).toBe(true);
    expect(isValidCandidateTransition('HIRED', 'WITHDRAWN')).toBe(true);
  });

  it('should allow undoing terminal states (undoreject/undowithdraw)', () => {
    expect(isValidCandidateTransition('REJECTED', 'APPROVED')).toBe(true);
    expect(isValidCandidateTransition('REJECTED', 'SHORTLISTED')).toBe(true);
    expect(isValidCandidateTransition('WITHDRAWN', 'APPROVED')).toBe(true);
    expect(isValidCandidateTransition('WITHDRAWN', 'SHORTLISTED')).toBe(true);
  });

  it('should reject arbitrary invalid transitions', () => {
    expect(isValidCandidateTransition('APPROVED', 'HIRED')).toBe(false);
    expect(isValidCandidateTransition('REVIEW_REQUIRED', 'HIRED')).toBe(false);
    expect(isValidCandidateTransition('APPROVED', 'INTERVIEW')).toBe(false);
    expect(isValidCandidateTransition('HIRED', 'INTERVIEW')).toBe(false);
    expect(isValidCandidateTransition('REJECTED', 'HIRED')).toBe(false);
    expect(isValidCandidateTransition('WITHDRAWN', 'HIRED')).toBe(false);
  });

  it('should return true for identical state transitions (no-op)', () => {
    expect(isValidCandidateTransition('APPROVED', 'APPROVED')).toBe(true);
    expect(isValidCandidateTransition('HIRED', 'HIRED')).toBe(true);
  });
});
