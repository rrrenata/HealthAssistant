import { jest } from '@jest/globals';

// --- МОКИ (Mocks) ---
const mockBotInstance = {
  onText: jest.fn(),
  on: jest.fn(),
  sendMessage: jest.fn(),
  answerCallbackQuery: jest.fn(),
};

jest.unstable_mockModule('node-telegram-bot-api', () => {
  return {
    default: jest.fn().mockImplementation(() => mockBotInstance),
  };
});

jest.unstable_mockModule('dotenv', () => ({
  default: {
    config: jest.fn(),
  },
}));

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('../src/utils/logger.js', () => ({ logger }));

// ИСПРАВЛЕНИЕ ОШИБКИ: Мокирование всех экспортов из sessionManager.js
const sessionManager = {
  getStep: jest.fn(),
  setStep: jest.fn(),
  clearSession: jest.fn(),
};
jest.unstable_mockModule('../src/utils/sessionManager.js', () => (sessionManager));


// --- ИМПОРТЫ ДАННЫХ И ТЕСТИРУЕМЫХ МОДУЛЕЙ ---
const { diagnosisTree: realDiagnosisTree } = 
    await import('../src/diagnosisTree.js'); 

// Импортируем clearSession (это уже мокированная функция)
const { clearSession } = await import('../src/utils/sessionManager.js');

const { default: runServer } = await import('../src/server.js');
const { handleBotError } = await import('../src/utils/errorHandler.js');


describe('HealthAssistant Bot Integration Tests (Server, Session, Data)', () => {
  let listeners = {};
  let textListeners = [];

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = {};
    textListeners = [];

    mockBotInstance.on.mockImplementation((event, handler) => {
      listeners[event] = handler;
    });

    mockBotInstance.onText.mockImplementation((regex, handler) => {
      textListeners.push({ regex, handler });
    });

    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_123';
  });

  // --- Вспомогательные функции для имитации действий пользователя ---
  const sendText = (text, chatId = 123) => {
    const msg = { chat: { id: chatId }, text };
    const commandHandler = textListeners.find(l => l.regex.test(text));
    if (commandHandler) {
      commandHandler.handler(msg);
      return;
    }
    if (listeners['message']) {
      listeners['message'](msg);
    }
  };

  const sendCallback = (dataObj, chatId = 123) => {
    const query = {
      id: 'cb_query_id',
      data: JSON.stringify(dataObj),
      message: { chat: { id: chatId } }
    };
    if (listeners['callback_query']) {
      listeners['callback_query'](query);
    }
  };

  // --- ТЕСТЫ SERVER.JS (ВЕТКИ И СЦЕНАРИИ) ---
  
  test('Should not start if token is missing (server.js line 15)', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    runServer();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('КРИТИЧЕСКАЯ ОШИБКА'), 
      expect.any(Error)
    );
  });
  
  test('Diagnostic Flow: Should cover isDiagnosis branch in sendQuestion (server.js lines 30-32)', async () => {
    runServer();
    
    realDiagnosisTree.temp_diag_step = {
      isDiagnosis: true,
      text: "Это прямой тестовый диагноз"
    };
    
    sendText('/symptoms_check'); 
    
    sendCallback({ type: 'next', step: 'temp_diag_step' });
    
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      '📋 **Результат:** Это прямой тестовый диагноз',
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
    expect(clearSession).toHaveBeenCalledWith(123); 
    delete realDiagnosisTree.temp_diag_step;
  });

  test('Session Logic: Text input without active session', async () => {
    runServer();
    clearSession(123); 
    // Для этого теста getStep должен вернуть undefined
    sessionManager.getStep.mockReturnValueOnce(undefined);
    
    sendText('Просто привет');
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Используйте команды')
    );
  });
  
  test('Diagnostic Flow: Start -> Step -> Diagnosis', async () => {
    runServer();
    
    sendText('/symptoms_check');
    sendCallback({ type: 'next', step: 'head_pain' });
    sendCallback({ type: 'next', step: 'head_pulsing' });
    sendCallback({ type: 'diag', id: 'HD-MIG-01' });

    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Вероятно, у вас мигрень'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  test('Doctor Search Flow', async () => {
    runServer();
    sendText('/find_doctor');
    sendCallback({ type: 'doctor', id: 'therapist' });
    
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Городская поликлиника'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  test('Doctor Search: Unknown Specialist ID (Error case)', async () => {
    runServer();
    sendCallback({ type: 'doctor', id: 'unknown_specialist_999' });
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      'К сожалению, информация по этому специалисту временно недоступна.'
    );
  });

  test('Diagnosis: Unknown Diagnosis ID (Error case)', async () => {
    runServer();
    sendCallback({ type: 'diag', id: 'UNKNOWN_DIAG_ID' });
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('произошла ошибка'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  test('Error Handling: Missing Step in Diagnosis Tree', async () => {
    runServer();
    sendCallback({ type: 'next', step: 'ghost_step_ooo' });
    
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Попытка перехода на несуществующий шаг'),
      expect.any(Object)
    );
    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Ошибка сценария')
    );
  });
});

// --- ТЕСТЫ ERRORHANDLER.JS (100% coverage) ---
describe('Error Handler Unit Tests (100% coverage)', () => {
  const CHAT_ID = 999;
    
  // Сбрасываем счетчик вызовов sendMessage перед каждым тестом
  beforeEach(() => {
    mockBotInstance.sendMessage.mockClear(); 
    logger.error.mockClear();
  });
    
  test('handleBotError: Should cover ETELEGRAM branch (Line 15)', async () => { 
    const telegramError = new Error('Test ETELEGRAM Error');
    telegramError.code = 'ETELEGRAM'; 

    handleBotError(mockBotInstance, telegramError, CHAT_ID, 'Force ETELEGRAM Test');

    expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      expect.stringContaining('Ошибка взаимодействия с Telegram. Выберите вариант')
    );
    expect(logger.error).toHaveBeenCalled();
  });

  test('handleBotError: Should NOT send message if chatId is missing', async () => { 
    const genericError = new Error('Generic Error');

    handleBotError(mockBotInstance, genericError, undefined, 'No Chat ID Test');

    expect(logger.error).toHaveBeenCalled();
    expect(mockBotInstance.sendMessage).not.toHaveBeenCalled(); 
  });
});