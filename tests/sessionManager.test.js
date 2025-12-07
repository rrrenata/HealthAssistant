import { getStep, setStep, clearSession } from '../src/utils/sessionManager.js';

describe('Session Manager (Step Tracking)', () => {
  const TEST_CHAT_ID_1 = 123456789;
  const TEST_CHAT_ID_2 = 987654321;
  const INITIAL_STEP = 'start';
  const NEXT_STEP = 'symptom_select';
  const FINAL_STEP = 'head_pain_query';
  afterEach(() => {
    clearSession(TEST_CHAT_ID_1);
    clearSession(TEST_CHAT_ID_2);
  });
  test('should return undefined for a user with no active session', () => {
    const step = getStep(TEST_CHAT_ID_1);
    expect(step).toBeUndefined();
  });
  test('should correctly set and retrieve the current step ID for a user', () => {
    setStep(TEST_CHAT_ID_1, INITIAL_STEP);
    
    const retrievedStep = getStep(TEST_CHAT_ID_1);
    expect(retrievedStep).toBe(INITIAL_STEP);
  });
  test('should update the current step ID to a new value', () => {
    setStep(TEST_CHAT_ID_1, INITIAL_STEP);
    expect(getStep(TEST_CHAT_ID_1)).toBe(INITIAL_STEP);
    setStep(TEST_CHAT_ID_1, NEXT_STEP);
    expect(getStep(TEST_CHAT_ID_1)).toBe(NEXT_STEP);
  });
  test('should maintain separate step IDs for different chat IDs', () => {
    setStep(TEST_CHAT_ID_1, FINAL_STEP);
    setStep(TEST_CHAT_ID_2, INITIAL_STEP);
    expect(getStep(TEST_CHAT_ID_1)).toBe(FINAL_STEP);
    expect(getStep(TEST_CHAT_ID_2)).toBe(INITIAL_STEP);
  });
  test('should successfully clear and remove the session data', () => {
    setStep(TEST_CHAT_ID_1, FINAL_STEP);
    expect(getStep(TEST_CHAT_ID_1)).toBe(FINAL_STEP);
    clearSession(TEST_CHAT_ID_1);
    expect(getStep(TEST_CHAT_ID_1)).toBeUndefined();
  });
  test('should not throw an error when clearing a non-existent session', () => {
    expect(() => clearSession(999999999)).not.toThrow();
    setStep(TEST_CHAT_ID_1, FINAL_STEP);
    clearSession(999999999); 
    expect(getStep(TEST_CHAT_ID_1)).toBe(FINAL_STEP);
  });
});