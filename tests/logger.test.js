import { logger } from '../src/utils/logger.js';
import { jest } from '@jest/globals';

describe('Logger Unit Tests (100% coverage)', () => {
  const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });
  test('logger.info should log without context', () => {
    logger.info('Test Info Message');
    expect(spyLog).toHaveBeenCalled();
    expect(spyLog.mock.calls[0][0]).not.toContain('Context:');
  });
  test('logger.warn should log with serializable context', () => {
    logger.warn('Test Warning Message', { user: 123, active: true });
    expect(spyWarn).toHaveBeenCalled();
    expect(spyWarn.mock.calls[0][0]).toContain('\nContext: {\n  "user": 123,\n  "active": true\n}');
  });
  test('logger.error should log error stack', () => {
    const error = new Error('Test Stack Error');
    logger.error('Critical failure', error);
    expect(spyError).toHaveBeenCalled();
    expect(spyError.mock.calls[0][0]).toContain(`Critical failure -> ${error.stack}`);
  });
  test('logger.error should log error message when stack is missing', () => {
    const error = { message: 'Simple error object' };
    logger.error('Simple failure', error);
    expect(spyError).toHaveBeenCalled();
    expect(spyError.mock.calls[0][0]).toContain('Simple failure -> Simple error object');
  });
  test('logger.info should handle circular reference in context (catch block)', () => {
    const a = {};
    a.b = a; 
    logger.info('Circular Test', a);
    expect(spyLog).toHaveBeenCalled();
    expect(spyLog.mock.calls[0][0]).toContain('\nContext: [object Object]');
  });
});