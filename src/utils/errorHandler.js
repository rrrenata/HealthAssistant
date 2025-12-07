import { logger } from './logger.js';
import { clearSession } from './sessionManager.js';

export function handleBotError(bot, error, chatId, context) {
  const errorMessage = `Произошла ошибка в логике: "${context}"`;
  logger.error(errorMessage, error, { chatId, context });
  let userFriendlyMessage = "Критическая ошибка. Пожалуйста, начните заново, используя /start.";
  if (error.code && error.code === 'ETELEGRAM') {
    userFriendlyMessage = `Ошибка взаимодействия с Telegram. Выберите вариант из предложенных кнопок или начните /start.`;
  } 
  if (chatId) {
    bot.sendMessage(chatId, userFriendlyMessage);
    clearSession(chatId); 
  }
}