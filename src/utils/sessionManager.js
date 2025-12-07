const sessions = new Map();

export function getStep(chatId) {
  return sessions.get(chatId);
}

export function setStep(chatId, stepId) {
  sessions.set(chatId, stepId);
}

export function clearSession(chatId) {
  sessions.delete(chatId);
}