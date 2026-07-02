// sidebar.js — chat + page Q&A + approval-gated single-page actions
'use strict';

// ─── Browser-compatible logger (mirrors WaldoTabsLogger API from logging_utils.js) ─
class WaldoTabsLogger {
  constructor(name) {
    this._prefix = `[WaldoTabs:${name}]`;
  }
  debug(msg, ...args) { console.debug(this._prefix, msg, ...args); }
  info(msg, ...args)  { console.log(this._prefix, msg, ...args); }
  warn(msg, ...args)  { console.warn(this._prefix, msg, ...args); }
  error(msg, ...args) { console.error(this._prefix, msg, ...args); }
}

const logger = new WaldoTabsLogger('sidebar');

const ACTION_HARD_CAP = 8; // max tool calls per turn

const transcript = document.getElementById('transcript');
const chatInput  = document.getElementById('chatInput');
const sendBtn    = document.getElementById('sendBtn');
const usePageCtx = document.getElementById('usePageCtx');
const pageCtxTitle = document.getElementById('pageCtxTitle');

// conversation history (user + assistant messages sent to the model)
let history = [];
let pageContext = null;  // { title, url, content } when toggled on

// ─── DOM helpers (textContent only — no innerHTML with untrusted data) ─────────

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;   // model output, page titles, URLs: always textContent
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function addThinking() {
  const el = document.createElement('div');
  el.className = 'thinking';
  el.textContent = 'Waldo is thinking…';
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function addNote(text) {
  const el = document.createElement('div');
  el.className = 'msg system-note';
  el.textContent = text;
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
}

// ─── Provider badge ───────────────────────────────────────────────────────────

async function refreshProviderChip() {
  const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
  const chip = document.getElementById('providerChip');
  const names = {
    openrouter: 'OpenRouter', ollama: 'Ollama', openai: 'OpenAI',
    anthropic: 'Anthropic', mistral: 'Mistral', google: 'Google AI', custom: 'Custom'
  };
  if (settings._provider) {
    chip.textContent = names[settings._provider] || settings._provider;
    chip.className = 'provider-chip connected';
  } else {
    chip.textContent = 'No AI';
    chip.className = 'provider-chip';
    addNote('No AI provider configured. Click ⚙️ to open Settings.');
  }
}

document.getElementById('settingsLink').addEventListener('click', (e) => {
  e.preventDefault();
  browser.tabs.create({ url: browser.runtime.getURL('options.html') });
});

// ─── Page context toggle ──────────────────────────────────────────────────────

usePageCtx.addEventListener('change', async () => {
  if (usePageCtx.checked) {
    pageCtxTitle.textContent = 'Loading…';
    const result = await browser.runtime.sendMessage({ action: 'getPageContext' });
    if (result.error) {
      pageCtxTitle.textContent = '';
      addNote(`⚠️ Could not read page: ${result.error}`);
      usePageCtx.checked = false;
      pageContext = null;
    } else {
      pageContext = result;
      pageCtxTitle.textContent = result.title || result.url || '';
      addNote(`📄 Page context loaded: "${result.title || result.url}"`);
    }
  } else {
    pageContext = null;
    pageCtxTitle.textContent = '';
    addNote('📄 Page context cleared.');
  }
});

// ─── Build messages array for the model ──────────────────────────────────────

function buildMessages(userText) {
  const systemParts = [
    'You are Waldo, a helpful browser assistant.',
    'When the user asks you to interact with the page, reply with a JSON tool call in a fenced code block like this:',
    '```json\n{"tool": "list_interactive"}\n```',
    'or',
    '```json\n{"tool": "click", "args": {"index": 2}}\n```',
    'Available tools: list_interactive | click {"index":N} | fill {"index":N,"value":"text"} | scroll {"index":N} or scroll {"direction":"down","pixels":400}',
    'Always call list_interactive first before clicking or filling.',
    'Only use tools when the user explicitly asks you to act on the page.',
    'For reading or answering questions about content, reply in plain prose — no tool calls.',
  ];

  if (pageContext?.content) {
    systemParts.push(
      `\n--- Current page context ---`,
      `Title: ${pageContext.title}`,
      `URL: ${pageContext.url}`,
      `Content:\n${pageContext.content.substring(0, 5000)}`
    );
  }

  const messages = [
    { role: 'system', content: systemParts.join('\n') },
    ...history,
    { role: 'user', content: userText }
  ];
  return messages;
}

// ─── Tool-call parser ─────────────────────────────────────────────────────────

function extractToolCall(text) {
  // Look for ```json ... ``` or bare { "tool": ... }
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : null;
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.tool === 'string') return parsed;
  } catch (err) {
    logger.warn('extractToolCall: fenced JSON block is not a valid tool call', err);
  }
  return null;
}

// ─── Approval card ────────────────────────────────────────────────────────────

function showApprovalCard(toolCall) {
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'approval-card';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = '⚡ Waldo wants to act';

    const desc = document.createElement('div');
    desc.className = 'action-desc';
    const argsStr = toolCall.args ? JSON.stringify(toolCall.args) : '';
    desc.textContent = `${toolCall.tool}${argsStr ? ': ' + argsStr : ''}`;

    const btns = document.createElement('div');
    btns.className = 'approval-btns';

    const approve = document.createElement('button');
    approve.className = 'approve-btn';
    approve.textContent = '✓ Allow';

    const deny = document.createElement('button');
    deny.className = 'deny-btn';
    deny.textContent = '✗ Skip';

    approve.addEventListener('click', () => { card.remove(); resolve(true);  });
    deny.addEventListener('click',    () => { card.remove(); resolve(false); });

    btns.append(approve, deny);
    card.append(label, desc, btns);
    transcript.appendChild(card);
    transcript.scrollTop = transcript.scrollHeight;
  });
}

// ─── Main send + agentic loop ─────────────────────────────────────────────────

async function sendMessage() {
  const userText = chatInput.value.trim();
  if (!userText) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;

  addMsg('user', userText);
  history.push({ role: 'user', content: userText });

  const thinking = addThinking();
  let actionCount = 0;

  try {
    // Agentic loop: model may request tool calls up to ACTION_HARD_CAP times
    while (actionCount <= ACTION_HARD_CAP) {
      const messages = buildMessages(actionCount === 0 ? userText : '[tool result received — continue]');
      // On first turn, messages already include user text from history; subsequent turns
      // inject the tool observations into history so the model can reason about them.

      const resp = await browser.runtime.sendMessage({
        action: 'chat',
        messages: actionCount === 0
          ? buildMessages(userText)
          : [
              { role: 'system', content: buildMessages('').find(m => m.role === 'system').content },
              ...history
            ]
      });

      thinking.remove();

      if (resp.error) {
        addMsg('error', `Error: ${resp.error}`);
        history.push({ role: 'assistant', content: `[Error: ${resp.error}]` });
        break;
      }

      const assistantText = resp.content;
      const toolCall = extractToolCall(assistantText);

      if (!toolCall || actionCount >= ACTION_HARD_CAP) {
        // Plain response — display and end loop
        const displayText = toolCall
          ? assistantText.replace(/```json[\s\S]*?```/, '').trim() || assistantText
          : assistantText;
        addMsg('assistant', displayText);
        history.push({ role: 'assistant', content: assistantText });
        if (actionCount >= ACTION_HARD_CAP) addNote('⚠️ Action limit reached for this turn.');
        break;
      }

      // Show the prose part of the response (if any) before the approval card
      const prose = assistantText.replace(/```json[\s\S]*?```/, '').trim();
      if (prose) addMsg('assistant', prose);

      // Ask user to approve the action
      const approved = await showApprovalCard(toolCall);
      if (!approved) {
        history.push({ role: 'assistant', content: assistantText });
        history.push({ role: 'user', content: '[User skipped that action. Continue without it.]' });
        addNote('Action skipped.');
        break;
      }

      // Execute
      actionCount++;
      const actionResult = await browser.runtime.sendMessage({
        action: 'pageAction',
        tool: toolCall.tool,
        args: toolCall.args || {}
      });

      const observation = actionResult.observation || (actionResult.error ? `Error: ${actionResult.error}` : 'Done.');
      addNote(`↳ ${observation}`);

      // Feed observation back into history and loop
      history.push({ role: 'assistant', content: assistantText });
      history.push({ role: 'user', content: `Tool result: ${observation}` });

      // Re-show thinking for next iteration
      const t2 = addThinking();
      thinking.remove === t2.remove ? null : t2; // keep reference
    }
  } catch (err) {
    logger.error('sendMessage: unexpected error in agentic loop', err);
    thinking.remove();
    addMsg('error', `Unexpected error: ${err.message}`);
  }

  sendBtn.disabled = false;
  chatInput.focus();
}

// ─── Input events ─────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

// ─── Live settings sync ───────────────────────────────────────────────────────
// The sidebar and Settings (options.html) are separate extension pages. Without this,
// a sidebar panel opened before a provider was configured would show a stale "No AI"
// badge forever, even after the user configures and connects a provider in Settings.
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) {
    await refreshProviderChip();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

refreshProviderChip();
