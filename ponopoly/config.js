// Настройки клиента Po'Nopoly. Файл подключается до main.js.
window.PONOPOLY_CONFIG = {
  // Адрес WebSocket-сервера комнат (server/index.js), например 'wss://ponopoly.example.com/ws'.
  // Пусто — клиент попробует /ws на том же хосте (так работает, если статику раздаёт сам сервер).
  serverUrl: '',
  // Имя бота и короткое имя Mini App из BotFather — нужны для ссылок-приглашений t.me/<bot>/<app>?startapp=КОД
  botName: '',
  appName: '',
};
