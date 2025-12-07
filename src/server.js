import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'
import { diagnosisTree, finalDiagnoses } from './diagnosisTree.js' 
import { doctorRecommendations } from './doctorRecommendations.js'
import { getStep, setStep, clearSession } from './utils/sessionManager.js' 
import { logger } from './utils/logger.js' 
import { handleBotError } from './utils/errorHandler.js'

const runServer = () => {
  dotenv.config(); 
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    logger.error('КРИТИЧЕСКАЯ ОШИБКА: Токен Telegram не найден в .env файле', new Error('Missing token'));
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Глобальные error handlers для polling и бота
  bot.on('polling_error', (error) => {
    logger.error('Polling error:', error);
  });

  bot.on('error', (error) => {
    logger.error('Bot error:', error);
  });

  // Глобальные handlers для uncaught ошибок в Node.js
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  const sendQuestion = (chatId, stepId) => {
    const step = diagnosisTree[stepId];

    if (!step || !diagnosisTree) {
      bot.sendMessage(chatId, "Ошибка сценария. Начните заново с /symptoms_check");
      clearSession(chatId);
      logger.warn(`Попытка перехода на несуществующий шаг: ${stepId}`, { chatId });
      return;
    }

    if (step.isDiagnosis) {
      bot.sendMessage(chatId, `📋 **Результат:** ${step.text}`, { parse_mode: 'Markdown' });
      clearSession(chatId);
      return;
    }

    const keyboard = step.buttons ? step.buttons.map(row => {
      return row.map(btn => {
        const callbackData = JSON.stringify(
          btn.diagnosis 
            ? { type: 'diag', id: btn.diagnosis } 
            : { type: 'next', step: btn.next }
        );
        return {
          text: btn.text,
          callback_data: callbackData 
        };
      });
    }) : [];

    bot.sendMessage(chatId, step.question, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    setStep(chatId, stepId);
    logger.info(`Сессия ${chatId} перешла на шаг: ${stepId}`);
  };

  // 1. Команда /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
      'Привет! Я HealthAssistant. Я могу провести первичную диагностику (/symptoms_check) или найти врача (/find_doctor).');
  });

  // 2. Команда /symptoms_check (Запуск диагностики)
  bot.onText(/\/symptoms_check/, (msg) => {
    const chatId = msg.chat.id;
    sendQuestion(chatId, 'start');
  });

  // 3. Команда /find_doctor (Запуск поиска врача)
  bot.onText(/\/find_doctor/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = doctorRecommendations.specialists.map(specialist => {
      const callbackData = JSON.stringify({ type: 'doctor', id: specialist.id });
      
      return [{
        text: specialist.text,
        callback_data: callbackData 
      }];
    });

    bot.sendMessage(chatId, '🩺 **Выберите специалиста, которого вы хотите найти:**', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  });

  // 4. Обработка нажатий на Inline-кнопки (callback_query)
  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    
    try {
      const data = JSON.parse(query.data);
      logger.info(`Получен callback_query`, { chatId, data });
      bot.answerCallbackQuery(query.id);

      if (data.type === 'next') {
        sendQuestion(chatId, data.step);

      } else if (data.type === 'diag') {
        const diagnosisText = finalDiagnoses[data.id] || "К сожалению, произошла ошибка. Диагноз не найден.";
        bot.sendMessage(chatId, `✅ **Предварительный результат:**\n${diagnosisText}\n\n⚠️ _Это не медицинское заключение. Обратитесь к врачу._`, { parse_mode: 'Markdown' });
        clearSession(chatId);

      } else if (data.type === 'doctor') {
        const specialistId = data.id;
        const rec = doctorRecommendations.data[specialistId];

        if (rec) {
          const contactsList = rec.contacts.join('\n');
                
          const messageText = 
                    `**${rec.title}**\n\n` + 
                    `_Рекомендация:_ ${rec.info}\n\n` + 
                    `**📞 Контакты и учреждения:**\n${contactsList}\n\n` + 
                    `_Помните: В экстренных случаях звоните 112._`;
                
          bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, 'К сожалению, информация по этому специалисту временно недоступна.');
        }
      }
    } catch (e) {
      handleBotError(bot, e, chatId, 'callback_query handler');
    }
  });

  // 5. Обработка обычных текстовых сообщений и неизвестных команд
  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text) {
      if (text.startsWith('/') && !['/start', '/symptoms_check', '/find_doctor'].includes(text)) {
        bot.sendMessage(chatId, 'Неизвестная команда. Попробуй /start, /symptoms_check или /find_doctor.');
        logger.warn(`Неизвестная команда от ${chatId}: ${text}`);
        return;
      }

      if (!text.startsWith('/') && getStep(chatId)) {
        bot.sendMessage(chatId, 'Пожалуйста, выберите один из вариантов ответа на вопрос выше.');
        logger.warn(`Пользователь ${chatId} ввел текст "${text}" во время активной сессии`);
      } else if (!text.startsWith('/')) {
        bot.sendMessage(chatId, 'Используйте команды /symptoms_check или /find_doctor для начала работы.');
      }
    } else {
      // Для non-text сообщений (фото, стикеры, видео и т.д.)
      bot.sendMessage(chatId, 'Извини, я понимаю только текст и команды. Попробуй /start.');
      logger.warn(`Non-text сообщение от ${chatId}`);
    }
  });

  logger.info('HealthAssistant запущен. Ожидание сообщений...');
}

export default runServer;