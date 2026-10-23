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

const config = new Conf({ projectName: 'lockcode' });

const C = {
  a: '#cddcff',
  b: '#8aa4e6',
  amber: '#e9b872',
  green: '#7ed0a3',
  ink: '#e6ecf7',
  body: '#b9c4d6',
  dim: '#77839a',
  faint: '#4c586c',
  line: '#2a3546'
};

const ANSI = /\u001b\[[0-9;]*m/g;
const visible = (s) => String(s).replace(ANSI, '');
const paint = (color, s) => chalk.hex(color)(s);

const GLYPHS = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111']
};

const LOCK_GLYPH = ['01110', '10001', '10001', '11111', '11011', '11011', '11111'];
GLYPHS['#'] = LOCK_GLYPH;

const EDU = {
  OpenRouter: 'https://openrouter.ai/api/v1',
  DeepSeek: 'https://api.deepseek.com',
  OpenAI: 'https://api.openai.com/v1',
  Mistral: 'https://api.mistral.ai/v1',
  Gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  Claude: 'https://api.anthropic.com/v1'
};

const SUBMODELS = {
  Gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.5-flash'],
  OpenRouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
  DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
  OpenAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  Mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
  Claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
};

const STR = {
  ru: {
    tagline: 'Агент в терминале: читает проект, правит файлы, запускает тесты.',
    session: 'сессия',
    project: 'проект',
    model: 'модель',
    submodel: 'подмодель',
    context: 'контекст',
    folder: 'папка',
    mode: 'режим',
    hint: 'ctrl+c выход · введите / для меню · ↑ история',
    bye: 'до встречи',
    cancelled: 'отменено',
    provider: 'провайдер',
    modelName: 'название модели (например gemini-1.5-flash)',
    apiKey: 'API-ключ',
    baseUrl: 'базовый URL API (https://…)',
    added: 'добавлена',
    deleted: 'удалена',
    keyNote: 'ключ сохранён локально; запросы пойдут напрямую к провайдеру',
    nothing: 'ничего не найдено',
    server: 'SERVER',
    user: 'USER',
    folderSet: 'папка проекта',
    folderBad: 'такой папки нет',
    modeSet: 'режим',
    langSet: 'язык',
    noKey: 'нет API-ключа у',
    unknownEndpoint: 'нет адреса API у',
    asking: 'обращение к',
    requestFailed: 'запрос не удался',
    tokens: 'ток.',
    system: 'Ты — LOCKCODE, агент для работы с кодом в терминале. Отвечай кратко, точно и по делу.',
    help: [
      ['/help', 'этот список команд'],
      ['/mode [chat|agent]', 'режим работы (чат или агент)'],
      ['/models', 'список моделей SERVER и USER'],
      ['/submodel', 'выбрать подмодель (версию) для текущего провайдера'],
      ['/add', 'добавить новую модель и ключ'],
      ['/model <имя>', 'выбрать активную модель'],
      ['/model -del <имя>', 'удалить пользовательскую модель'],
      ['/limits', 'расход лимитов сессии'],
      ['/folder <путь>', 'сменить папку проекта'],
      ['/lang [ru|en]', 'язык интерфейса'],
      ['/clear', 'очистить экран и контекст'],
      ['/exit', 'выход из программы']
    ]
  },
  en: {
    tagline: 'Terminal agent: reads your project, edits files, runs tests.',
    session: 'session',
    project: 'project',
    model: 'model',
    submodel: 'submodel',
    context: 'context',
    folder: 'folder',
    mode: 'mode',
    hint: 'ctrl+c exit · type / for menu · ↑ history',
    bye: 'bye',
    cancelled: 'cancelled',
    provider: 'provider',
    modelName: 'model name (e.g. gemini-1.5-flash)',
    apiKey: 'API key',
    baseUrl: 'API base URL (https://…)',
    added: 'added',
    deleted: 'deleted',
    keyNote: 'key saved locally; requests go straight to the provider',
    nothing: 'nothing found',
    server: 'SERVER',
    user: 'USER',
    folderSet: 'project folder',
    folderBad: 'no such directory',
    modeSet: 'mode',
    langSet: 'language',
    noKey: 'no API key for',
    unknownEndpoint: 'no API endpoint for',
    asking: 'calling',
    requestFailed: 'request failed',
    tokens: 'tok.',
    system: 'You are LOCKCODE, a terminal coding agent. Answer briefly, precisely and to the point.',
    help: [
      ['/help', 'this command list'],
      ['/mode [chat|agent]', 'work mode'],
      ['/models', 'SERVER and USER models'],
      ['/submodel', 'select submodel (version)'],
      ['/add', 'add a model and key'],
      ['/model <name>', 'select active model'],
      ['/model -del <name>', 'delete custom model'],
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

const addMsg = (role, content) => {
  history.push({ role, content });
  if (history.length > 24) history = history.slice(-24);
};

function onLine(line) {
  if (waiter) {
    const resolve = waiter;
    waiter = null;
    resolve(line);
    return;
  }
  queue.push(line);
}

function ensureConfig() {
  if (!config.get('language')) config.set('language', 'ru');
  if (!config.get('mode')) config.set('mode', 'agent');
  if (!config.get('contextWindow')) config.set('contextWindow', '128k');
  if (!config.get('projectFolder')) config.set('projectFolder', process.cwd());
  if (!config.get('activeModel')) config.set('activeModel', 'Mistral (Server)');
  if (!config.get('models')) {
    config.set('models', {
      server: [{ name: 'Mistral (Server)', provider: 'Mistral AI', model: 'mistral-small-latest', status: 'Server', limitUsed: 0, limitMax: 100 }],
      user: []
    });
  }
}

function termWidth() {
  return process.stdout.columns || 80;
}

function cardWidth() {
  return Math.min(74, Math.max(44, termWidth() - 6));
}

function center(text, width) {
  const pad = Math.max(0, Math.floor((width - visible(text).length) / 2));
  return ' '.repeat(pad) + text;
}

function fit(text, width) {
  const plain = visible(text);
  if (plain.length === width) return text;
  if (plain.length < width) return text + ' '.repeat(width - plain.length);
  return plain.slice(0, Math.max(0, width - 1)) + '…';
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

function box(title, lines, width) {
  const head = title ? `─ ${title} ` : '';
  const out = [paint(C.line, '╭' + head + '─'.repeat(Math.max(0, width - 2 - visible(head).length)) + '╮')];
  for (const line of lines) {
    out.push(paint(C.line, '│') + ' ' + fit(line, width - 4) + ' ' + paint(C.line, '│'));
  }
  out.push(paint(C.line, '╰' + '─'.repeat(Math.max(0, width - 2)) + '╯'));
  return out;
}

function shortPath(target) {
  const home = os.homedir();
  if (target && target.startsWith(home)) return '~' + target.slice(home.length);
  return target || '—';
}

function infoCard() {
  const s = t();
  const width = cardWidth();
  const currentModel = activeModel();
  const modelDisplay = currentModel ? `${currentModel.name} (${currentModel.model || 'default'})` : '—';
  const rows = [
    [s.project, path.basename(config.get('projectFolder')) || '—'],
    [s.model, modelDisplay],
    [s.context, config.get('contextWindow')],
    [s.folder, shortPath(config.get('projectFolder'))],
    [s.mode, config.get('mode')]
  ];
  const labelWidth = Math.max.apply(null, rows.map((row) => visible(row[0]).length)) + 2;
  const lines = rows.map(
    (row) =>
      paint(C.dim, row[0] + ' '.repeat(labelWidth - visible(row[0]).length)) +
      paint(C.ink, fit(String(row[1]), width - 4 - labelWidth))
  );
  return box(s.session, lines, width);
}

function renderHeader() {
  const width = termWidth();
  const s = t();
  const out = [''];

  toBlocks(rasterize([{ text: '#', color: C.amber }])).forEach((row) => out.push(center(row, width)));
  out.push('');
  toBlocks(
    rasterize([
      { text: 'LOCK', color: C.a },
      { text: 'CODE', color: C.b }
    ])
  ).forEach((row) => out.push(center(row, width)));

  out.push('');
  wrap(s.tagline, Math.min(width - 8, 72)).forEach((line) => out.push(center(paint(C.dim, line), width)));
  out.push('');

  const card = infoCard();
  const side = Math.max(0, Math.floor((width - visible(card[0]).length) / 2));
  card.forEach((line) => out.push(' '.repeat(side) + line));

  out.push('');
  out.push(center(paint(C.faint, s.hint), width));
  out.push('');

  console.log(out.join('\n'));
}

function clearScreen() {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }
}

function refreshScreen() {
  clearScreen();
  renderHeader();
}

function ask(query) {
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

function postJson(url, payload, apiKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return reject(new Error('неверный URL: ' + url));
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const body = JSON.stringify(payload);
    
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'lockcode-cli/1.0',
      'content-length': Buffer.byteLength(body)
    };
    if (apiKey) {
      headers['authorization'] = 'Bearer ' + apiKey;
    }

    const req = lib.request(
      parsed,
      {
        method: 'POST',
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data;
          try {
            data = JSON.parse(raw);
          } catch (error) {
            return reject(new Error('неверный JSON: ' + raw.slice(0, 200)));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = (data && data.error && (data.error.message || data.error.type)) || 'HTTP ' + res.statusCode;
            return reject(new Error(message));
          }
          resolve(data);
        });
      }
    );
    req.setTimeout(timeoutMs || 60000, () => req.destroy(new Error('таймаут соединения')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractReply(data) {
  if (data && data.choices && data.choices[0] && data.choices[0].message) {
    const content = String(data.choices[0].message.content || '').trim();
    if (!content) throw new Error('модель вернула пустой ответ');
    return { text: content, usage: data.usage };
  }
  if (data && data.candidates && data.candidates[0] && data.candidates[0].content) {
    const parts = data.candidates[0].content.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (!text) throw new Error('модель вернула пустой ответ');
    return { text, usage: data.usageMetadata };
  }
  throw new Error('нет ответа в ответе модели');
}

function activeModel() {
  const name = config.get('activeModel');
  const list = [].concat(config.get('models').server || [], config.get('models').user || []);
  return list.find((model) => model.name === name) || list[0] || null;
}

function endpointOf(model) {
  if (!model) return null;
  const base = model.endpoint || model.apiBase || EDU[model.provider];
  return base ? String(base).replace(/\/+$/, '') : null;
}

function showInteractiveMenu() {
  const s = t();
  console.log('');
  console.log('  ' + paint(C.amber, '✦ Claude / Gemini Style Command Palette:'));
  const pad = Math.max.apply(null, s.help.map((row) => row[0].length)) + 3;
  s.help.forEach((row) => {
    console.log('    ' + paint(C.amber, row[0] + ' '.repeat(pad - row[0].length)) + paint(C.dim, row[1]));
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
      const hasKey = model.apiKey ? paint(C.green, '✓') : paint(C.faint, '·');
      const subInfo = model.model ? ` [${model.model}]` : '';
      console.log('  ' + mark + hasKey + ' ' + paint(C.ink, model.name + subInfo) + paint(C.dim, ' — ' + model.provider + ' · ' + model.status));
    });
  });
  console.log('');
}

async function handleSubmodel(arg) {
  const s = t();
  const model = activeModel();
  if (!model) {
    fail('Нет активной модели');
    return;
  }
  const availableSubmodels = SUBMODELS[model.provider] || [];
  if (!availableSubmodels.length) {
    fail(`У провайдера ${model.provider} нет предопределенных подмоделей.`);
    return;
  }

  const query = (arg || '').trim();
  if (!query) {
    console.log('');
    console.log('  ' + paint(C.amber, `✦ Подмодели для ${model.provider}:`));
    availableSubmodels.forEach((sub, idx) => {
      const current = model.model === sub ? paint(C.green, ' (активна)') : '';
      console.log(`    ${idx + 1}. ${paint(C.ink, sub)}${current}`);
    });
    console.log('  ' + paint(C.dim, 'Использование: /submodel <название или номер>'));
    console.log('');
    return;
  }

  let selectedSub = '';
  const num = Number(query);
  if (!isNaN(num) && num > 0 && num <= availableSubmodels.length) {
    selectedSub = availableSubmodels[num - 1];
  } else {
    const found = availableSubmodels.find((sub) => sub.toLowerCase().includes(query.toLowerCase()));
    if (found) selectedSub = found;
    else selectedSub = query;
  }

  const models = config.get('models');
  let foundObj = (models.user || []).find((m) => m.name === model.name);
  if (!foundObj) {
    foundObj = (models.server || []).find((m) => m.name === model.name);
  }
  if (foundObj) {
    foundObj.model = selectedSub;
    config.set('models', models);
    ok(`Подмодель установлена: ${selectedSub}`);
  } else {
    fail('Не удалось обновить модель в конфигурации');
  }
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

async function addModel() {
  const s = t();
  const providers = ['Gemini', 'OpenRouter', 'DeepSeek', 'Claude', 'Mistral', 'OpenAI', 'Custom'];
  console.log('');
  providers.forEach((provider, index) => {
    console.log('  ' + paint(C.faint, String(index + 1).padStart(2) + '. ') + paint(C.ink, provider));
  });

  const picked = (await ask('  ' + paint(C.amber, '? ') + s.provider + ': ')).trim();
  if (!picked) return note(s.cancelled);
  const byNumber = providers[Number(picked) - 1];
  const byName = providers.find((provider) => provider.toLowerCase() === picked.toLowerCase());
  const provider = byName || byNumber;
  if (!provider) return fail(`${s.nothing}: ${picked} — 1…${providers.length}`);

  const defaultModelName = SUBMODELS[provider] ? SUBMODELS[provider][0] : 'default-model';
  const modelNameInput = (await ask('  ' + paint(C.amber, '? ') + `название/модель (по умолчанию ${defaultModelName}): `)).trim();
  const modelId = modelNameInput || defaultModelName;

  let endpoint = EDU[provider];
  if (provider === 'Custom' || !endpoint) {
    const given = (await ask('  ' + paint(C.amber, '? ') + s.baseUrl + ': ')).trim();
    if (!given) return note(s.cancelled);
    endpoint = given.replace(/\/+$/, '');
  }

  const apiKey = (await askHidden('  ' + paint(C.amber, '? ') + s.apiKey + ' ' + provider + ': ')).trim();
  if (!apiKey) return note(s.cancelled);

  const models = config.get('models');
  const customName = `${provider}_${Date.now().toString().slice(-4)}`;
  models.user.push({
    name: customName,
    provider,
    endpoint,
    apiKey,
    model: modelId,
    status: 'Ready',
    limitUsed: 0,
    limitMax: 100
  });
  config.set('models', models);
  config.set('activeModel', customName);

  console.log('');
  ok(`${customName} (${modelId}) — ${s.added}`);
  note(s.keyNote);
  console.log('');
}

async function deleteModel(arg) {
  const s = t();
  const targetName = (arg || '').trim();
  if (!targetName) {
    return fail('Укажите название модели для удаления, например: /model -del <название>');
  }

  const models = config.get('models');
  const userModels = models.user || [];
  const index = userModels.findIndex((m) => m.name.toLowerCase() === targetName.toLowerCase());

  if (index === -1) {
    return fail(`Пользовательская модель "${targetName}" не найдена.`);
  }

  const removed = userModels.splice(index, 1)[0];
  config.set('models', models);

  if (config.get('activeModel') === removed.name) {
    const serverModels = models.server || [];
    if (serverModels.length > 0) {
      config.set('activeModel', serverModels[0].name);
    } else {
      config.set('activeModel', 'None');
    }
  }

  ok(`Модель "${removed.name}" успешно ${s.deleted}`);
  console.log('');
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
}

function setMode(arg) {
  const s = t();
  const requested = (arg || '').toLowerCase();
  const mode = requested === 'chat' || requested === 'agent' ? requested : config.get('mode') === 'agent' ? 'chat' : 'agent';
  config.set('mode', mode);
  ok(`${s.modeSet}: ${mode}`);
  console.log('');
}

function setLanguage(arg) {
  const s = t();
  const requested = (arg || '').toLowerCase();
  const language = requested === 'en' || requested === 'ru' ? requested : config.get('language') === 'en' ? 'ru' : 'en';
  config.set('language', language);
  ok(`${s.langSet}: ${language}`);
  console.log('');
}

async function respond(text) {
  const s = t();
  const model = activeModel();

  if (!model || !model.apiKey) {
    addMsg('user', text);
    console.log('');
    console.log('  ' + paint(C.dim, s.noKey + ' ' + (model ? model.name : '') + '. /add'));
    console.log('');
    return;
  }

  const endpoint = endpointOf(model);
  if (!endpoint) {
    addMsg('user', text);
    console.log('');
    console.log('  ' + paint(C.dim, s.unknownEndpoint + ' ' + model.name + '. /add'));
    console.log('');
    return;
  }

  addMsg('user', text);

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  
  process.stdout.write('\n');
  const spinnerTimer = setInterval(() => {
    const frame = spinnerFrames[frameIndex = (frameIndex + 1) % spinnerFrames.length];
    process.stdout.write(`\r  ${paint(C.amber, frame)} ${paint(C.dim, '🔒 lockcode is thinking (' + model.name + ' [' + (model.model || 'default') + '])...')}   `);
  }, 80);

  try {
    const messages = [{ role: 'system', content: s.system }].concat(history);
    const payload = {
      model: model.model || 'gemini-1.5-flash',
      messages,
      temperature: 0.2
    };

    const data = await postJson(endpoint + '/chat/completions', payload, model.apiKey);
    
    clearInterval(spinnerTimer);
    process.stdout.write('\r\x1b[K');

    const { text: answer, usage } = extractReply(data);
    addMsg('assistant', answer);
    
    const promptTokens = usage?.prompt_tokens || usage?.promptTokenCount || 0;
    const completionTokens = usage?.completion_tokens || usage?.candidatesTokenCount || 0;
    const totalTokens = promptTokens + completionTokens;
    const tail = totalTokens > 0 ? ` — ${totalTokens} ${s.tokens}` : '';

    console.log('  ' + paint(C.amber, '✦') + ' ' + paint(C.ink, 'Claude Code') + paint(C.dim, ' · ' + config.get('mode') + ' · ' + model.name + tail));
    wrap(answer, Math.min(termWidth() - 4, 68)).forEach((line) => console.log('  ' + paint(C.body, line)));
    console.log('');
  } catch (error) {
    clearInterval(spinnerTimer);
    process.stdout.write('\r\x1b[K');
    console.log('');
    fail(s.requestFailed + ': ' + (error && error.message ? error.message : String(error)));
    console.log('');
  }
}

async function runCommand(input) {
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg1 = parts[1] || '';
  const restArg = parts.slice(1).join(' ').trim();

  let needClear = true;

  switch (command) {
    case '/help':
    case '/?':
      showInteractiveMenu();
      needClear = false;
      break;
    case '/models':
      showModels();
      needClear = false;
      break;
    case '/submodel':
      await handleSubmodel(restArg);
      needClear = false;
      break;
    case '/add':
      await addModel();
      break;
    case '/model':
      if (arg1.toLowerCase() === '-del') {
        await deleteModel(parts[2] || '');
      } else {
        const models = [].concat(config.get('models').server || [], config.get('models').user || []);
        if (!restArg) {
          showModels();
          needClear = false;
          break;
        }
        const found = models.find((model) => model.name.toLowerCase() === restArg.toLowerCase());
        if (!found) {
          fail(`${t().nothing}: ${restArg}`);
          needClear = false;
          break;
        }
        config.set('activeModel', found.name);
        ok(`${t().model}: ${found.name}`);
      }
      break;
    case '/limits':
      showLimits();
      needClear = false;
      break;
    case '/mode':
      setMode(arg1);
      break;
    case '/folder':
      await setFolder(restArg);
      break;
    case '/lang':
      setLanguage(arg1);
      break;
    case '/clear':
      history = [];
      refreshScreen();
      needClear = false;
      break;
    case '/exit':
    case '/quit':
    case '/q':
      return true;
    default:
      fail(`${command} — неверная команда. Введите / для вызова списка.`);
      needClear = false;
      break;
  }

  if (needClear) {
    refreshScreen();
  }
  return false;
}

async function loop() {
  for (;;) {
    const raw = await ask(paint(C.amber, '❯ '));
    const input = raw.trim();
    if (!input) continue;

    if (input === '/') {
      showInteractiveMenu();
      continue;
    }

    if (input.startsWith('/')) {
      const quit = await runCommand(input);
      if (quit) break;
      continue;
    }
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

  refreshScreen();
  await loop();
  finish(0);
}

main().catch((error) => {
  console.log(paint(C.amber, '! ') + (error && error.message ? error.message : String(error)));
  process.exit(1);
});