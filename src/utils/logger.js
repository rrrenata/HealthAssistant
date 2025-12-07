function formatMessage(level, message, context = '') {
  const timestamp = new Date().toISOString();
  let output = `[${timestamp}] [${level}] ${message}`;
  if (context) {
    try {
      output += `\nContext: ${JSON.stringify(context, null, 2)}`;
    } catch { 
      output += `\nContext: ${context}`;
    }
  }
  return output;
}
export const logger = {
  info: (message, context) => {
    console.log(formatMessage('INFO', message, context));
  },
  warn: (message, context) => {
    console.warn(formatMessage('WARN', message, context));
  },
  error: (message, error, context) => {
    const fullMessage = `${message} -> ${error.stack || error.message}`;
    console.error(formatMessage('ERROR', fullMessage, context));
  },
};