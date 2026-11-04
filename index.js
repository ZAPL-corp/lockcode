#!/usr/bin/env node
'use strict';

const chalk = require('chalk');
const Conf = require('conf');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');

const pkg = require('./package.json');
const config = new Conf({ projectName: 'lockcode' });

const C = {
  a: '#cddcff',
  b: '#8aa4e6',
  amber: '#e9b872',
  green: '#7ed0a3',
  red: '#f08a8a',
  ink: '#e6ecf7',
  body: '#b9c4d6',
  dim: '#77839a',
  faint: '#4c586c',
  line: '#2a3546'
};

const ANSI = /\u001b\[[0-9;]*m/g;
const visible = (s) => String(s).replace(ANSI, '');
const paint = (color, s) => chalk.hex(color)(s);

const GIGA_OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGA_API = 'https://api.giga.chat/v1';
const GIGA_DEFAULT_MODEL = 'GigaChat-3-Ultra';
const GIGA_DEFAULT_SCOPE = 'GIGACHAT_API_PERS';
const GIGA_LABEL = 'GigaChat 3 Ultra';

const GLYPHS = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111']
};

const EDU = {
  OpenRouter: 'https://openrouter.ai/api/v1',
  DeepSeek: 'https://api.deepseek.com',
  OpenAI: 'https://api.openai.com/v1',
  Mistral: 'https://api.mistral.ai/v1',
  Gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  Claude: 'https://api.anthropic.com/v1'
};

const PROVIDERS = ['GigaChat', 'OpenRouter', 'DeepSeek', 'OpenAI', 'Mistral', 'Gemini', 'Custom'];

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const OAUTH_PORTS = [53682, 53683, 53684];

const CONNECTORS = [
  {
    id: 'gmail',
    title: 'Gmail',
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    note: {
      ru: 'читает письма, отвечает в ветке и отправляет новые',
      en: 'reads mail, replies in thread and sends new messages'
    },
    tools: [
      {
        type: 'function',
        function: {
          name: 'gmail_search',
          description: 'Найти письма в Gmail. Запрос в синтаксисе Gmail: from:, subject:, newer_than:7d, is:unread.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'поисковый запрос Gmail, пусто — последние письма' },
              max: { type: 'number', description: 'сколько писем вернуть, до 20' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail_read',
          description: 'Прочитать письмо целиком по его id.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string', description: 'id письма из gmail_search' } },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail_send',
          description: 'Отправить новое письмо через Gmail.',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string', description: 'текст письма' },
              cc: { type: 'string' },
              bcc: { type: 'string' }
            },
            required: ['to', 'subject', 'body']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'gmail_reply',
          description: 'Ответить на письмо в той же ветке.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'id письма, на которое отвечаем' },
              body: { type: 'string', description: 'текст ответа' }
            },
            required: ['id', 'body']
          }
        }
      }
    ]
  },
  {
    id: 'drive',
    title: 'Google Drive',
    scopes: ['https://www.googleapis.com/auth/drive'],
    note: {
      ru: 'загружает файлы в выбранную папку Drive и скачивает их обратно',
      en: 'uploads files to the chosen Drive folder and downloads them back'
    },
    tools: [
      {
        type: 'function',
        function: {
          name: 'drive_search',
          description: 'Найти файлы и папки в Google Drive по части имени.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'часть имени файла' },
              max: { type: 'number', description: 'сколько файлов вернуть, до 50' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'drive_upload',
          description: 'Загрузить файл из папки проекта в Google Drive.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'путь к файлу внутри папки проекта' },
              name: { type: 'string', description: 'имя файла в Drive, по умолчанию как локальное' },
              folder: { type: 'string', description: 'папка в Drive по имени вместо настроенной' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'drive_download',
          description: 'Скачать файл из Google Drive в локальную папку, заданную в /connectors.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'id файла из drive_search' },
              path: { type: 'string', description: 'путь внутри папки проекта, по умолчанию — настроенная папка' }
            },
            required: ['id']
          }
        }
      }
    ]
  }
];

const MIME_TYPES = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  pdf: 'application/pdf',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4'
};

const STR = {
  ru: {
    model: 'модель',
    folder: 'папка',
    mode: 'режим',
    access: 'доступ',
    accessFull: 'полный',
    accessSelective: 'выборочно',
    accessAggression: 'агрессия',
    accessChanged: 'режим доступа',
    permAllow: 'разрешить',
    permDenied: 'запрещено пользователем',
    fileCreated: 'создан',
    fileUpdated: 'изменён',
    fileDeleted: 'удалён',
    outside: 'путь вне папки проекта',
    submodels: 'модели провайдера',
    switched: 'модель переключена на',
    serverChip: 'через сервер',
    serverOff: 'прокси не настроен — работаем с локальным ключом',
    serverHint: '/server <url> <токен> · /server off — выключить',
    serverSet: 'прокси',
    serverOffSet: 'прокси отключён',
    serverBadUrl: 'нужен адрес вида https://…',
    keyfileChip: 'ключ из файла',
    keyfileOff: 'дистанционный ключ отключён',
    keyfileBad: 'нужен адрес вида https://…',
    keyfileSet: 'ключ читается из',
    keyfileHint: '/keyfile <url> — брать ключ из текстового файла · /keyfile off',
    keyfilePublic: 'файл держите закрытым: кто знает URL, тот тратит вашу квоту',
    modelDeleted: 'модель удалена',
    modelDelUsage: 'укажите имя: /model -del <имя>',
    noModel: 'модель не выбрана — /add или /model',
    loopLimit: 'остановился: слишком много шагов подряд — уточните задачу',
    emptyAnswer: 'модель не вернула текст',
    enterSend: 'отправить',
    storageFail: 'не удалось записать данные в документы',
    memoryEmptyText: 'пустая запись',
    memorySaved: 'сохранено в память',
    memoryCleared: 'память очищена',
    memoryEmpty: 'в памяти пока пусто',
    memoryAsk: 'удалить все записи памяти',
    chatTitle: 'ЧАТЫ',
    chatWord: 'чат',
    chatMessages: 'сообщений',
    chatNotFound: 'нет такого чата',
    chatEmpty: 'чатов пока нет',
    chatLoaded: 'загружен чат',
    switchAsk: 'перейти в папку и продолжить там',
    switchDenied: 'запрос отменён',
    ready: 'готов к работе',
    needsKey: 'нужен ключ — /add',
    bye: 'до встречи',
    cancelled: 'отменено',
    provider: 'провайдер (1–7 или имя)',
    modelName: 'модель',
    apiKey: 'API-ключ',
    baseUrl: 'базовый URL API (https://…)',
    authKey: 'ключ авторизации GigaChat',
    clientId: 'Client ID (можно пропустить)',
    scope: 'scope',
    added: 'добавлена',
    keyNote: 'ключ сохранён локально и никуда, кроме провайдера, не уходит',
    nothing: 'ничего не найдено',
    server: 'SERVER',
    user: 'USER',
    folderSet: 'папка проекта',
    folderBad: 'такой папки нет',
    modeSet: 'режим',
    langSet: 'язык',
    noKey: 'нет ключа у',
    unknownEndpoint: 'нет адреса API у',
    asking: 'обращение к',
    requestFailed: 'запрос не удался',
    tokenFailed: 'не удалось получить токен GigaChat',
    tokenRejected: 'ключ авторизации не принят — проверьте Authorization key из кабинета',
    tlsHint: 'не хватает корневого сертификата Минцифры — он лежит в certs/, либо задайте NODE_EXTRA_CA_CERTS',
    tokens: 'токенов',
    system: 'Ты — LOCKCODE, агент для работы с кодом в терминале. Отвечай кратко, точно и по делу.',
    errorTitle: 'ошибка',
    connectors: 'коннекторы',
    connectorsTitle: 'КОННЕКТОРЫ',
    connectorPick: 'номер коннектора',
    connectorUnknown: 'нет такого коннектора',
    connectorHint: '/connectors <номер> — подключить, включить или отключить',
    connectorMenu: '1 подключить · 2 включить или выключить · 3 забыть доступ · Enter — назад',
    connectorOnState: 'включён',
    connectorOffState: 'выключен',
    connectorNone: 'не подключён',
    connectorOnOk: 'коннектор включён',
    connectorOffOk: 'коннектор выключен',
    connectorForgot: 'доступ удалён',
    connectorNeed: 'нужен подключённый коннектор — /connectors',
    connectorClientId: 'Google Client ID',
    connectorClientSecret: 'Google Client Secret',
    connectorLink: 'откройте ссылку, если браузер не открылся сам',
    connectorWait: 'жду подтверждения доступа в браузере',
    connectorOk: 'подключён',
    connectorFail: 'не удалось подключить коннектор',
    connectorTimeout: 'браузер не ответил за 5 минут — повторите /connectors',
    connectorDenied: 'доступ не выдан',
    connectorDriveFolder: 'папка в Drive (имя или ID, пусто — корень)',
    connectorLocalDir: 'папка для скачивания (пусто — папка проекта)',
    connectorStatus: 'статус',
    saved: 'сохранено',
    help: [
      ['/help', 'этот список'],
      ['/mode [chat|agent]', 'режим работы'],
      ['/modeagent [1|2|3]', 'доступ агента к файлам'],
      ['/submodels', 'модели провайдера и переключение'],
      ['/server [url token|off]', 'общий прокси вместо локального ключа'],
      ['/models', 'модели SERVER и USER'],
      ['/add', 'добавить модель и ключ'],
      ['/model <имя>', 'выбрать активную модель'],
      ['/model -del <имя>', 'удалить модель из списка'],
      ['/chat [имя]', 'чат из документов и его сообщения'],
      ['/cleanmemory', 'удалить всю память из документов'],
      ['/connectors', 'Gmail и Google Drive для агента'],
      ['/keyfile <url>', 'брать ключ из текстового файла по ссылке'],
      ['/limits', 'расход лимитов'],
      ['/folder <путь>', 'папка проекта'],
      ['/lang [ru|en]', 'язык интерфейса'],
      ['/clear', 'очистить экран и контекст'],
      ['/exit', 'выход']
    ]
  },
  en: {
    model: 'model',
    folder: 'folder',
    mode: 'mode',
    access: 'access',
    accessFull: 'full',
    accessSelective: 'selective',
    accessAggression: 'aggression',
    accessChanged: 'access mode',
    permAllow: 'allow',
    permDenied: 'denied by the user',
    fileCreated: 'created',
    fileUpdated: 'updated',
    fileDeleted: 'deleted',
    outside: 'path outside the project folder',
    submodels: 'provider models',
    switched: 'model switched to',
    serverChip: 'via server',
    serverOff: 'no proxy configured — using the local key',
    serverHint: '/server <url> <token> · /server off — disable',
    serverSet: 'proxy',
    serverOffSet: 'proxy disabled',
    serverBadUrl: 'an address like https://… is required',
    keyfileChip: 'key from file',
    keyfileOff: 'remote key disabled',
    keyfileBad: 'an address like https://… is required',
    keyfileSet: 'key is read from',
    keyfileHint: '/keyfile <url> — read the key from a text file · /keyfile off',
    keyfilePublic: 'keep the file private: anyone with the URL spends your quota',
    modelDeleted: 'model removed',
    modelDelUsage: 'give a name: /model -del <name>',
    noModel: 'no model selected — /add or /model',
    loopLimit: 'stopped: too many steps in a row — refine the task',
    emptyAnswer: 'the model returned no text',
    enterSend: 'send',
    storageFail: 'could not write data into Documents',
    memoryEmptyText: 'empty note',
    memorySaved: 'saved to memory',
    memoryCleared: 'memory cleared',
    memoryEmpty: 'memory is empty',
    memoryAsk: 'delete every memory entry',
    chatTitle: 'CHATS',
    chatWord: 'chat',
    chatMessages: 'messages',
    chatNotFound: 'no such chat',
    chatEmpty: 'no chats yet',
    chatLoaded: 'chat loaded',
    switchAsk: 'switch to the folder and continue there',
    switchDenied: 'request cancelled',
    ready: 'ready',
    needsKey: 'no key — use /add',
    bye: 'bye',
    cancelled: 'cancelled',
    provider: 'provider (1–7 or name)',
    modelName: 'model',
    apiKey: 'API key',
    baseUrl: 'API base URL (https://…)',
    authKey: 'GigaChat authorization key',
    clientId: 'Client ID (optional)',
    scope: 'scope',
    added: 'added',
    keyNote: 'the key is stored locally and goes nowhere but the provider',
    nothing: 'nothing found',
    server: 'SERVER',
    user: 'USER',
    folderSet: 'project folder',
    folderBad: 'no such directory',
    modeSet: 'mode',
    langSet: 'language',
    noKey: 'no key for',
    unknownEndpoint: 'no API endpoint for',
    asking: 'calling',
    requestFailed: 'request failed',
    tokenFailed: 'could not get a GigaChat token',
    tokenRejected: 'authorization key rejected — check the Authorization key from your cabinet',
    tlsHint: 'missing the Russian root CA — it ships in certs/, or set NODE_EXTRA_CA_CERTS',
    tokens: 'tokens',
    system: 'You are LOCKCODE, a terminal coding agent. Answer briefly, precisely and to the point.',
    errorTitle: 'error',
    connectors: 'connectors',
    connectorsTitle: 'CONNECTORS',
    connectorPick: 'connector number',
    connectorUnknown: 'no such connector',
    connectorHint: '/connectors <number> — connect, enable or disable',
    connectorMenu: '1 connect · 2 enable or disable · 3 forget access · Enter — back',
    connectorOnState: 'enabled',
    connectorOffState: 'disabled',
    connectorNone: 'not connected',
    connectorOnOk: 'connector enabled',
    connectorOffOk: 'connector disabled',
    connectorForgot: 'access removed',
    connectorNeed: 'a connected connector is required — /connectors',
    connectorClientId: 'Google Client ID',
    connectorClientSecret: 'Google Client Secret',
    connectorLink: 'open the link if the browser did not start',
    connectorWait: 'waiting for the browser confirmation',
    connectorOk: 'connected',
    connectorFail: 'could not connect the connector',
    connectorTimeout: 'no answer from the browser in 5 minutes — repeat /connectors',
    connectorDenied: 'access was not granted',
    connectorDriveFolder: 'Drive folder (name or ID, empty — root)',
    connectorLocalDir: 'download folder (empty — project folder)',
    connectorStatus: 'status',
    saved: 'saved',
    help: [
      ['/help', 'this list'],
      ['/mode [chat|agent]', 'work mode'],
      ['/modeagent [1|2|3]', 'agent file access'],
      ['/submodels', 'provider models and switching'],
      ['/server [url token|off]', 'shared proxy instead of a local key'],
      ['/models', 'SERVER and USER models'],
      ['/add', 'add a model and key'],
      ['/model <name>', 'select active model'],
      ['/model -del <name>', 'remove a model from the list'],
      ['/chat [name]', 'a chat from Documents and its messages'],
      ['/cleanmemory', 'delete every memory entry'],
      ['/connectors', 'Gmail and Google Drive for the agent'],
      ['/keyfile <url>', 'read the key from a text file by URL'],
      ['/limits', 'usage limits'],
      ['/folder <path>', 'project folder'],
      ['/lang [ru|en]', 'interface language'],
      ['/clear', 'clear screen and context'],
      ['/exit', 'quit']
    ]
  }
};

const t = () => STR[config.get('language') === 'en' ? 'en' : 'ru'];

let rl = null;
let finished = false;
const queue = [];
let waiter = null;
let history = [];
const tokenCache = new Map();
let caBundle = null;

const STORE_DIR = 'lockcode';
let chatName = null;
let chatData = null;
let storageWarned = false;

const addMsg = (role, content, meta) => {
  history.push({ role, content });
  if (history.length > 24) history = history.slice(-24);
  recordMessage(role, content, meta);
};

function nowIso() {
  return new Date().toISOString();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDay(moment) {
  const date = moment ? new Date(moment) : new Date();
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function localTime(moment) {
  const date = moment ? new Date(moment) : new Date();
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function documentsDir() {
  const home = os.homedir();
  for (const name of ['Documents', 'Документы']) {
    const dir = path.join(home, name);
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch (error) {
      void error;
    }
  }
  return path.join(home, 'Documents');
}

function storeDir(kind) {
  return path.join(documentsDir(), STORE_DIR, kind);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    void error;
    return null;
  }
}

function storageWarning(error) {
  if (storageWarned) return;
  storageWarned = true;
  note(t().storageFail + ': ' + ((error && error.message) || error));
}

function chatSlug(name) {
  const slug = String(name == null ? '' : name)
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'chat';
}

function newChatName() {
  const date = new Date();
  const base =
    date.getFullYear() +
    '-' +
    pad2(date.getMonth() + 1) +
    '-' +
    pad2(date.getDate()) +
    '-' +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds());
  let name = base;
  let index = 2;
  while (fs.existsSync(path.join(storeDir('chats'), chatSlug(name)))) name = base + '-' + index++;
  return name;
}

function chatDir(name) {
  return path.join(storeDir('chats'), chatSlug(name));
}

function chatInfo(data) {
  const lines = [
    '# Чат ' + data.name,
    '',
    '- создан: ' + data.created,
    '- обновлён: ' + data.updated,
    '- сообщений: ' + data.messages.length,
    '- проект: ' + (data.project || '—'),
    '- модель: ' + (data.model || '—'),
    '',
    '## Переписка',
    ''
  ];
  data.messages.forEach((message) => {
    lines.push((message.role === 'user' ? '**Вы**' : '**LOCKCODE**') + ' · ' + message.time);
    lines.push('');
    lines.push(message.text);
    lines.push('');
    if (message.role !== 'user' && (message.model || message.tokens)) {
      lines.push('> ' + (message.model || '') + (message.tokens ? ' : ' + message.tokens + ' ' + t().tokens : ''));
      lines.push('');
    }
  });
  return lines.join('\n');
}

function writeChat(data) {
  const dir = ensureDir(chatDir(data.name));
  fs.writeFileSync(path.join(dir, 'chat.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'info.md'), chatInfo(data) + '\n', 'utf8');
}

function recordMessage(role, text, meta) {
  try {
    if (!chatData) {
      chatData = {
        name: chatName || newChatName(),
        created: nowIso(),
        updated: nowIso(),
        project: projectRoot(),
        model: config.get('activeModel') || '',
        messages: []
      };
    }
    const message = { role, text: String(text == null ? '' : text), time: nowIso() };
    if (meta && meta.model) message.model = meta.model;
    if (meta && meta.tokens) message.tokens = meta.tokens;
    chatData.messages.push(message);
    chatData.updated = message.time;
    if (message.model) chatData.model = message.model;
    writeChat(chatData);
  } catch (error) {
    storageWarning(error);
  }
}

function loadChat(name) {
  const data = readJson(path.join(chatDir(name), 'chat.json'));
  if (!data || !Array.isArray(data.messages)) return null;
  return data;
}

function listChats() {
  const root = storeDir('chats');
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch (error) {
    void error;
    return [];
  }
  return entries
    .map((entry) => {
      const data = readJson(path.join(root, entry.name, 'chat.json'));
      if (!data) return null;
      return { name: data.name || entry.name, count: (data.messages || []).length, updated: data.updated || '' };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

function memoryDir() {
  return storeDir('memory');
}

function memoryIndexFile() {
  return path.join(memoryDir(), 'index.json');
}

function memoryIndex() {
  const data = readJson(memoryIndexFile());
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function memoryFiles() {
  try {
    return fs
      .readdirSync(memoryDir())
      .map((file) => Number((/^(\d+)\.txt$/.exec(file) || [])[1]))
      .filter((number) => number > 0);
  } catch (error) {
    void error;
    return [];
  }
}

function memoryNumber(day) {
  const index = memoryIndex();
  if (Number(index[day]) > 0) return Number(index[day]);
  const used = Object.keys(index).map((key) => Number(index[key]) || 0).concat(memoryFiles());
  const number = Math.max(0, ...used) + 1;
  index[day] = number;
  ensureDir(memoryDir());
  fs.writeFileSync(memoryIndexFile(), JSON.stringify(index, null, 2) + '\n', 'utf8');
  return number;
}

function saveMemory(text) {
  const body = String(text == null ? '' : text).trim();
  if (!body) throw new Error(t().memoryEmptyText);
  const day = localDay();
  const number = memoryNumber(day);
  ensureDir(memoryDir());
  const file = path.join(memoryDir(), number + '.txt');
  fs.appendFileSync(file, '[' + localTime() + '] ' + body + '\n', 'utf8');
  return { file, number, day };
}

function memoryEntries() {
  const index = memoryIndex();
  const days = new Map();
  Object.keys(index).forEach((day) => {
    const number = Number(index[day]);
    if (number > 0) days.set(number, day);
  });
  const numbers = Array.from(new Set(Object.keys(index).map((day) => Number(index[day])).concat(memoryFiles())));
  return numbers
    .filter((number) => number > 0)
    .sort((a, b) => a - b)
    .map((number) => {
      let text = '';
      try {
        text = fs.readFileSync(path.join(memoryDir(), number + '.txt'), 'utf8').trim();
      } catch (error) {
        void error;
      }
      return text ? { day: days.get(number) || '', number, text } : null;
    })
    .filter(Boolean);
}

function memoryContext() {
  const entries = memoryEntries();
  if (!entries.length) return '';
  let body = entries
    .map((entry) => '[' + (entry.day ? entry.day + ' · ' : '') + entry.number + '.txt]\n' + entry.text)
    .join('\n\n');
  if (body.length > 8000) body = body.slice(-8000);
  if (config.get('language') === 'en') {
    return (
      'You already know these facts about the user from earlier sessions — they are true and saved in long-term memory:\n' +
      body +
      '\n\nWhen a question is about the user (age, name, preferences, plans), answer from this memory at once and never say you cannot find it. Do not look for these facts in project files.\n\n'
    );
  }
  return (
    'Ты уже знаешь эти факты о пользователе из прошлых сессий — они верны и сохранены в долговременной памяти:\n' +
    body +
    '\n\nЕсли вопрос касается пользователя (возраст, имя, предпочтения, планы) — отвечай сразу из этой памяти и никогда не говори, что не можешь найти информацию. Не ищи эти факты в файлах проекта.\n\n'
  );
}

function clearMemory() {
  const dir = memoryDir();
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (error) {
    void error;
    return 0;
  }
  let removed = 0;
  files.forEach((file) => {
    try {
      fs.rmSync(path.join(dir, file), { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      void error;
    }
  });
  return removed;
}

function onLine(line) {
  if (waiter) {
    const resolve = waiter;
    waiter = null;
    resolve(line);
    return;
  }
  queue.push(line);
}

function uuid4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return reject(new Error(t().serverBadUrl));
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const request = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { accept: 'text/plain', 'user-agent': 'lockcode-cli/' + pkg.version }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error('HTTP ' + res.statusCode));
          }
          resolve(text);
        });
      }
    );
    request.setTimeout(timeoutMs || 20000, () => request.destroy(new Error('таймаут скачивания ключа')));
    request.on('error', reject);
    request.end();
  });
}

let remoteKeyCache = null;

function remoteKeyUrl() {
  return String(config.get('keyUrl') || process.env.LOCKCODE_KEY_URL || '').trim() || null;
}

async function remoteKey() {
  const url = remoteKeyUrl();
  if (!url) return null;
  if (remoteKeyCache && remoteKeyCache.url === url && Date.now() - remoteKeyCache.at < 300000) return remoteKeyCache.value;
  const value = (await fetchText(url)).trim();
  remoteKeyCache = { url, value, at: Date.now() };
  return value || null;
}

async function authKeyFor(model) {
  if (model && model.authKey) return model.authKey;
  if (!remoteKeyUrl()) return null;
  return remoteKey();
}

function hasRemoteGigaKey() {
  return Boolean(remoteKeyUrl());
}

function gigaCa() {
  if (caBundle !== null) return caBundle.length ? caBundle : undefined;
  caBundle = [];
  const dir = path.join(__dirname, 'certs');
  for (const file of ['russian_trusted_root_ca.pem', 'russian_trusted_sub_ca.pem']) {
    try {
      caBundle.push(fs.readFileSync(path.join(dir, file)));
    } catch (error) {
      void error;
    }
  }
  return caBundle.length ? caBundle : undefined;
}

function defaultServerModel() {
  return { name: GIGA_LABEL, provider: 'GigaChat', status: 'GigaChat API', limitUsed: 0, limitMax: 100 };
}

function ensureConfig() {
  if (!config.get('language')) config.set('language', 'ru');
  if (!config.get('mode')) config.set('mode', 'agent');
  if (!config.get('contextWindow')) config.set('contextWindow', '128k');
  if (!config.get('projectFolder')) config.set('projectFolder', process.cwd());
  if (!config.get('activeModel')) config.set('activeModel', GIGA_LABEL);
  if (!config.get('agentMode')) config.set('agentMode', 'selective');
  if (!config.get('models')) config.set('models', { server: [defaultServerModel()], user: [] });

  const models = config.get('models');
  if (!Array.isArray(models.server)) models.server = [];
  if (!Array.isArray(models.user)) models.user = [];

  const hasGiga = models.server.some((model) => model.name === GIGA_LABEL);
  const legacy = models.server.some((model) => model.name === 'Mistral (Server)');
  if (!hasGiga || legacy) {
    models.server = models.server.filter((model) => model.name !== 'Mistral (Server)');
    if (!hasGiga) models.server.unshift(defaultServerModel());
    config.set('models', models);
    if (config.get('activeModel') === 'Mistral (Server)') config.set('activeModel', GIGA_LABEL);
  }
}

function termWidth() {
  return process.stdout.columns || 80;
}

function center(text, width) {
  const pad = Math.max(0, Math.floor((width - visible(text).length) / 2));
  return ' '.repeat(pad) + text;
}

function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (visible(line).length + 1 + word.length <= width) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rasterize(parts) {
  const cells = Array.from({ length: 7 }, () => []);
  parts.forEach((part, index) => {
    if (index > 0) cells.forEach((row) => row.push({ on: false, color: C.a }));
    for (const char of part.text) {
      const glyph = GLYPHS[char] || GLYPHS.L;
      for (let r = 0; r < 7; r++) {
        for (const bit of glyph[r]) cells[r].push({ on: bit === '1', color: part.color });
        cells[r].push({ on: false, color: part.color });
      }
    }
  });
  return cells;
}

function toBlocks(cells) {
  const lines = [];
  for (let r = 0; r < cells.length; r += 2) {
    let line = '';
    for (let c = 0; c < cells[r].length; c++) {
      const top = cells[r][c];
      const bottom = r + 1 < cells.length ? cells[r + 1][c] : null;
      if (top.on && bottom && bottom.on) line += paint(top.color, '█');
      else if (top.on) line += paint(top.color, '▀');
      else if (bottom && bottom.on) line += paint(bottom.color, '▄');
      else line += ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return padRows(lines);
}

function padRows(rows) {
  const max = Math.max.apply(null, rows.map((row) => visible(row).length));
  return rows.map((row) => row + ' '.repeat(max - visible(row).length));
}

function shortPath(target) {
  const home = os.homedir();
  if (target && target.startsWith(home)) return '~' + target.slice(home.length);
  return target || '—';
}

function activeModel() {
  const name = config.get('activeModel');
  const list = [].concat(config.get('models').server || [], config.get('models').user || []);
  const same = list.filter((model) => model.name === name);
  return same.find(hasCreds) || same[0] || null;
}

function serverConfig() {
  const url = String(config.get('serverUrl') || process.env.LOCKCODE_SERVER_URL || '').trim();
  const token = String(config.get('serverToken') || process.env.LOCKCODE_SERVER_TOKEN || '').trim();
  if (!url) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

function hasCreds(model) {
  if (serverConfig()) return true;
  if (!model) return false;
  if (model.kind === 'gigachat') return Boolean(model.authKey) || hasRemoteGigaKey();
  return Boolean(model.apiKey);
}

function statusChip() {
  const model = activeModel();
  if (!model) return paint(C.amber, '○ ') + paint(C.dim, t().noModel);
  if (serverConfig()) {
    return paint(C.green, '● ') + paint(C.dim, t().serverChip + ' · ' + config.get('activeModel'));
  }
  if (!hasCreds(model)) return paint(C.amber, '○ ') + paint(C.dim, t().needsKey);
  if (model && model.kind === 'gigachat' && !model.authKey && hasRemoteGigaKey()) {
    return paint(C.green, '● ') + paint(C.dim, t().keyfileChip + ' · ' + config.get('activeModel'));
  }
  return paint(C.green, '● ') + paint(C.dim, t().ready + ' · ' + model.name);
}

const HEADER_COMMANDS = ['/help', '/add', '/model', '/mode', '/modeagent', '/connectors', '/folder', '/exit'];

function headerCommands() {
  const rows = t().help;
  return HEADER_COMMANDS.map((name) => rows.find((row) => row[0].split(/\s+/)[0] === name)).filter(Boolean);
}

function modeTag() {
  return config.get('mode') === 'agent' ? 'agent:' + accessLabel() : 'chat';
}

function statusLine() {
  const parts = [statusChip(), paint(C.faint, modeTag()), paint(C.faint, shortPath(projectRoot()))];
  const connectors = connectorsSummary();
  if (connectors !== '—') parts.push(paint(C.green, connectors));
  return parts.join(paint(C.faint, '   ·   '));
}

function renderHeader() {
  const width = termWidth();
  const out = [''];

  toBlocks(
    rasterize([
      { text: 'LOCK', color: C.a },
      { text: 'CODE', color: C.b }
    ])
  ).forEach((row) => out.push(center(row, width)));

  out.push('');
  out.push(center(paint(C.faint, 'v' + pkg.version), width));
  out.push('');

  const rows = headerCommands();
  const commandWidth = Math.max.apply(null, rows.map((row) => row[0].length)) + 3;
  const blockWidth = commandWidth + Math.max.apply(null, rows.map((row) => row[1].length));
  const side = Math.max(0, Math.floor((width - blockWidth) / 2));
  rows.forEach((row) => {
    out.push(
      ' '.repeat(side) +
        paint(C.amber, row[0]) +
        ' '.repeat(commandWidth - row[0].length) +
        paint(C.dim, row[1])
    );
  });

  out.push('');
  out.push(center(statusLine(), width));
  out.push('');

  console.log(out.join('\n'));
}

function clearScreen() {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }
}

function ask(query, usePrompt) {
  if (usePrompt && rl && process.stdout.isTTY) {
    return new Promise((resolve) => {
      if (queue.length) {
        resolve(queue.shift());
        return;
      }
      waiter = resolve;
      rl.setPrompt(String(query));
      rl.prompt();
    });
  }
  process.stdout.write(query);
  return new Promise((resolve) => {
    if (queue.length) {
      resolve(queue.shift());
      return;
    }
    waiter = resolve;
  });
}

function askHidden(query) {
  if (!process.stdin.isTTY) return ask(query);
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;
    rl.pause();
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    const stop = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      rl.resume();
      process.stdout.write('\n');
    };
    const onData = (buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          stop();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stop();
          finish(0);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function note(text) {
  console.log('  ' + paint(C.faint, '· ') + paint(C.dim, text));
}

function ok(text) {
  console.log('  ' + paint(C.green, '✓ ') + paint(C.ink, text));
}

function fail(text) {
  console.log('  ' + paint(C.amber, '! ') + paint(C.ink, text));
}

function spinner(text) {
  if (!process.stdout.isTTY) {
    console.log('  ' + paint(C.faint, '⋯ ' + text));
    return function stop() {};
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;
  readline.cursorTo(process.stdout, 0);
  process.stdout.write('\n');
  const timer = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write('  ' + paint(C.amber, frames[index++ % frames.length]) + ' ' + paint(C.dim, text));
  }, 90);
  return function stop() {
    clearInterval(timer);
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  };
}

function modelTag(model) {
  return (model && (model.model || model.name)) || config.get('activeModel') || '—';
}

function panelWidth() {
  const raw = Math.min(74, Math.max(30, termWidth() - 8));
  return Math.max(16, Math.min(raw, termWidth() - 2));
}

function panelIndent() {
  if (!process.stdout.isTTY) return 0;
  return Math.max(0, Math.floor((termWidth() - panelWidth()) / 2));
}

function panelPad() {
  return ' '.repeat(panelIndent());
}

function panelFooter() {
  const width = panelWidth();
  const left = ' ' + t().enterSend + ' ';
  const right = ' ' + modelTag(activeModel()) + ' ';
  const fill = Math.max(2, width - left.length - right.length - 2);
  return (
    panelPad() +
    paint(C.line, '─') +
    paint(C.faint, left) +
    paint(C.line, '─'.repeat(fill)) +
    paint(C.dim, right) +
    paint(C.line, '─')
  );
}

function inputFrame() {
  if (!process.stdout.isTTY) return;
  console.log(panelPad() + paint(C.line, '─'.repeat(panelWidth())));
  console.log('');
  console.log(panelFooter());
  readline.moveCursor(process.stdout, 0, -2);
  readline.cursorTo(process.stdout, 0);
}

function closePanel(raw) {
  if (rl) rl.setPrompt('');
  if (!process.stdout.isTTY) return;
  const columns = Math.max(20, process.stdout.columns || 80);
  const used = panelIndent() + 2 + String(raw == null ? '' : raw).length;
  const extra = Math.max(0, Math.ceil(used / columns) - 1);
  readline.moveCursor(process.stdout, 0, -(2 + extra));
  readline.cursorTo(process.stdout, 0);
  readline.clearScreenDown(process.stdout);
}

function printUserMessage(text) {
  if (!process.stdout.isTTY) return;
  const pad = panelPad();
  const width = panelWidth();
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  lines.forEach((line, index) => {
    const parts = wrap(line, Math.max(8, width - 3));
    if (!parts.length) parts.push('');
    parts.forEach((part, partIndex) => {
      const lead = index === 0 && partIndex === 0 ? paint(C.amber, '❯ ') : '   ';
      console.log(pad + lead + paint(C.ink, part));
    });
  });
}

const MD_STYLES = {
  text: (text) => chalk.hex(C.body)(text),
  bold: (text) => chalk.bold.hex(C.a)(text),
  bolditalic: (text) => chalk.bold.italic.hex(C.a)(text),
  heading: (text) => chalk.bold.hex(C.a)(text),
  italic: (text) => chalk.italic(chalk.hex(C.body)(text)),
  code: (text) => chalk.hex(C.amber)(text),
  strike: (text) => chalk.strikethrough(chalk.hex(C.dim)(text)),
  link: (text) => chalk.underline.hex(C.b)(text),
  url: (text) => chalk.hex(C.faint)(text)
};

const INLINE_RULES = [
  { style: 'code', re: /^`([^`\n]+)`/ },
  { style: 'bolditalic', re: /^\*\*\*([\s\S]+?)\*\*\*/ },
  { style: 'bold', re: /^\*\*([\s\S]+?)\*\*/ },
  { style: 'bold', re: /^__([\s\S]+?)__/ },
  { style: 'strike', re: /^~~([\s\S]+?)~~/ },
  { style: 'italic', re: /^\*([^*\n]+)\*/ },
  { style: 'italic', re: /^_([^_\n]+)_/, wordBoundary: true },
  { style: 'link', re: /^\[([^\]\n]+)\]\(([^)\n]+)\)/ }
];

function mdInline(line) {
  const segments = [];
  let buffer = '';
  let index = 0;
  const flush = () => {
    if (buffer) {
      segments.push({ t: buffer.replace(/\*\*/g, '').replace(/~~/g, ''), s: 'text' });
      buffer = '';
    }
  };
  while (index < line.length) {
    const rest = line.slice(index);
    let matched = false;
    for (const inline of INLINE_RULES) {
      if (inline.wordBoundary && index > 0 && /[0-9A-Za-zА-Яа-яЁё]/.test(line[index - 1])) continue;
      const found = inline.re.exec(rest);
      if (!found) continue;
      flush();
      if (inline.style === 'link') {
        segments.push({ t: found[1], s: 'link' });
        segments.push({ t: ' ' + found[2], s: 'url' });
      } else {
        segments.push({ t: found[1], s: inline.style });
      }
      index += found[0].length;
      matched = true;
      break;
    }
    if (matched) continue;
    buffer += line[index];
    index += 1;
  }
  flush();
  return segments;
}

function wrapStyled(segments, width) {
  const lines = [];
  let current = [];
  let length = 0;

  const trim = () => {
    while (current.length) {
      const last = current[current.length - 1];
      const text = last.t.replace(/\s+$/, '');
      if (text) {
        current[current.length - 1] = { t: text, s: last.s };
        return;
      }
      current.pop();
    }
  };

  const flush = () => {
    trim();
    lines.push(current);
    current = [];
    length = 0;
  };

  for (const segment of segments) {
    const parts = String(segment.t).split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (length > 0 && length + 1 <= width) {
          current.push({ t: ' ', s: 'text' });
          length += 1;
        }
        continue;
      }
      let word = part;
      while (word) {
        if (length > 0 && length + word.length > width) flush();
        if (word.length > width) {
          current.push({ t: word.slice(0, width), s: segment.s });
          word = word.slice(width);
          flush();
          continue;
        }
        current.push({ t: word, s: segment.s });
        length += word.length;
        word = '';
      }
    }
  }
  if (current.length) flush();
  return lines;
}

function paintSegments(segments) {
  return segments.map((segment) => (MD_STYLES[segment.s] || MD_STYLES.text)(segment.t)).join('');
}

function pushWrapped(out, segments, width, prefix) {
  const lead = prefix || '';
  const room = Math.max(16, width - visible(lead).length);
  const lines = wrapStyled(segments, room);
  if (!lines.length) lines.push([]);
  lines.forEach((line, index) => {
    const pad = index === 0 ? lead : ' '.repeat(visible(lead).length);
    out.push(pad + paintSegments(line));
  });
}

function mdCode(lines, lang, width) {
  const out = [];
  const title = lang ? ' ' + String(lang).slice(0, 14) + ' ' : '';
  const head = '╭─' + title;
  out.push(paint(C.line, head + '─'.repeat(Math.max(0, width - 1 - head.length)) + '╮'));
  const inner = Math.max(12, width - 4);
  const body = [];
  for (const source of lines) {
    const line = String(source).replace(/\t/g, '    ');
    if (!line) {
      body.push('');
      continue;
    }
    let rest = line;
    while (rest.length > inner) {
      body.push(rest.slice(0, inner));
      rest = rest.slice(inner);
    }
    body.push(rest);
  }
  if (!body.length) body.push('');
  body.forEach((line) => out.push(paint(C.line, '│ ') + paint(C.ink, line)));
  out.push(paint(C.line, '╰' + '─'.repeat(Math.max(0, width - 2)) + '╯'));
  return out;
}

function renderMarkdown(text, width) {
  const source = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let code = null;
  let lang = '';

  const blank = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  for (const raw of source) {
    const line = raw.replace(/\s+$/, '');
    const fence = /^\s*(?:```|~~~)\s*([\w+#.-]*)\s*$/.exec(line);

    if (code) {
      if (fence) {
        mdCode(code, lang, width).forEach((row) => out.push(row));
        code = null;
        lang = '';
      } else {
        code.push(raw.replace(/\t/g, '    '));
      }
      continue;
    }

    if (fence) {
      code = [];
      lang = fence[1] || '';
      continue;
    }

    if (!line.trim()) {
      blank();
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      out.push(paint(C.line, '─'.repeat(width)));
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blank();
      pushWrapped(out, mdInline(heading[2]).map((item) => ({ t: item.t, s: item.s === 'url' ? 'url' : 'heading' })), width, '');
      blank();
      continue;
    }

    if (/\|/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && /-/.test(line)) continue;

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      const segments = mdInline(quote[1]).map((item) => ({ t: item.t, s: item.s === 'code' ? 'code' : 'italic' }));
      pushWrapped(out, segments, width, paint(C.faint, '│ '));
      continue;
    }

    const item = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (item) {
      const depth = Math.min(3, Math.floor(item[1].replace(/\t/g, '  ').length / 2));
      const marker = /\d/.test(item[2]) ? paint(C.faint, item[2] + ' ') : paint(C.amber, '• ');
      pushWrapped(out, mdInline(item[3]), width, '  '.repeat(depth) + marker);
      continue;
    }

    pushWrapped(out, mdInline(line.trim()), width, '');
  }

  if (code) mdCode(code, lang, width).forEach((row) => out.push(row));
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function tokensUsed(usage) {
  if (!usage) return 0;
  const completion = Number(usage.completion_tokens != null ? usage.completion_tokens : usage.completionTokenCount);
  const total = Number(usage.total_tokens != null ? usage.total_tokens : usage.totalTokenCount);
  if (Number.isFinite(completion) && completion > 0) return completion;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function mergeUsage(sum, usage) {
  if (!usage) return sum;
  const prompt = Number(usage.prompt_tokens != null ? usage.prompt_tokens : usage.promptTokenCount) || 0;
  const completion = Number(usage.completion_tokens != null ? usage.completion_tokens : usage.completionTokenCount) || 0;
  const total = Number(usage.total_tokens != null ? usage.total_tokens : usage.totalTokenCount) || prompt + completion;
  sum.prompt_tokens += prompt;
  sum.completion_tokens += completion;
  sum.total_tokens += total;
  return sum;
}

function usageLine(modelName, usage) {
  const count = tokensUsed(usage);
  return (
    paint(C.dim, modelName) +
    paint(C.faint, ' : ') +
    paint(C.ink, count ? String(count) : '—') +
    paint(C.faint, ' ' + t().tokens)
  );
}

function reply(answer, modelName, usage) {
  const pad = panelPad();
  const lines = renderMarkdown(answer, panelWidth());
  console.log('');
  if (!lines.length) lines.push(paint(C.dim, t().emptyAnswer));
  lines.forEach((line) => console.log(pad + line));
  console.log(pad + usageLine(modelName, usage));
  console.log('');
}

function errorBox(message) {
  const s = t();
  const pad = panelPad();
  const lines = wrap(message, Math.max(12, panelWidth() - 2));
  console.log('');
  console.log(pad + paint(C.red, '╭─ ' + s.errorTitle));
  lines.forEach((line) => console.log(pad + paint(C.red, '│ ') + paint(C.body, line)));
  console.log(pad + paint(C.red, '╰'));
  console.log('');
}

function requestJson(options, body, ca) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(options.url);
    } catch (error) {
      return reject(new Error('неверный URL: ' + options.url));
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const headers = Object.assign({ 'user-agent': 'lockcode-cli/' + pkg.version }, options.headers);
    if (body) headers['content-length'] = Buffer.byteLength(body);
    const request = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || (body ? 'POST' : 'GET'),
        headers,
        ca
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (error) {
            return reject(new Error('неверный JSON: ' + raw.slice(0, 180)));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message =
              (data && (data.message || (data.error && (data.error.message || data.error.type)))) || 'HTTP ' + res.statusCode;
            const error = new Error(String(message));
            error.status = res.statusCode;
            return reject(error);
          }
          resolve(data);
        });
      }
    );
    request.setTimeout(60000, () => request.destroy(new Error('таймаут соединения')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function gigaToken(model) {
  const key = await authKeyFor(model);
  if (!key) throw new Error(t().noKey + ' ' + (model ? model.name : '') + ' — /add');
  const cacheKey = key + '|' + (model.scope || GIGA_DEFAULT_SCOPE);
  const cached = tokenCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 60 > now) return cached.token;

  const scope = model.scope || GIGA_DEFAULT_SCOPE;
  const body = 'scope=' + encodeURIComponent(scope);
  let data;
  try {
    data = await requestJson(
      {
        url: GIGA_OAUTH,
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          rquid: uuid4(),
          authorization: 'Basic ' + model.authKey
        }
      },
      body,
      gigaCa()
    );
  } catch (error) {
    if (error.status === 400 || error.status === 401) {
      throw new Error(t().tokenFailed + ': ' + t().tokenRejected + ' (' + error.status + ')');
    }
    throw new Error(t().tokenFailed + ': ' + error.message);
  }

  if (!data.access_token) throw new Error(t().tokenFailed + ': пустой ответ OAuth');
  const expiresAt = Number(data.expires_at) || now + 1800;
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
  return data.access_token;
}

function explain(error) {
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return t().tlsHint;
  if (error.status === 401) return 'ключ не подошёл (401)';
  if (error.status === 402) return 'закончилась квота (402) — проверьте тариф в кабинете провайдера';
  if (error.status === 403) return 'доступ запрещён (403)';
  if (error.status === 429) return 'слишком много запросов (429) — подождите немного';
  if (error.status >= 500) return 'сервер провайдера недоступен (' + error.status + ')';
  return error.message || String(error);
}

function extractReply(data) {
  if (data && data.choices && data.choices[0] && data.choices[0].message) {
    const content = String(data.choices[0].message.content || '').trim();
    if (!content) throw new Error('модель вернула пустой ответ');
    return { text: content, usage: data.usage };
  }
  if (data && data.candidates && data.candidates[0] && data.candidates[0].content) {
    const parts = data.candidates[0].content.parts || [];
    const text = parts.map((part) => part.text || '').join('').trim();
    if (!text) throw new Error('модель вернула пустой ответ');
    return { text, usage: data.usageMetadata };
  }
  throw new Error('в ответе модели нет текста');
}

async function askModel(model, messages) {
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const working = messages.slice();
  const gigachat = model.kind === 'gigachat';
  let data = await callModelRaw(model, working, [MEMORY_TOOL]);

  for (let step = 0; step < 3; step++) {
    mergeUsage(usage, data.usage || data.usageMetadata);
    const choice = (data.choices && data.choices[0]) || null;
    const message = (choice && choice.message) || {};
    const calls = [].concat(message.tool_calls || []);
    if (!calls.length && message.function_call) {
      calls.push({ id: 'call_' + step, type: 'function', function: message.function_call });
    }
    if (!calls.length) {
      const result = extractReply(data);
      return { text: result.text, usage };
    }

    working.push(
      gigachat
        ? {
            role: 'assistant',
            content: message.content || '',
            function_call: calls[0].function,
            functions_state_id: message.functions_state_id
          }
        : { role: 'assistant', content: message.content || '', tool_calls: calls }
    );

    for (const call of calls) {
      let outcome;
      try {
        outcome = await runTool({ function: call.function }, { created: 0 });
      } catch (error) {
        outcome = { ok: false, result: error.message };
      }
      working.push(
        gigachat
          ? { role: 'function', name: call.function.name, content: JSON.stringify(outcome) }
          : { role: 'tool', tool_call_id: call.id || 'call_' + step, content: JSON.stringify(outcome) }
      );
    }

    data = await callModelRaw(model, working, [MEMORY_TOOL]);
  }

  return { text: t().loopLimit, usage };
}

function endpointOf(model) {
  if (!model) return null;
  const base = model.endpoint || model.apiBase || EDU[model.provider];
  return base ? String(base).replace(/\/+$/, '') : null;
}

function connectorMap() {
  const value = config.get('connectors');
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function connectorState(id) {
  return connectorMap()[id] || {};
}

function saveConnector(id, next) {
  const map = connectorMap();
  map[id] = next;
  config.set('connectors', map);
}

function forgetConnector(id) {
  const map = connectorMap();
  delete map[id];
  config.set('connectors', map);
}

function connectorDef(id) {
  return CONNECTORS.find((item) => item.id === id) || null;
}

function connectorNote(def) {
  return config.get('language') === 'en' ? def.note.en : def.note.ru;
}

function connectorReady(id) {
  const state = connectorState(id);
  return Boolean(state.enabled && state.refreshToken && state.clientId && state.clientSecret);
}

function readyConnectors() {
  return CONNECTORS.filter((def) => connectorReady(def.id));
}

function connectorsSummary() {
  const list = readyConnectors().map((def) => def.title);
  return list.length ? list.join(', ') : '—';
}

function shortScope(scope) {
  return String(scope).split('/').filter(Boolean).pop() || String(scope);
}

function requestBuffer(options, body) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(options.url);
    } catch (error) {
      void error;
      return reject(new Error('неверный URL: ' + options.url));
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const headers = Object.assign({ 'user-agent': 'lockcode-cli/' + pkg.version }, options.headers);
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    if (payload) headers['content-length'] = payload.length;
    const request = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || (payload ? 'POST' : 'GET'),
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    request.setTimeout(120000, () => request.destroy(new Error('таймаут соединения')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function googleAccessToken(id) {
  const state = connectorState(id);
  const now = Date.now();
  if (state.accessToken && Number(state.accessExpires || 0) - 60000 > now) return state.accessToken;
  if (!state.refreshToken || !state.clientId || !state.clientSecret) throw new Error(t().connectorNeed);
  const body = new URLSearchParams({
    client_id: state.clientId,
    client_secret: state.clientSecret,
    refresh_token: state.refreshToken,
    grant_type: 'refresh_token'
  }).toString();
  const data = await requestJson(
    {
      url: GOOGLE_TOKEN,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
    },
    body
  );
  if (!data.access_token) throw new Error(t().connectorNeed);
  saveConnector(
    id,
    Object.assign({}, connectorState(id), {
      accessToken: data.access_token,
      accessExpires: now + (Number(data.expires_in) || 3600) * 1000
    })
  );
  return data.access_token;
}

async function googleRequest(id, url, options) {
  const token = await googleAccessToken(id);
  const headers = Object.assign({ accept: 'application/json' }, (options && options.headers) || {}, {
    authorization: 'Bearer ' + token
  });
  return requestBuffer({ url, method: (options && options.method) || 'GET', headers }, options && options.body);
}

async function googleJson(id, url, options) {
  const res = await googleRequest(id, url, options);
  const text = res.body.toString('utf8');
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      void error;
      throw new Error('неверный JSON: ' + text.slice(0, 180));
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const message = (data.error && (data.error.message || data.error.status)) || data.message || 'HTTP ' + res.status;
    const error = new Error(String(message));
    error.status = res.status;
    throw error;
  }
  return data;
}

function openBrowser(url) {
  const { spawn } = require('child_process');
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch (error) {
    void error;
  }
}

function createAuthWaiter(port, expectedState) {
  let settle = null;
  let timer = null;

  function done(error, value) {
    if (!settle) return;
    const current = settle;
    settle = null;
    if (timer) clearTimeout(timer);
    try {
      server.close();
    } catch (closeError) {
      void closeError;
    }
    if (error) current.reject(error);
    else current.resolve(value);
  }

  const server = http.createServer((req, res) => {
    let parsed;
    try {
      parsed = new URL(req.url, 'http://127.0.0.1');
    } catch (error) {
      void error;
      res.writeHead(400);
      res.end();
      return;
    }
    if (parsed.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end();
      return;
    }
    const granted = parsed.searchParams.get('code');
    const problem = parsed.searchParams.get('error');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<html><body style="font-family:system-ui;padding:48px"><h3>LOCKCODE: ' +
        (granted ? 'доступ получен' : 'доступ не выдан') +
        '</h3><p>Вернитесь в терминал.</p></body></html>'
    );
    if (problem) return done(new Error(problem));
    if (parsed.searchParams.get('state') !== expectedState) return done(new Error(t().connectorDenied));
    if (!granted) return done(new Error(t().connectorDenied));
    done(null, granted);
  });

  const code = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      server.on('error', (error) => done(error));
      resolve();
    });
  });

  return {
    code,
    ready,
    startTimer: () => {
      timer = setTimeout(() => done(new Error(t().connectorTimeout)), 300000);
    }
  };
}

async function connectorIdentity(id) {
  if (id === 'gmail') {
    const data = await googleJson('gmail', GMAIL_API + '/profile');
    return data.emailAddress || '';
  }
  const data = await googleJson('drive', DRIVE_API + '/about?fields=' + encodeURIComponent('user'));
  return (data.user && data.user.emailAddress) || '';
}

async function driveSettings() {
  const s = t();
  const state = connectorState('drive');
  const folder = (await ask('  ' + paint(C.amber, '? ') + s.connectorDriveFolder + ': ')).trim();
  const local = (await ask('  ' + paint(C.amber, '? ') + s.connectorLocalDir + ': ')).trim();
  let localDir = state.localDir || '';
  if (local) {
    const target = path.resolve(local.replace(/^~(?=$|[\\/])/, os.homedir()));
    try {
      fs.mkdirSync(target, { recursive: true });
      localDir = target;
    } catch (error) {
      void error;
    }
  }
  saveConnector(
    'drive',
    Object.assign({}, connectorState('drive'), { driveFolder: folder || state.driveFolder || '', localDir })
  );
}

async function googleConnect(def) {
  const s = t();
  const previous = connectorState(def.id);
  const clientId = (await ask('  ' + paint(C.amber, '? ') + s.connectorClientId + ': ')).trim() || previous.clientId || '';
  if (!clientId) return note(s.cancelled);
  const clientSecret =
    (await askHidden('  ' + paint(C.amber, '? ') + s.connectorClientSecret + ': ')).trim() || previous.clientSecret || '';
  if (!clientSecret) return note(s.cancelled);

  const nonce = crypto.randomBytes(16).toString('hex');
  let waiter = null;
  let port = 0;
  for (const candidate of OAUTH_PORTS) {
    const attempt = createAuthWaiter(candidate, nonce);
    try {
      await attempt.ready;
    } catch (error) {
      if (error.code === 'EADDRINUSE') continue;
      return errorBox(explain(error));
    }
    waiter = attempt;
    port = candidate;
    break;
  }
  if (!waiter) return fail(s.connectorFail);
  waiter.startTimer();

  const redirect = 'http://127.0.0.1:' + port + '/oauth2callback';
  const authUrl =
    GOOGLE_AUTH +
    '?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: def.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: nonce
    }).toString();

  console.log('');
  note(s.connectorLink);
  console.log('  ' + paint(C.a, authUrl));
  console.log('');
  openBrowser(authUrl);

  const stop = spinner(s.connectorWait + '…');
  let code = null;
  try {
    code = await waiter.code;
    stop();
  } catch (error) {
    stop();
    return errorBox(error.message || String(error));
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code'
  }).toString();

  let tokens;
  try {
    tokens = await requestJson(
      {
        url: GOOGLE_TOKEN,
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
      },
      body
    );
  } catch (error) {
    return errorBox(explain(error));
  }
  if (!tokens.refresh_token) return fail(s.connectorFail + ': refresh_token');

  saveConnector(
    def.id,
    Object.assign({}, previous, {
      enabled: true,
      clientId,
      clientSecret,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || '',
      accessExpires: Date.now() + (Number(tokens.expires_in) || 3600) * 1000
    })
  );

  if (def.id === 'drive') await driveSettings();

  let account = '';
  try {
    account = await connectorIdentity(def.id);
  } catch (error) {
    void error;
  }
  if (account) saveConnector(def.id, Object.assign({}, connectorState(def.id), { account }));

  console.log('');
  ok(def.title + ' — ' + s.connectorOk + (account ? ' · ' + account : ''));
  console.log('');
}

function sanitizeHeader(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
}

function b64urlEncode(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function encodeHeaderValue(value) {
  const text = sanitizeHeader(value);
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return '=?UTF-8?B?' + Buffer.from(text, 'utf8').toString('base64') + '?=';
}

function wrapBase64(value) {
  return String(value).replace(/.{1,76}/g, '$&\r\n').trim();
}

function buildRawMail(mail) {
  const lines = ['To: ' + sanitizeHeader(mail.to)];
  if (mail.cc) lines.push('Cc: ' + sanitizeHeader(mail.cc));
  if (mail.bcc) lines.push('Bcc: ' + sanitizeHeader(mail.bcc));
  lines.push('Subject: ' + encodeHeaderValue(mail.subject));
  if (mail.inReplyTo) lines.push('In-Reply-To: ' + mail.inReplyTo);
  if (mail.references) lines.push('References: ' + mail.references);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(wrapBase64(Buffer.from(String(mail.body || ''), 'utf8').toString('base64')));
  return lines.join('\r\n');
}

function headersOf(message) {
  const map = {};
  const list = (message && message.payload && message.payload.headers) || [];
  for (const item of list) map[item.name] = item.value;
  return map;
}

function bodyOfPayload(payload) {
  if (!payload) return '';
  const isPlain = payload.mimeType === 'text/plain';
  if (isPlain && payload.body && payload.body.data) return b64urlDecode(payload.body.data);
  for (const part of payload.parts || []) {
    const text = bodyOfPayload(part);
    if (text) return text;
  }
  if (payload.body && payload.body.data && !payload.parts) return b64urlDecode(payload.body.data);
  return '';
}

function humanSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return size + ' Б';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' КБ';
  return (size / (1024 * 1024)).toFixed(1) + ' МБ';
}

function mimeOf(name) {
  const ext = path.extname(String(name)).replace('.', '').toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function gmailSearch(args) {
  const max = Math.min(Math.max(Number(args.max) || 10, 1), 20);
  const query = String(args.query || '').trim();
  const url = GMAIL_API + '/messages?maxResults=' + max + (query ? '&q=' + encodeURIComponent(query) : '');
  const data = await googleJson('gmail', url);
  const messages = data.messages || [];
  if (!messages.length) return t().nothing;
  const lines = [];
  for (const item of messages) {
    const meta = await googleJson(
      'gmail',
      GMAIL_API + '/messages/' + encodeURIComponent(item.id) + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date'
    );
    const headers = headersOf(meta);
    lines.push(
      [item.id, headers.From, headers.Subject, headers.Date, String(meta.snippet || '').slice(0, 90)]
        .filter(Boolean)
        .join(' · ')
    );
  }
  return lines.join('\n');
}

async function gmailRead(args) {
  const id = String(args.id || '').trim();
  if (!id) throw new Error('нужен id письма');
  const data = await googleJson('gmail', GMAIL_API + '/messages/' + encodeURIComponent(id) + '?format=full');
  const headers = headersOf(data);
  const body = bodyOfPayload(data.payload) || String(data.snippet || '');
  const text = body.length > 8000 ? body.slice(0, 8000) + '\n…обрезано' : body;
  return [
    'From: ' + (headers.From || ''),
    'To: ' + (headers.To || ''),
    'Date: ' + (headers.Date || ''),
    'Subject: ' + (headers.Subject || ''),
    '',
    text
  ].join('\n');
}

async function gmailSend(args) {
  const to = sanitizeHeader(args.to);
  if (!to) throw new Error('нужен адрес получателя');
  const raw = buildRawMail({
    to,
    cc: sanitizeHeader(args.cc),
    bcc: sanitizeHeader(args.bcc),
    subject: sanitizeHeader(args.subject) || '(без темы)',
    body: args.body
  });
  const data = await googleJson('gmail', GMAIL_API + '/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64urlEncode(Buffer.from(raw, 'utf8')) })
  });
  return 'отправлено: ' + (data.id || '');
}

async function gmailReply(args) {
  const id = String(args.id || '').trim();
  const body = String(args.body == null ? '' : args.body);
  if (!id) throw new Error('нужен id письма');
  if (!body.trim()) throw new Error('пустой текст ответа');
  const original = await googleJson(
    'gmail',
    GMAIL_API + '/messages/' + encodeURIComponent(id) + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References'
  );
  const headers = headersOf(original);
  const subject = /^re:/i.test(headers.Subject || '') ? headers.Subject : 'Re: ' + (headers.Subject || '');
  const references = [headers.References, headers['Message-ID']].filter(Boolean).join(' ').trim();
  const raw = buildRawMail({
    to: headers.From || '',
    subject,
    body,
    inReplyTo: headers['Message-ID'] || '',
    references
  });
  const payload = { raw: b64urlEncode(Buffer.from(raw, 'utf8')) };
  if (original.threadId) payload.threadId = original.threadId;
  const sent = await googleJson('gmail', GMAIL_API + '/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return 'ответ отправлен: ' + (sent.id || '');
}

function driveEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFolderId(name) {
  const query =
    "name = '" + driveEscape(name) + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const data = await googleJson(
    'drive',
    DRIVE_API + '/files?pageSize=1&fields=' + encodeURIComponent('files(id,name)') + '&q=' + encodeURIComponent(query)
  );
  return ((data.files || [])[0] || {}).id || null;
}

async function driveTargetFolder(name) {
  const target = String(name == null ? connectorState('drive').driveFolder || '' : name).trim();
  if (!target) return null;
  if (/^[A-Za-z0-9_-]{20,}$/.test(target)) return target;
  const existing = await driveFolderId(target);
  if (existing) return existing;
  const created = await googleJson('drive', DRIVE_API + '/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: target, mimeType: 'application/vnd.google-apps.folder' })
  });
  return created.id || null;
}

async function driveSearch(args) {
  const max = Math.min(Math.max(Number(args.max) || 10, 1), 50);
  const term = String(args.query || '').trim();
  const conditions = ['trashed = false'];
  if (term) conditions.push("name contains '" + driveEscape(term) + "'");
  const url =
    DRIVE_API +
    '/files?pageSize=' +
    max +
    '&orderBy=' +
    encodeURIComponent('modifiedTime desc') +
    '&fields=' +
    encodeURIComponent('files(id,name,mimeType,size,modifiedTime)') +
    '&q=' +
    encodeURIComponent(conditions.join(' and '));
  const data = await googleJson('drive', url);
  const files = data.files || [];
  if (!files.length) return t().nothing;
  return files
    .map((file) =>
      [
        file.id,
        file.name,
        file.mimeType === 'application/vnd.google-apps.folder' ? 'папка' : file.size ? humanSize(file.size) : '',
        String(file.modifiedTime || '').slice(0, 10)
      ]
        .filter(Boolean)
        .join(' · ')
    )
    .join('\n');
}

async function driveUpload(args) {
  const source = insideProject(args.path);
  const stat = fs.statSync(source);
  if (!stat.isFile()) throw new Error('не файл: ' + args.path);
  const buffer = fs.readFileSync(source);
  const name = String(args.name || path.basename(source));
  const parent = await driveTargetFolder(args.folder);
  const boundary = 'lockcode' + Date.now().toString(16);
  const meta = { name };
  if (parent) meta.parents = [parent];
  const head = Buffer.from(
    '--' +
      boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) +
      '\r\n--' +
      boundary +
      '\r\nContent-Type: ' +
      mimeOf(name) +
      '\r\n\r\n',
    'utf8'
  );
  const tail = Buffer.from('\r\n--' + boundary + '--', 'utf8');
  const payload = Buffer.concat([head, buffer, tail]);
  const res = await googleRequest(
    'drive',
    DRIVE_UPLOAD + '?uploadType=multipart&fields=' + encodeURIComponent('id,name,size'),
    {
      method: 'POST',
      headers: { 'content-type': 'multipart/related; boundary=' + boundary },
      body: payload
    }
  );
  const text = res.body.toString('utf8');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    void error;
  }
  if (res.status < 200 || res.status >= 300) {
    const message = (data.error && data.error.message) || 'HTTP ' + res.status;
    const error = new Error(String(message));
    error.status = res.status;
    throw error;
  }
  return 'загружено: ' + (data.name || name) + ' · ' + (data.id || '');
}

async function driveDownload(args) {
  const id = String(args.id || '').trim();
  if (!id) throw new Error('нужен id файла');
  const meta = await googleJson(
    'drive',
    DRIVE_API + '/files/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent('id,name,size')
  );
  const res = await googleRequest('drive', DRIVE_API + '/files/' + encodeURIComponent(id) + '?alt=media');
  if (res.status < 200 || res.status >= 300) {
    let message = 'HTTP ' + res.status;
    try {
      const data = JSON.parse(res.body.toString('utf8'));
      message = (data.error && data.error.message) || message;
    } catch (error) {
      void error;
    }
    throw new Error(String(message));
  }
  const state = connectorState('drive');
  const localDir = String(state.localDir || '').trim() || projectRoot();
  const target = args.path ? insideProject(args.path) : path.join(localDir, meta.name || id);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, res.body);
  return t().saved + ': ' + shortPath(target) + ' · ' + humanSize(res.body.length);
}

const CONNECTOR_HANDLERS = {
  gmail_search: { connector: 'gmail', run: gmailSearch },
  gmail_read: { connector: 'gmail', run: gmailRead },
  gmail_send: {
    connector: 'gmail',
    run: gmailSend,
    label: (args) => 'Gmail: отправить «' + sanitizeHeader(args.subject) + '» → ' + sanitizeHeader(args.to)
  },
  gmail_reply: {
    connector: 'gmail',
    run: gmailReply,
    label: (args) => 'Gmail: ответить на письмо ' + String(args.id || '')
  },
  drive_search: { connector: 'drive', run: driveSearch },
  drive_upload: {
    connector: 'drive',
    run: driveUpload,
    label: (args) => 'Drive: загрузить ' + String(args.path || '')
  },
  drive_download: {
    connector: 'drive',
    run: driveDownload,
    label: (args) => 'Drive: скачать ' + String(args.id || '') + (args.path ? ' → ' + args.path : '')
  }
};

const MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'save_memory',
    description:
      'Сохранить надолго то, что пользователь просит запомнить. Вызывай только по прямой просьбе запомнить: факт, правило, предпочтение.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'что именно запомнить, кратко и по существу' } },
      required: ['text']
    }
  }
};

function agentTools() {
  const extra = readyConnectors().reduce((all, def) => all.concat(def.tools), []);
  return AGENT_TOOLS.concat(extra).concat([MEMORY_TOOL]);
}

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Показать файлы и папки внутри каталога проекта.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'путь относительно папки проекта, по умолчанию .' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Прочитать текстовый файл проекта.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Создать файл или перезаписать его целиком новым содержимым.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'полное содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Удалить файл или папку проекта.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Выполнить shell-команду в папке проекта.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      }
    }
  }
];

function projectRoot() {
  return config.get('projectFolder') || process.cwd();
}

function insideProject(target) {
  const root = projectRoot();
  const full = path.resolve(root, target || '.');
  const relative = path.relative(root, full);
  if (relative && (relative.startsWith('..') || path.isAbsolute(relative))) throw new Error(t().outside);
  return full;
}

function accessMode() {
  const value = config.get('agentMode');
  return value === 'full' || value === 'aggression' ? value : 'selective';
}

function accessLabel() {
  const s = t();
  const mode = accessMode();
  if (mode === 'full') return s.accessFull;
  if (mode === 'aggression') return s.accessAggression;
  return s.accessSelective;
}

function permissionNeeded(name, args, state) {
  const mode = accessMode();
  if (mode === 'aggression') return false;
  if (name === 'run_command' || name === 'delete_file') return true;
  if (name === 'write_file') {
    const exists = fs.existsSync(insideProject(args.path));
    if (exists) return true;
    return mode === 'full' ? true : state.created >= 4;
  }
  return false;
}

async function confirmStep(question) {
  const answer = (await ask('  ' + paint(C.amber, '? ') + question + ' [y/N]: ')).trim().toLowerCase();
  return answer === 'y' || answer === 'yes' || answer === 'д' || answer === 'да';
}

function toolListFiles(args) {
  const full = insideProject(args.path);
  const entries = fs.readdirSync(full, { withFileTypes: true });
  if (!entries.length) return '(пусто)';
  return entries
    .slice(0, 300)
    .map((entry) => (entry.isDirectory() ? entry.name + '/' : entry.name))
    .join('\n');
}

function toolReadFile(args) {
  const full = insideProject(args.path);
  const text = fs.readFileSync(full, 'utf8');
  return text.length > 20000 ? text.slice(0, 20000) + '\n…файл обрезан' : text;
}

function toolWriteFile(args) {
  const full = insideProject(args.path);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, args.content == null ? '' : String(args.content), 'utf8');
  return full;
}

function toolDelete(args) {
  const full = insideProject(args.path);
  fs.rmSync(full, { recursive: true, force: true });
  return full;
}

function toolCommand(args) {
  const output = require('child_process').execSync(String(args.command), {
    cwd: projectRoot(),
    timeout: 60000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return String(output).trim() || '(команда выполнена без вывода)';
}

async function runTool(call, state) {
  const name = call.function && call.function.name;
  let args = {};
  try {
    args = JSON.parse((call.function && call.function.arguments) || '{}');
  } catch (error) {
    void error;
    args = {};
  }
  return executeTool(name, args, state);
}

async function executeTool(name, args, state) {
  const s = t();
  const connector = CONNECTOR_HANDLERS[name];

  if (connector) {
    if (!connectorReady(connector.connector)) return { ok: false, result: s.connectorNeed };
    if (connector.label && accessMode() !== 'aggression') {
      const label = connector.label(args);
      if (!(await confirmStep(label))) {
        console.log('  ' + paint(C.amber, '✕ ') + paint(C.dim, s.permDenied + ': ' + name));
        return { ok: false, denied: true, result: s.permDenied };
      }
    }
    const result = await connector.run(args);
    console.log('  ' + paint(C.green, '✓ ') + paint(C.dim, name));
    return { ok: true, result: String(result == null ? '' : result).slice(0, 4000) };
  }

  if (name === 'save_memory') {
    const saved = saveMemory(args.text);
    console.log('  ' + paint(C.green, '✓ ') + paint(C.dim, s.memorySaved + ': ' + shortPath(saved.file)));
    return { ok: true, result: s.memorySaved + ': ' + shortPath(saved.file) };
  }

  if (name === 'list_files') return { ok: true, result: toolListFiles(args) };
  if (name === 'read_file') return { ok: true, result: toolReadFile(args) };

  if (name === 'write_file') {
    const exists = fs.existsSync(insideProject(args.path));
    const label = (exists ? s.fileUpdated : s.fileCreated) + ': ' + args.path;
    if (permissionNeeded(name, args, state) && !(await confirmStep(label))) {
      console.log('  ' + paint(C.amber, '✕ ') + paint(C.dim, s.permDenied + ': ' + args.path));
      return { ok: false, denied: true, result: s.permDenied };
    }
    toolWriteFile(args);
    if (!exists) state.created += 1;
    console.log('  ' + paint(C.green, '✓ ') + paint(C.dim, label));
    return { ok: true, result: (exists ? s.fileUpdated : s.fileCreated) + ': ' + args.path };
  }

  if (name === 'delete_file') {
    if (permissionNeeded(name, args, state) && !(await confirmStep(s.fileDeleted + ': ' + args.path))) {
      console.log('  ' + paint(C.amber, '✕ ') + paint(C.dim, s.permDenied + ': ' + args.path));
      return { ok: false, denied: true, result: s.permDenied };
    }
    toolDelete(args);
    console.log('  ' + paint(C.green, '✓ ') + paint(C.dim, s.fileDeleted + ': ' + args.path));
    return { ok: true, result: s.fileDeleted + ': ' + args.path };
  }

  if (name === 'run_command') {
    if (permissionNeeded(name, args, state) && !(await confirmStep('$ ' + args.command))) {
      console.log('  ' + paint(C.amber, '✕ ') + paint(C.dim, s.permDenied + ': ' + args.command));
      return { ok: false, denied: true, result: s.permDenied };
    }
    const output = toolCommand(args);
    console.log('  ' + paint(C.green, '✓ ') + paint(C.dim, '$ ' + args.command));
    return { ok: true, result: output };
  }

  return { ok: false, result: 'неизвестный инструмент: ' + name };
}

function agentSystem() {
  const root = shortPath(projectRoot());
  const access = accessLabel();
  const enabled = readyConnectors()
    .map((def) => def.title)
    .join(', ');
  const extra =
    config.get('language') === 'en'
      ? enabled
        ? 'Enabled connectors: ' + enabled + '. Use their tools when asked for mail or files. '
        : ''
      : enabled
        ? 'Включённые коннекторы: ' + enabled + '. Используй их инструменты, когда просят почту или файлы. '
        : '';
  if (config.get('language') === 'en') {
    return (
      memoryContext() +
      'You are the LOCKCODE agent. Project folder: ' + root + '. Access mode: ' + access + '. ' +
      extra +
      'Work only inside the project folder and use the tools to inspect and change files. ' +
      'When the user asks to remember something, call save_memory with the fact to keep. ' +
      'Act on your own: do not ask for confirmation in text, the CLI asks the user itself. ' +
      'After changes, report briefly what you did.'
    );
  }
  return (
    memoryContext() +
    'Ты — агент LOCKCODE. Папка проекта: ' + root + '. Режим доступа: ' + access + '. ' +
    extra +
    'Работай только внутри папки проекта и используй инструменты, чтобы смотреть и менять файлы. ' +
    'Когда пользователь просит что-то запомнить, вызывай save_memory с тем, что нужно сохранить. ' +
    'Действуй сам, не спрашивай подтверждение текстом — CLI сам спросит пользователя. ' +
    'После изменений коротко отчитайся, что сделано.'
  );
}

async function callModelRaw(model, messages, tools) {
  const server = serverConfig();
  if (server) {
    const body = { model: model.model || GIGA_DEFAULT_MODEL, messages };
    if (tools) body.tools = tools;
    return requestJson(
      {
        url: server.url + '/v1/chat/completions',
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (server.token || '') }
      },
      JSON.stringify(body)
    );
  }

  if (model.kind === 'gigachat') {
    const token = await gigaToken(model);
    const body = { model: model.model || GIGA_DEFAULT_MODEL, messages };
    if (tools) {
      body.functions = tools.map((tool) => tool.function);
      body.function_call = 'auto';
    }
    return requestJson(
      {
        url: GIGA_API + '/chat/completions',
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + token }
      },
      JSON.stringify(body),
      gigaCa()
    );
  }

  const endpoint = endpointOf(model);
  if (!endpoint) throw new Error(t().unknownEndpoint + ' ' + model.name);
  const body = { model: model.model || model.name, messages, temperature: 0.2 };
  if (tools) body.tools = tools;
  return requestJson(
    {
      url: endpoint + '/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + model.apiKey }
    },
    JSON.stringify(body)
  );
}

async function runAgent(model, text) {
  const s = t();
  const state = { created: 0 };
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const conversation = history.filter((message) => message.role !== 'tool' && message.role !== 'function').slice(-10);
  const messages = [{ role: 'system', content: agentSystem() }].concat(conversation);

  for (let step = 0; step < 10; step++) {
    const data = await callModelRaw(model, messages, agentTools());
    mergeUsage(usage, data.usage || data.usageMetadata);
    const choice = (data.choices && data.choices[0]) || null;
    const message = (choice && choice.message) || {};

    if (model.kind === 'gigachat') {
      if (!message.function_call) return { text: String(message.content || '').trim() || s.emptyAnswer, usage };
      const call = { name: message.function_call.name, args: message.function_call.arguments || {} };
      messages.push({
        role: 'assistant',
        content: message.content || '',
        function_call: message.function_call,
        functions_state_id: message.functions_state_id
      });
      let outcome;
      try {
        outcome = await executeTool(call.name, call.args, state);
      } catch (error) {
        outcome = { ok: false, result: error.message };
      }
      messages.push({ role: 'function', name: call.name, content: JSON.stringify(outcome) });
      continue;
    }

    let calls = message.tool_calls || [];
    if (!calls.length && message.function_call) {
      calls = [{ id: 'call_' + step, type: 'function', function: message.function_call }];
    }
    if (!calls.length) return { text: String(message.content || '').trim() || s.emptyAnswer, usage };

    messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
    for (const toolCall of calls) {
      let outcome;
      try {
        outcome = await runTool(toolCall, state);
      } catch (error) {
        outcome = { ok: false, result: error.message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id || 'call_' + step,
        content: JSON.stringify(outcome).slice(0, 4000)
      });
    }
  }
  return { text: s.loopLimit, usage };
}

function replayChat(data) {
  const s = t();
  const pad = panelPad();
  const width = panelWidth();
  console.log('');
  console.log(
    pad +
      paint(C.faint, s.chatWord + ': ') +
      paint(C.ink, data.name) +
      paint(C.faint, '   ·   ' + data.messages.length + ' ' + s.chatMessages) +
      (data.project ? paint(C.faint, '   ·   ' + shortPath(data.project)) : '')
  );
  console.log('');
  data.messages.forEach((message) => {
    if (message.role === 'user') {
      const lines = String(message.text).split(/\r?\n/);
      console.log(pad + paint(C.amber, '❯ ') + paint(C.ink, lines[0]));
      lines.slice(1).forEach((line) => console.log(pad + '  ' + paint(C.body, line)));
      return;
    }
    renderMarkdown(message.text, width).forEach((line) => console.log(pad + line));
    console.log(pad + usageLine(message.model || data.model || '—', { completion_tokens: message.tokens }));
    console.log('');
  });
}

function showChats() {
  const s = t();
  const chats = listChats();
  console.log('');
  console.log('  ' + paint(C.faint, s.chatTitle));
  if (!chats.length) {
    console.log('  ' + paint(C.faint, s.chatEmpty));
    console.log('');
    return;
  }
  const width = Math.max.apply(null, chats.map((chat) => chat.name.length)) + 3;
  chats.forEach((chat) => {
    const updated = chat.updated ? '   ·   ' + String(chat.updated).slice(0, 16).replace('T', ' ') : '';
    console.log(
      '  ' +
        paint(C.ink, chat.name + ' '.repeat(width - chat.name.length)) +
        paint(C.faint, String(chat.count) + ' ' + s.chatMessages + updated)
    );
  });
  console.log('  ' + paint(C.faint, '/chat <' + s.chatWord + '>'));
  console.log('');
}

async function cleanMemoryCommand() {
  const s = t();
  let files = [];
  try {
    files = fs.readdirSync(memoryDir());
  } catch (error) {
    void error;
  }
  console.log('');
  if (!files.length) {
    console.log('  ' + paint(C.faint, s.memoryEmpty));
    console.log('');
    return;
  }
  const allowed = await confirmStep(s.memoryAsk + ' (' + shortPath(memoryDir()) + ')');
  if (!allowed) return note(s.cancelled);
  clearMemory();
  ok(s.memoryCleared + ': ' + shortPath(memoryDir()));
  console.log('');
}

async function chatCommand(arg) {
  const s = t();
  const name = String(arg || '').trim();
  if (!name) return showChats();
  const data = loadChat(name);
  if (!data) return fail(s.chatNotFound + ': ' + name);
  chatName = data.name;
  chatData = data;
  history = data.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, content: message.text }));
  if (history.length > 24) history = history.slice(-24);
  replayChat(data);
  console.log('  ' + paint(C.faint, s.chatLoaded + ': ' + data.name));
  console.log('');
}

function showHelp() {
  const s = t();
  console.log('');
  const pad = Math.max.apply(null, s.help.map((row) => row[0].length)) + 3;
  s.help.forEach((row) => {
    console.log('  ' + paint(C.amber, row[0] + ' '.repeat(pad - row[0].length)) + paint(C.dim, row[1]));
  });
  console.log('');
}

function showModels() {
  const s = t();
  const models = config.get('models');
  const active = config.get('activeModel');
  console.log('');
  [['server', s.server], ['user', s.user]].forEach(([key, title]) => {
    console.log('  ' + paint(C.faint, title));
    const list = models[key] || [];
    if (!list.length) {
      console.log('    ' + paint(C.faint, s.nothing));
      return;
    }
    list.forEach((model) => {
      const mark = model.name === active ? paint(C.amber, '* ') : '  ';
      const ready = hasCreds(model) ? paint(C.green, '✓') : paint(C.faint, '·');
      console.log('  ' + mark + ready + ' ' + paint(C.ink, model.name) + paint(C.dim, ' — ' + model.provider + ' · ' + model.status));
    });
  });
  console.log('');
}

function showLimits() {
  const s = t();
  const models = config.get('models');
  const rows = [].concat(models.server || [], models.user || []);
  console.log('');
  if (!rows.length) {
    console.log('  ' + paint(C.faint, s.nothing));
    console.log('');
    return;
  }
  const nameWidth = Math.max.apply(null, rows.map((row) => row.name.length)) + 2;
  rows.forEach((model) => {
    const used = Number(model.limitUsed) || 0;
    const max = Number(model.limitMax) || 100;
    console.log(
      '  ' +
        paint(C.ink, model.name + ' '.repeat(nameWidth - model.name.length)) +
        bar(used, max) +
        '  ' +
        paint(C.dim, `${used}% / ${max}%`)
    );
  });
  console.log('');
}

function bar(used, max) {
  const ratio = Math.max(0, Math.min(1, used / (max || 100)));
  const filled = Math.round(ratio * 12);
  return paint(C.b, '█'.repeat(filled)) + paint(C.faint, '░'.repeat(12 - filled));
}

function setAgentAccess(arg) {
  const s = t();
  const value = (arg || '').toLowerCase();
  const aliases = {
    '1': 'full',
    full: 'full',
    'полный': 'full',
    '2': 'selective',
    selective: 'selective',
    'выборочно': 'selective',
    '3': 'aggression',
    aggression: 'aggression',
    'агрессия': 'aggression'
  };
  const order = ['full', 'selective', 'aggression'];
  const next = aliases[value] || order[(order.indexOf(accessMode()) + 1) % order.length];
  config.set('agentMode', next);
  ok(`${s.accessChanged}: ${accessLabel()}`);
  console.log('');
  renderHeader();
}

function showConnectors() {
  const s = t();
  console.log('');
  console.log('  ' + paint(C.faint, s.connectorsTitle));
  CONNECTORS.forEach((def, index) => {
    const state = connectorState(def.id);
    const ready = connectorReady(def.id);
    const dot = ready ? paint(C.green, '●') : paint(C.faint, '○');
    const status = ready ? s.connectorOnState : state.refreshToken ? s.connectorOffState : s.connectorNone;
    console.log(
      '  ' +
        paint(C.faint, String(index + 1).padStart(2) + '. ') +
        dot +
        ' ' +
        paint(C.ink, def.title + ' '.repeat(Math.max(0, 13 - def.title.length))) +
        paint(C.dim, status + ' · ' + connectorNote(def))
    );
  });
  console.log('  ' + paint(C.faint, s.connectorHint));
  console.log('');
}

function resolveConnector(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const byNumber = CONNECTORS[Number(raw) - 1];
  if (byNumber) return byNumber;
  const lower = raw.toLowerCase();
  return CONNECTORS.find((def) => def.id === lower || def.title.toLowerCase() === lower) || null;
}

async function connectorMenu(def) {
  const s = t();
  const state = connectorState(def.id);
  const ready = connectorReady(def.id);
  const status = ready ? paint(C.green, s.connectorOnState) : state.refreshToken ? paint(C.amber, s.connectorOffState) : paint(C.faint, s.connectorNone);

  console.log('');
  console.log('  ' + paint(C.ink, def.title) + paint(C.dim, ' — ' + connectorNote(def)));
  console.log('  ' + paint(C.dim, s.connectorStatus + ': ') + status + (state.account ? paint(C.faint, ' · ' + state.account) : ''));
  console.log('  ' + paint(C.dim, 'scopes: ') + paint(C.faint, def.scopes.map(shortScope).join(', ')));
  if (def.id === 'drive' && (state.driveFolder || state.localDir)) {
    console.log(
      '  ' +
        paint(C.dim, 'drive: ') +
        paint(C.faint, (state.driveFolder || '—') + ' → ' + shortPath(state.localDir || projectRoot()))
    );
  }
  console.log('  ' + paint(C.faint, s.connectorMenu));

  const pick = (await ask('  ' + paint(C.amber, '? ') + '1–3: ')).trim();
  if (!pick) return note(s.cancelled);

  if (pick === '1') return googleConnect(def);

  if (pick === '2') {
    if (!state.refreshToken) return fail(s.connectorNone + ' — ' + def.title);
    const next = !state.enabled;
    saveConnector(def.id, Object.assign({}, connectorState(def.id), { enabled: next }));
    ok((next ? s.connectorOnOk : s.connectorOffOk) + ': ' + def.title);
    console.log('');
    return;
  }

  if (pick === '3') {
    if (!state.refreshToken) return fail(s.connectorNone + ' — ' + def.title);
    forgetConnector(def.id);
    ok(s.connectorForgot + ': ' + def.title);
    console.log('');
    return;
  }

  return note(s.cancelled);
}

async function connectorsCommand(arg) {
  const s = t();
  const parts = String(arg || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    showConnectors();
    return;
  }

  const head = parts[0].toLowerCase();
  if (head === 'on' || head === 'off') {
    const def = resolveConnector(parts[1] || '');
    if (!def) return fail(s.connectorUnknown + ' — ' + s.connectorPick);
    const state = connectorState(def.id);
    if (head === 'on' && !state.refreshToken) return connectorMenu(def);
    saveConnector(def.id, Object.assign({}, state, { enabled: head === 'on' }));
    ok((head === 'on' ? s.connectorOnOk : s.connectorOffOk) + ': ' + def.title);
    console.log('');
    return;
  }

  const def = resolveConnector(parts[0]);
  if (!def) return fail(s.connectorUnknown + ' — ' + s.connectorPick);
  return connectorMenu(def);
}

function setServer(arg) {
  const s = t();
  const parts = (arg || '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    const server = serverConfig();
    console.log('');
    if (!server) {
      console.log('  ' + paint(C.amber, '○ ') + paint(C.dim, s.serverOff));
    } else {
      console.log('  ' + paint(C.green, '● ') + paint(C.ink, server.url));
      console.log('  ' + paint(C.dim, 'token: ' + (server.token ? '***' : '—')));
    }
    console.log('  ' + paint(C.faint, s.serverHint));
    console.log('');
    return;
  }

  if (parts[0].toLowerCase() === 'off') {
    config.delete('serverUrl');
    config.delete('serverToken');
    ok(s.serverOffSet);
    console.log('');
    renderHeader();
    return;
  }

  if (!/^https?:\/\//i.test(parts[0])) return fail(s.serverBadUrl);
  config.set('serverUrl', parts[0].replace(/\/+$/, ''));
  config.set('serverToken', parts[1] || '');
  ok(`${s.serverSet}: ${parts[0]}`);
  console.log('');
  renderHeader();
}

function setKeyFile(arg) {
  const s = t();
  const parts = (arg || '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    const url = remoteKeyUrl();
    console.log('');
    if (!url) {
      console.log('  ' + paint(C.amber, '○ ') + paint(C.dim, s.keyfileHint));
    } else {
      console.log('  ' + paint(C.green, '● ') + paint(C.ink, url));
      console.log('  ' + paint(C.dim, s.keyfilePublic));
    }
    console.log('');
    return;
  }

  if (parts[0].toLowerCase() === 'off') {
    config.delete('keyUrl');
    remoteKeyCache = null;
    ok(s.keyfileOff);
    console.log('');
    renderHeader();
    return;
  }

  if (!/^https?:\/\//i.test(parts[0])) return fail(s.keyfileBad);
  config.set('keyUrl', parts[0]);
  remoteKeyCache = null;
  ok(`${s.keyfileSet} ${parts[0]}`);
  note(s.keyfilePublic);
  console.log('');
  renderHeader();
}

function deleteModel(name) {
  const s = t();
  const models = config.get('models');
  const matches = (model) => model.name.toLowerCase() === name.toLowerCase();
  const before = (models.server || []).length + (models.user || []).length;

  models.server = (models.server || []).filter((model) => !matches(model));
  models.user = (models.user || []).filter((model) => !matches(model));
  const after = models.server.length + models.user.length;

  if (after === before) return fail(`${s.nothing}: ${name}`);

  const active = String(config.get('activeModel') || '');
  if (active.toLowerCase() === name.toLowerCase()) {
    const next = models.server[0] || models.user[0];
    config.set('activeModel', next ? next.name : '');
  }

  config.set('models', models);
  ok(`${s.modelDeleted}: ${name}`);
  console.log('');
  renderHeader();
  return false;
}

async function providerModels(model) {
  if (model.kind === 'gigachat') {
    const token = await gigaToken(model);
    const data = await requestJson(
      { url: GIGA_API + '/models', method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer ' + token } },
      null,
      gigaCa()
    );
    return (data.data || []).map((item) => item.id).filter(Boolean);
  }
  const endpoint = endpointOf(model);
  const data = await requestJson({
    url: endpoint + '/models',
    method: 'GET',
    headers: { accept: 'application/json', authorization: 'Bearer ' + model.apiKey }
  });
  return (data.data || []).map((item) => item.id).filter(Boolean);
}

function applySubmodel(id) {
  const models = config.get('models');
  const active = config.get('activeModel');
  const entry = [].concat(models.server || [], models.user || []).find((item) => item.name === active);
  if (entry) entry.model = id;
  config.set('models', models);
}

async function showSubmodels(arg) {
  const s = t();
  const model = activeModel();
  if (!model || !hasCreds(model)) return fail(s.noKey + ' ' + (model ? model.name : '') + ' — /add');

  let list = [];
  const stop = spinner(s.submodels + '…');
  try {
    list = await providerModels(model);
    stop();
  } catch (error) {
    stop();
    return errorBox(explain(error));
  }

  const current = model.model || model.name;
  console.log('');
  if (!list.length) {
    console.log('  ' + paint(C.faint, s.nothing));
    console.log('');
    return;
  }
  list.forEach((id, index) => {
    const mark = id === current ? paint(C.amber, '* ') : '  ';
    console.log('  ' + mark + paint(C.dim, String(index + 1).padStart(2) + '. ') + paint(C.ink, id));
  });
  console.log('');

  const pick = (arg || '').trim();
  if (!pick) return;
  const selected = list[Number(pick) - 1] || list.find((id) => id.toLowerCase() === pick.toLowerCase());
  if (!selected) return fail(`${s.nothing}: ${pick}`);
  applySubmodel(selected);
  ok(`${s.switched}: ${selected} — /submodels`);
}

async function addModel() {
  const s = t();
  console.log('');
  PROVIDERS.forEach((provider, index) => {
    console.log('  ' + paint(C.faint, String(index + 1).padStart(2) + '. ') + paint(C.ink, provider));
  });

  const picked = (await ask('  ' + paint(C.amber, '? ') + s.provider + ': ')).trim();
  if (!picked) return note(s.cancelled);
  const byNumber = PROVIDERS[Number(picked) - 1];
  const byName = PROVIDERS.find((provider) => provider.toLowerCase() === picked.toLowerCase());
  const provider = byName || byNumber;
  if (!provider) return fail(`${s.nothing}: ${picked} — 1…${PROVIDERS.length}`);

  if (provider === 'GigaChat') {
    const modelId = (await ask('  ' + paint(C.amber, '? ') + s.modelName + ' (' + GIGA_DEFAULT_MODEL + '): ')).trim() || GIGA_DEFAULT_MODEL;
    const scope = (await ask('  ' + paint(C.amber, '? ') + s.scope + ' (' + GIGA_DEFAULT_SCOPE + '): ')).trim() || GIGA_DEFAULT_SCOPE;
    const clientId = (await ask('  ' + paint(C.amber, '? ') + s.clientId + ': ')).trim();
    const authKey = (await askHidden('  ' + paint(C.amber, '? ') + s.authKey + ': ')).trim();
    if (!authKey) return note(s.cancelled);

    const models = config.get('models');
    const entry = {
      name: GIGA_LABEL,
      provider: 'GigaChat',
      kind: 'gigachat',
      endpoint: GIGA_API,
      model: modelId,
      scope,
      clientId,
      authKey,
      status: 'GigaChat API',
      limitUsed: 0,
      limitMax: 100
    };
    const serverIndex = models.server.findIndex((model) => model.name === GIGA_LABEL);
    const userIndex = models.user.findIndex((model) => model.name === GIGA_LABEL);
    if (serverIndex >= 0) models.server[serverIndex] = entry;
    else if (userIndex >= 0) models.user[userIndex] = entry;
    else models.user.push(entry);
    config.set('models', models);
    config.set('activeModel', GIGA_LABEL);

    console.log('');
    ok(`${GIGA_LABEL} (${modelId}) — ${s.added}`);
    note(s.keyNote);
    console.log('');
    renderHeader();
    return;
  }

  const modelName = (await ask('  ' + paint(C.amber, '? ') + s.modelName + ': ')).trim();
  if (!modelName) return note(s.cancelled);

  let endpoint = EDU[provider];
  if (provider === 'Custom' || !endpoint) {
    const given = (await ask('  ' + paint(C.amber, '? ') + s.baseUrl + ': ')).trim();
    if (!given) return note(s.cancelled);
    endpoint = given.replace(/\/+$/, '');
  }

  const apiKey = (await askHidden('  ' + paint(C.amber, '? ') + s.apiKey + ' ' + provider + ': ')).trim();
  if (!apiKey) return note(s.cancelled);

  const models = config.get('models');
  models.user.push({
    name: modelName,
    provider,
    endpoint,
    apiKey,
    model: modelName,
    status: 'Ready',
    limitUsed: 0,
    limitMax: 100
  });
  config.set('models', models);
  config.set('activeModel', modelName);

  console.log('');
  ok(`${modelName} — ${s.added}`);
  note(s.keyNote);
  console.log('');
  renderHeader();
}

async function setFolder(arg) {
  const s = t();
  const raw = (arg || (await ask('  ' + paint(C.amber, '? ') + s.folder + ': '))).trim();
  if (!raw) return note(s.cancelled);
  const target = path.resolve(raw.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory()) return fail(s.folderBad + ': ' + target);
  config.set('projectFolder', target);
  ok(`${s.folderSet}: ${shortPath(target)}`);
  console.log('');
  renderHeader();
}

function setMode(arg) {
  const s = t();
  const requested = (arg || '').toLowerCase();
  const mode = requested === 'chat' || requested === 'agent' ? requested : config.get('mode') === 'agent' ? 'chat' : 'agent';
  config.set('mode', mode);
  ok(`${s.modeSet}: ${mode}`);
  console.log('');
  renderHeader();
}

function setLanguage(arg) {
  const s = t();
  const requested = (arg || '').toLowerCase();
  const language = requested === 'en' || requested === 'ru' ? requested : config.get('language') === 'en' ? 'ru' : 'en';
  config.set('language', language);
  ok(`${s.langSet}: ${language}`);
  console.log('');
  renderHeader();
}

const FOLDER_INTENT =
  /(созда|сдела|запиш|сохран|полож|копир|перенес|перемест|перейд|открой|работа|create|make|write|save|copy|move|switch|open|work)/i;

const LOCATIONS = [
  { re: /(рабоч[а-яё]*\s+стол[а-яё]*|desktop)/i, dir: () => path.join(os.homedir(), 'Desktop') },
  { re: /(документ[а-яё]*|documents?)/i, dir: () => documentsDir() },
  { re: /(загрузк[а-яё]*|downloads?)/i, dir: () => path.join(os.homedir(), 'Downloads') },
  { re: /(картинк[а-яё]*|изображени[а-яё]*|pictures?)/i, dir: () => path.join(os.homedir(), 'Pictures') }
];

function pathCandidates(text) {
  const source = String(text || '');
  const found = [];
  const quoted = /["'`]([^"'`\n]+)["'`]/g;
  let match;
  while ((match = quoted.exec(source))) found.push(match[1]);
  const bare = /(?:^|[\s(])((?:[A-Za-z]:[\\/]|~[\\/]|\/)[^\s"'`]+)/g;
  while ((match = bare.exec(source))) found.push(match[1]);
  return found
    .map((value) => String(value).trim().replace(/[.,;:!?)\]}>]+$/, ''))
    .filter(Boolean);
}

function folderInside(target, parent) {
  const relative = path.relative(parent, target);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveFolderCandidate(candidate, root, allowMissing) {
  const target = path.resolve(String(candidate).replace(/^~(?=$|[\\/])/, os.homedir()));
  let folder = target;
  let create = false;
  let stat = null;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    void error;
  }
  if (stat) {
    if (!stat.isDirectory()) folder = path.dirname(target);
  } else if (allowMissing && !path.extname(target)) {
    folder = target;
    create = true;
  } else {
    folder = path.dirname(target);
  }
  const probe = create ? path.dirname(folder) : folder;
  try {
    if (!fs.statSync(probe).isDirectory()) return null;
  } catch (error) {
    void error;
    return null;
  }
  if (folder === root) return null;
  if (folderInside(folder, root)) return null;
  return { path: folder, create };
}

function driveRoots(text) {
  const dirs = [];
  const drive = /(?:^|[\s(])([A-Za-z]):[\\/]?(?=\s|$|[.,;:!?])/g;
  let match;
  while ((match = drive.exec(text))) dirs.push(match[1].toUpperCase() + ':\\');
  const driveWord = /(?:диск[а-яё]*|drive)\s+([A-Za-z])\b/i.exec(text);
  if (driveWord) dirs.push(driveWord[1].toUpperCase() + ':\\');
  return dirs;
}

function locationFolders(text) {
  const dirs = [];
  LOCATIONS.forEach((item) => {
    if (item.re.test(text)) dirs.push(item.dir());
  });
  return dirs;
}

function namedFolderCandidates(text) {
  const names = [];
  const re =
    /(?:в|во|на|in|into|to)\s+(?:папк[а-яё]*|директори[а-яё]*|каталог[а-яё]*|folder|directory)\s+["'«`]?([^"'»`\n]+)/gi;
  let match;
  while ((match = re.exec(text))) {
    let name = match[1].trim();
    name = name.split(/\s+(?:и|а|но|где|чтобы|with|and|then)\s+/i)[0].trim();
    name = name.replace(/[.,;:!?]+$/, '').trim();
    if (!name || /[\\/]/.test(name)) continue;
    names.push(name);
    const first = name.split(/\s+/)[0];
    if (first && first !== name) names.push(first);
  }
  return names;
}

function resolveNamedFolder(name) {
  const bases = [
    process.cwd(),
    path.dirname(path.resolve(projectRoot())),
    os.homedir(),
    path.join(os.homedir(), 'Desktop'),
    documentsDir()
  ];
  for (const base of bases) {
    const target = path.resolve(base, name);
    try {
      if (fs.statSync(target).isDirectory()) return target;
    } catch (error) {
      void error;
    }
  }
  return null;
}

function requestedFolder(text) {
  const root = path.resolve(projectRoot());
  const source = String(text || '');
  const paths = pathCandidates(source);
  const explicit = paths.concat(driveRoots(source));
  for (const candidate of explicit) {
    const resolution = resolveFolderCandidate(candidate, root, true);
    if (resolution) return resolution;
  }
  if (!FOLDER_INTENT.test(source)) return null;
  let words = source;
  paths.forEach((candidate) => {
    words = words.split(candidate).join(' ');
  });
  for (const dir of locationFolders(words)) {
    const resolution = resolveFolderCandidate(dir, root, true);
    if (resolution) return resolution;
  }
  for (const name of namedFolderCandidates(words)) {
    const target = resolveNamedFolder(name);
    if (!target) continue;
    if (target === root || folderInside(target, root)) continue;
    return { path: target, create: false };
  }
  return null;
}

async function maybeSwitchFolder(text) {
  const target = requestedFolder(text);
  if (!target) return 'none';
  const s = t();
  const label = shortPath(target.path) + (target.create ? (config.get('language') === 'en' ? ' (new folder)' : ' (новая папка)') : '');
  console.log('');
  const allowed = await confirmStep(s.switchAsk + ': ' + label);
  if (!allowed) {
    note(s.switchDenied);
    console.log('');
    return 'denied';
  }
  try {
    ensureDir(target.path);
  } catch (error) {
    fail(s.folderBad + ': ' + target.path);
    console.log('');
    return 'denied';
  }
  config.set('projectFolder', target.path);
  ok(s.folderSet + ': ' + shortPath(target.path));
  clearScreen();
  renderHeader();
  return 'switched';
}

async function respond(text) {
  const s = t();
  const model = activeModel();

  addMsg('user', text);

  if (!model) {
    console.log('');
    console.log('  ' + paint(C.amber, '○ ') + paint(C.dim, s.noModel));
    console.log('');
    return;
  }

  if (!hasCreds(model)) {
    console.log('');
    console.log('  ' + paint(C.amber, '○ ') + paint(C.dim, s.noKey + ' ' + model.name + ' — /add'));
    console.log('');
    return;
  }
  if (!serverConfig() && model.kind !== 'gigachat' && !endpointOf(model)) {
    console.log('');
    console.log('  ' + paint(C.amber, '○ ') + paint(C.dim, s.unknownEndpoint + ' ' + model.name + ' — /add'));
    console.log('');
    return;
  }

  if (config.get('mode') === 'agent') {
    try {
      const answer = await runAgent(model, text);
      addMsg('assistant', answer.text, { model: modelTag(model), tokens: tokensUsed(answer.usage) });
      reply(answer.text, modelTag(model), answer.usage);
    } catch (error) {
      errorBox(explain(error));
    }
    return;
  }

  const stop = spinner(s.asking + ' ' + modelTag(model) + '…');
  try {
    const messages = [{ role: 'system', content: memoryContext() + s.system }].concat(history);
    const result = await askModel(model, messages);
    stop();
    addMsg('assistant', result.text, { model: modelTag(model), tokens: tokensUsed(result.usage) });
    reply(result.text, modelTag(model), result.usage);
  } catch (error) {
    stop();
    errorBox(explain(error));
  }
}

async function runCommand(input) {
  const [name, ...rest] = input.split(/\s+/);
  const arg = rest.join(' ').trim();
  const command = name.toLowerCase();

  switch (command) {
    case '/':
    case '/help':
    case '/?':
      showHelp();
      return false;
    case '/submodels':
      await showSubmodels(arg);
      return false;
    case '/connector':
    case '/connectors':
      await connectorsCommand(arg);
      return false;
    case '/keyfile':
      setKeyFile(arg);
      return false;
    case '/server':
      setServer(arg);
      return false;
    case '/modeagent':
      setAgentAccess(arg);
      return false;
    case '/chat':
      await chatCommand(arg);
      return false;
    case '/cleanmemory':
      await cleanMemoryCommand();
      return false;
    case '/models':
      showModels();
      return false;
    case '/add':
      await addModel();
      return false;
    case '/model': {
      const s = t();
      const trimmed = arg.trim();
      if (trimmed === '-del' || trimmed.startsWith('-del ')) {
        const target = trimmed.replace(/^-del\s+/, '').trim();
        if (!target) return fail(s.modelDelUsage);
        return deleteModel(target);
      }
      const models = [].concat(config.get('models').server || [], config.get('models').user || []);
      if (!trimmed) return showModels();
      const found = models.find((model) => model.name.toLowerCase() === trimmed.toLowerCase());
      if (!found) return fail(`${s.nothing}: ${trimmed}`);
      config.set('activeModel', found.name);
      ok(`${s.model}: ${found.name}`);
      return false;
    }
    case '/limits':
      showLimits();
      return false;
    case '/mode':
      setMode(arg);
      return false;
    case '/folder':
      await setFolder(arg);
      return false;
    case '/lang':
      setLanguage(arg);
      return false;
    case '/clear':
      history = [];
      clearScreen();
      renderHeader();
      return false;
    case '/exit':
    case '/quit':
    case '/q':
      return true;
    default:
      fail(`${name} — /help`);
      return false;
  }
}

function promptLabel() {
  return panelPad() + paint(C.amber, '❯ ');
}

async function loop() {
  for (;;) {
    inputFrame();
    const raw = process.stdout.isTTY ? await ask(promptLabel(), true) : await ask('');
    closePanel(raw);
    const input = raw.trim();
    if (!input) continue;
    if (input.startsWith('/')) {
      const head = input.split(/\s+/)[0].toLowerCase();
      if (head !== '/exit' && head !== '/quit' && head !== '/q') {
        clearScreen();
        renderHeader();
      }
      const quit = await runCommand(input);
      if (quit) break;
      continue;
    }
    printUserMessage(input);
    const decision = await maybeSwitchFolder(input);
    if (decision === 'denied') continue;
    await respond(input);
  }
}

async function chooseLanguage() {
  const answer = (await ask('Language / Язык [ru/en] (ru): ')).trim().toLowerCase();
  config.set('language', answer === 'en' ? 'en' : 'ru');
  config.set('firstRun', false);
}

function finish(code) {
  if (finished) return;
  finished = true;
  try {
    if (rl) rl.close();
  } catch (error) {
    void error;
  }
  console.log('\n  ' + paint(C.dim, t().bye));
  process.exit(code || 0);
}

async function main() {
  process.title = 'lockcode';
  ensureConfig();

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdout.isTTY),
    historySize: 300
  });

  rl.on('line', onLine);
  rl.on('SIGINT', () => finish(0));
  rl.on('close', () => finish(0));

  if (config.get('firstRun') !== false) await chooseLanguage();

  chatName = newChatName();
  clearScreen();
  renderHeader();
  await loop();
  finish(0);
}

main().catch((error) => {
  console.log(paint(C.amber, '! ') + (error && error.message ? error.message : String(error)));
  process.exit(1);
});