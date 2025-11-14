// ===== STATE =====
let timeline = null;
let queuePage = 1;
const QUEUE_PAGE_SIZE = 10;
let lastVariant = null;

// ===== DOM ELEMENTS =====
const setupView = document.getElementById('setupView');
const timelineView = document.getElementById('timelineView');
const setupForm = document.getElementById('setupForm');
const postForm = document.getElementById('postForm');
const postContent = document.getElementById('postContent');
const charCount = document.getElementById('charCount');
const progressText = document.getElementById('progressText');
const slotsGrid = document.getElementById('slotsGrid');

// ===== INIT =====
async function init() {
  try {
    const res = await fetch('/api/timeline');
    const data = await res.json();

    if (data.timeline) {
      timeline = data.timeline;
      showTimelineView();
    } else {
      showSetupView();
    }
  } catch (error) {
    console.error('Error al cargar:', error);
    showSetupView();
  }
}

// ===== SETUP =====
setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const totalSlots = parseInt(document.getElementById('totalSlots').value);
  const intervalHours = parseFloat(document.getElementById('intervalHours').value);
  const monthsAhead = parseInt(document.getElementById('monthsAhead').value);
  const workStart = document.getElementById('workStart').value;
  const workEnd = document.getElementById('workEnd').value;
  const timezone = document.getElementById('timezone').value;

  try {
    const res = await fetch('/api/timeline/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalSlots,
        intervalHours,
        monthsAhead,
        workStart,
        workEnd,
        timezone
      })
    });

    const data = await res.json();

    if (data.success) {
      timeline = data.timeline;

      // Mostrar mensaje si se preservaron publicaciones
      if (data.preservedCount > 0) {
        alert(`✅ ${data.message}\n\nTus publicaciones se han redistribuido automáticamente en el nuevo horario.`);
      }

      showTimelineView();
    } else {
      alert('Error al crear timeline: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al crear timeline');
  }
});

// ===== POST =====
postForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const content = postContent.value.trim();
  if (!content) return;

  try {
    const res = await fetch('/api/timeline/add-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        quality_score: (lastVariant && lastVariant.text === content) ? lastVariant.score : null,
      })
    });

    const data = await res.json();

    if (data.success) {
      timeline = data.timeline;
      postContent.value = '';
      updateCharCount();
      renderSlots();
      updateProgress();
    } else {
      alert('Error: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al agregar publicación');
  }
});

// Character counter
postContent.addEventListener('input', updateCharCount);

function updateCharCount() {
  const count = postContent.value.length;
  charCount.textContent = `${count} / 280`;
}

// ===== DELETE SLOT =====
async function deleteSlot(slotId) {
  if (!confirm('¿Eliminar esta publicación?')) return;

  try {
    const res = await fetch(`/api/timeline/slots/${slotId}`, {
      method: 'DELETE'
    });

    const data = await res.json();

    if (data.success) {
      timeline = data.timeline;
      renderSlots();
      updateProgress();
    } else {
      // Mostrar error (ej: slot publicado no se puede borrar)
      alert(data.error || 'Error al eliminar');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al eliminar');
  }
}

// ===== RENDER =====
function showSetupView() {
  setupView.classList.remove('hidden');
  timelineView.classList.add('hidden');
}

function showTimelineView() {
  setupView.classList.add('hidden');
  timelineView.classList.remove('hidden');
  renderSlots();
  updateProgress();
  updateCurrentPromptSummary(); // Actualizar resumen del prompt
}

// ===== PROMPT SUMMARY =====

async function updateCurrentPromptSummary() {
  try {
    const response = await fetch('/api/config/prompts/current');
    const data = await response.json();
    
    const promptNameEl = document.getElementById('currentPromptName');
    const promptContentEl = document.getElementById('currentPromptContent');
    const promptSummaryEl = document.getElementById('currentPromptSummary');
    
    if (!promptNameEl || !promptContentEl || !promptSummaryEl) {
      console.warn('Elementos del resumen de prompt no encontrados');
      return;
    }
    
    if (data.success && data.prompt) {
      promptNameEl.textContent = data.prompt.name;
      promptContentEl.textContent = data.prompt.content;
      promptContentEl.title = data.prompt.content; // Tooltip completo
      promptSummaryEl.style.display = 'block';
    } else {
      // No hay prompt activo, mostrar mensaje por defecto
      promptNameEl.textContent = 'Predeterminado';
      promptContentEl.textContent = 'Usando configuración estándar de Marco Voice Engine';
      promptContentEl.title = '';
      promptSummaryEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Error al obtener prompt actual:', error);
    // En caso de error, ocultar el resumen
    const promptSummaryEl = document.getElementById('currentPromptSummary');
    if (promptSummaryEl) {
      promptSummaryEl.style.display = 'none';
    }
  }
}

function renderSlots() {
  renderQueue();
}

function updateProgress() {
  if (!timeline) return;

  const filled = timeline.slots.filter(s => s.status === 'filled' || s.status === 'published').length;
  const total = timeline.slots.length;

  progressText.textContent = `${filled}/${total}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== SHUFFLE =====
async function shuffleQueue() {
  if (!timeline) return;
  const filledCount = timeline.slots.filter(s => s.status === 'filled').length;
  if (filledCount < 2) return;
  try {
    const res = await fetch('/api/timeline/shuffle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      timeline = data.timeline;
      renderSlots();
      updateProgress();
    }
  } catch (error) {}
}

// ===== RESET =====
function resetApp() {
  if (confirm('¿Actualizar tu timeline?\n\n✅ Tus publicaciones se preservarán automáticamente\n📅 Solo cambiarás horarios/cantidad de slots')) {
    timeline = null;
    showSetupView();
  }
}

// ===== TAB SWITCHING =====
let currentTab = 'timeline';

function switchTab(tab) {
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase() === tab) {
      btn.classList.add('active');
    }
  });

  // Toggle sections
  const timelineTab = document.getElementById('timelineTab');
  const publishedTab = document.getElementById('publishedTab');
  const analyticsTab = document.getElementById('analyticsTab');
  const configTab = document.getElementById('configTab');
  const writeSection = document.querySelector('.write-section');

  if (tab === 'timeline') {
    timelineTab.classList.remove('hidden');
    publishedTab.classList.add('hidden');
    analyticsTab.classList.add('hidden');
    configTab.classList.add('hidden');
    writeSection.classList.remove('hidden');
  } else if (tab === 'published') {
    timelineTab.classList.add('hidden');
    publishedTab.classList.remove('hidden');
    analyticsTab.classList.add('hidden');
    configTab.classList.add('hidden');
    writeSection.classList.add('hidden');
    loadPublished();
  } else if (tab === 'analytics') {
    timelineTab.classList.add('hidden');
    publishedTab.classList.add('hidden');
    analyticsTab.classList.remove('hidden');
    configTab.classList.add('hidden');
    writeSection.classList.add('hidden');
    loadAnalytics();
  } else if (tab === 'config') {
    timelineTab.classList.add('hidden');
    publishedTab.classList.add('hidden');
    analyticsTab.classList.add('hidden');
    configTab.classList.remove('hidden');
    writeSection.classList.add('hidden');
    loadConfiguration();
  }
}

// ===== ANALYTICS =====
async function loadAnalytics() {
  const loading = document.getElementById('analyticsLoading');
  const content = document.getElementById('analyticsContent');
  const empty = document.getElementById('analyticsEmpty');

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  empty.classList.add('hidden');

  try {
    const res = await fetch('/api/analytics');
    const data = await res.json();

    loading.classList.add('hidden');

    if (!data.success || data.analytics.totalTweets === 0) {
      empty.classList.remove('hidden');
      return;
    }

    const { analytics } = data;

    // Overview stats
    document.getElementById('statTotalTweets').textContent = analytics.overview.totalTweets;
    document.getElementById('statEngagementRate').textContent = analytics.overview.avgEngagementRate.toFixed(2) + '%';
    document.getElementById('statImpressions').textContent = formatNumber(analytics.overview.totalImpressions);
    document.getElementById('statEngagements').textContent = formatNumber(analytics.overview.totalEngagements);

    // Best tweet
    const bestTweet = analytics.bestPerformers.tweet;
    document.getElementById('bestTweetContent').textContent = bestTweet.content;
    document.getElementById('bestTweetMetrics').innerHTML = `
      <span>❤️ ${formatNumber(bestTweet.likes)}</span>
      <span>🔄 ${formatNumber(bestTweet.retweets)}</span>
      <span>👁️ ${formatNumber(bestTweet.impressions)}</span>
      <span>📊 ${bestTweet.engagementRate}%</span>
    `;

    // Worst tweet
    const worstTweet = analytics.worstPerformers.tweet;
    document.getElementById('worstTweetContent').textContent = worstTweet.content;
    document.getElementById('worstTweetMetrics').innerHTML = `
      <span>❤️ ${formatNumber(worstTweet.likes)}</span>
      <span>🔄 ${formatNumber(worstTweet.retweets)}</span>
      <span>👁️ ${formatNumber(worstTweet.impressions)}</span>
      <span>📊 ${worstTweet.engagementRate}%</span>
    `;

    // Best/Worst hours
    document.getElementById('bestHourTime').textContent = formatHour(analytics.bestPerformers.hour.hour);
    document.getElementById('bestHourStat').textContent = `${analytics.bestPerformers.hour.avgEngagementRate}% engagement`;

    document.getElementById('worstHourTime').textContent = formatHour(analytics.worstPerformers.hour.hour);
    document.getElementById('worstHourStat').textContent = `${analytics.worstPerformers.hour.avgEngagementRate}% engagement`;

    // Timeframes
    renderTimeframe('timeframeToday', 'Hoy', analytics.timeframes.today);
    renderTimeframe('timeframeWeek', 'Esta Semana', analytics.timeframes.week);
    renderTimeframe('timeframeMonth', 'Este Mes', analytics.timeframes.month);

    // Top words
    const topWordsGrid = document.getElementById('topWordsGrid');
    if (analytics.topWords && analytics.topWords.length > 0) {
      topWordsGrid.innerHTML = analytics.topWords.map(w => `
        <div class="word-tag">
          <span class="word-tag-name">${escapeHtml(w.word)}</span>
          <span class="word-tag-score">${w.avgEngagement.toFixed(1)}%</span>
        </div>
      `).join('');
    } else {
      topWordsGrid.innerHTML = '<p style="color: var(--label-secondary);">No hay suficientes datos</p>';
    }

    content.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading analytics:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
  }
}

function renderTimeframe(id, title, data) {
  const element = document.getElementById(id);

  if (!data) {
    element.innerHTML = `
      <div class="timeframe-title">${title}</div>
      <p style="color: var(--label-tertiary); font-size: 14px;">Sin datos</p>
    `;
    return;
  }

  element.innerHTML = `
    <div class="timeframe-title">${title}</div>
    <div class="timeframe-stat">
      <span class="timeframe-label">Tweets</span>
      <span>${data.count}</span>
    </div>
    <div class="timeframe-stat">
      <span class="timeframe-label">Engagement</span>
      <span>${data.avgEngagementRate.toFixed(2)}%</span>
    </div>
    <div class="timeframe-stat">
      <span class="timeframe-label">Likes</span>
      <span>${formatNumber(data.totalLikes)}</span>
    </div>
    <div class="timeframe-stat">
      <span class="timeframe-label">Retweets</span>
      <span>${formatNumber(data.totalRetweets)}</span>
    </div>
    <div class="timeframe-stat">
      <span class="timeframe-label">Impresiones</span>
      <span>${formatNumber(data.totalImpressions)}</span>
    </div>
  `;
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return hour + ' AM';
  return (hour - 12) + ' PM';
}

// ===== PUBLISHED TWEETS =====
async function loadPublished() {
  const loading = document.getElementById('publishedLoading');
  const content = document.getElementById('publishedContent');
  const empty = document.getElementById('publishedEmpty');
  const grid = document.getElementById('publishedGrid');

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  empty.classList.add('hidden');

  try {
    const res = await fetch('/api/published');
    const data = await res.json();

    loading.classList.add('hidden');

    if (!data.success || data.published.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    // Render published tweets
    grid.innerHTML = data.published.map(tweet => {
      const publishedDate = new Date(tweet.published_at);
      const metrics = tweet.metrics;

      return `
        <div class="published-card">
          <div class="published-header">
            <span class="published-date">${formatDate(publishedDate)}</span>
            <a href="${tweet.tweet_url}" target="_blank" class="tweet-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Ver en X
            </a>
          </div>
          <div class="published-content">${escapeHtml(tweet.content)}</div>
          ${metrics ? `
            <div class="published-metrics">
              <div class="metric">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span>${formatNumber(metrics.like_count)}</span>
              </div>
              <div class="metric">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 1 21 5 17 9"></polyline>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                  <polyline points="7 23 3 19 7 15"></polyline>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                <span>${formatNumber(metrics.retweet_count)}</span>
              </div>
              <div class="metric">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${formatNumber(metrics.reply_count)}</span>
              </div>
              <div class="metric">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>${formatNumber(metrics.impression_count)}</span>
              </div>
            </div>
          ` : `
            <div class="published-note">Métricas no disponibles</div>
          `}
        </div>
      `;
    }).join('');

    content.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading published tweets:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
  }
}

function formatDate(date) {
  // Validar entrada
  if (!date) return 'Fecha no disponible';
  
  // Convertir a Date si es string o número
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Verificar que sea fecha válida
  if (isNaN(dateObj.getTime())) return 'Fecha inválida';
  
  const now = new Date();
  const diffMs = now - dateObj;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  try {
    return dateObj.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    // Fallback si toLocaleDateString falla
    return dateObj.toISOString().split('T')[0];
  }
}

// ===== AI GENERATION =====

// Configure API endpoint - change this after deploying marco-voice-engine-api
const AI_API_URL = 'https://marco-voice-engine.fly.dev';

async function generateAI(mode) {
  try {
    // Obtener el prompt configurado actual desde Supabase
    const promptResponse = await fetch('/api/config/prompts/current');
    const promptData = await promptResponse.json();
    
    let requestBody = { mode };
    
    // Si hay un prompt configurado, incluirlo en la petición
    if (promptData.success && promptData.prompt && promptData.prompt.content) {
      requestBody.prompt = promptData.prompt.content;
      requestBody.promptId = promptData.prompt.id;
      requestBody.promptVariables = promptData.prompt.variables || [];
    }
    
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.detail || 'Error al generar variantes');
      return;
    }
    if (!data.variants || data.variants.length === 0) {
      alert('Sin variantes');
      return;
    }
    const best = data.variants.reduce((a, b) => (b.score > a.score ? b : a), data.variants[0]);
    document.getElementById('postContent').value = best.text;
    updateCharCount();
    lastVariant = best;
  } catch (err) {
    alert('Error al generar variantes');
  }
}

function getQueueItems() {
  if (!timeline || !timeline.slots) return [];
  const now = new Date();
  return timeline.slots
    .filter(s => s.status === 'filled' && new Date(s.scheduled_time) >= now)
    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
}

function renderQueue() {
  const list = document.getElementById('queueList');
  if (!list) return;
  const items = getQueueItems();
  const count = Math.min(items.length, queuePage * QUEUE_PAGE_SIZE);
  const display = items.slice(0, count);
  list.innerHTML = display.map(s => {
    const date = new Date(s.scheduled_time);
    const dateStr = date.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const text = s.content || '';
    const score = (typeof s.quality_score === 'number') ? s.quality_score.toFixed(2) : null;
    return `
      <div class="queue-item">
        <div>
          <div class="queue-item-time">${dateStr} • ${timeStr}</div>
          <div class="queue-item-text">${escapeHtml(text)}</div>
          ${score ? `<div class="queue-item-score">Score: ${score}</div>` : ''}
        </div>
        <div class="slot-index">#${s.slot_index + 1}</div>
      </div>
    `;
  }).join('');

  const showMore = document.getElementById('queueShowMore');
  const hideBtn = document.getElementById('queueHide');
  if (showMore) {
    showMore.disabled = count >= items.length;
  }
  if (hideBtn) {
    hideBtn.disabled = items.length === 0 || count <= QUEUE_PAGE_SIZE;
  }
}

const queueShowMoreBtn = document.getElementById('queueShowMore');
const queueHideBtn = document.getElementById('queueHide');
if (queueShowMoreBtn) {
  queueShowMoreBtn.addEventListener('click', () => {
    queuePage += 1;
    renderQueue();
    renderSlots();
  });
}
if (queueHideBtn) {
  queueHideBtn.addEventListener('click', () => {
    queuePage = 1;
    renderQueue();
    renderSlots();
  });
}

let queueRefreshTimer = null;
function startQueueRefresh() {
  if (queueRefreshTimer) clearInterval(queueRefreshTimer);
  queueRefreshTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/timeline');
      const data = await res.json();
      if (data.timeline) {
        timeline = data.timeline;
        renderSlots();
        updateProgress();
        renderQueue();
      }
    } catch (e) {}
  }, 30000);
}

function selectVariant(text) {
  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  const decodedText = textarea.value;

  // Fill the textarea with the selected variant
  document.getElementById('postContent').value = decodedText;
  updateCharCount();

  // Close modal
  closeAIModal();

  // Scroll to textarea
  document.getElementById('postContent').focus();
}

function closeAIModal() {
  const modal = document.getElementById('aiModal');
  modal.classList.add('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== CONFIGURATION MANAGEMENT =====
let currentConfig = null;
let originalConfig = null;
let hasUnsavedChanges = false;
let autoSaveTimer = null;
let currentPromptId = null;

// Configuration state
const configState = {
  prompts: {},
  llmPresets: {},
  promptHistory: [],
  promptPresets: {},
  unsavedChanges: new Set()
};

// ===== CONFIGURATION SECTION SWITCHING =====
function switchConfigSection(section, event) {
  // Update navigation buttons
  document.querySelectorAll('.config-nav-item').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Handle both onclick and addEventListener calls
  const target = event ? event.target.closest('.config-nav-item') : document.querySelector(`[onclick*="switchConfigSection('${section}')"]`);
  if (target) {
    target.classList.add('active');
  }

  // Hide all sections
  document.getElementById('configPrompts').classList.add('hidden');
  document.getElementById('configLLM').classList.add('hidden');
  document.getElementById('configAPI').classList.add('hidden');
  document.getElementById('configApp').classList.add('hidden');

  // Show selected section
  if (section === 'prompts') {
    document.getElementById('configPrompts').classList.remove('hidden');
  } else if (section === 'llm') {
    document.getElementById('configLLM').classList.remove('hidden');
  } else if (section === 'api') {
    document.getElementById('configAPI').classList.remove('hidden');
  } else if (section === 'app') {
    document.getElementById('configApp').classList.remove('hidden');
  }
}

// ===== CONFIGURATION API FUNCTIONS =====
async function loadPromptsFromSupabase() {
  try {
    const response = await fetch('/api/config/prompts');
    const data = await response.json();
    
    if (data.success) {
      configState.prompts = data.prompts || {};
      renderPromptsList();
    }
  } catch (error) {
    console.error('Error loading prompts from Supabase:', error);
    showNotification('Error al cargar prompts', 'error');
  }
}

async function loadConfiguration() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    
    if (data.success) {
      currentConfig = JSON.parse(JSON.stringify(data.config));
      originalConfig = JSON.parse(JSON.stringify(data.config));
      populateConfigUI();
      updateUnsavedChangesWarning();
    } else {
      console.error('Error loading configuration:', data.error);
      showNotification('Error al cargar configuración', 'error');
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
    showNotification('Error al cargar configuración', 'error');
  }
  
  // Cargar prompts desde Supabase
  try {
    const promptsRes = await fetch('/api/config/prompts');
    const promptsData = await promptsRes.json();
    
    if (promptsData.success) {
      configState.prompts = promptsData.prompts || {};
      renderPromptsList();
    }
  } catch (error) {
    console.error('Error loading prompts from Supabase:', error);
  }
}

function populateConfigUI() {
  if (!currentConfig) return;
  
  // Helper function to safely set element value
  function setElementValue(id, value, isCheckbox = false) {
    const element = document.getElementById(id);
    if (element) {
      if (isCheckbox) {
        element.checked = Boolean(value);
      } else {
        element.value = value;
      }
    }
  }
  
  // Populate LLM configuration
  setElementValue('llmProvider', currentConfig.llm?.provider || 'openrouter');
  setElementValue('llmModel', currentConfig.llm?.model || 'anthropic/claude-3-sonnet');
  setElementValue('llmTemperature', currentConfig.llm?.temperature || 0.7);
  setElementValue('temperatureValue', currentConfig.llm?.temperature || 0.7);
  setElementValue('llmTopP', currentConfig.llm?.top_p || 1.0);
  setElementValue('topPValue', currentConfig.llm?.top_p || 1.0);
  setElementValue('llmMaxTokens', currentConfig.llm?.max_tokens || 1000);
  setElementValue('llmApiKey', currentConfig.llm?.apiKey || '');
  setElementValue('llmEndpoint', currentConfig.llm?.endpoint || 'https://openrouter.ai/api/v1/chat/completions');
  
  // Populate API configuration
  setElementValue('twitterApiKey', currentConfig.api?.twitter?.apiKey || '');
  setElementValue('twitterApiSecret', currentConfig.api?.twitter?.apiSecret || '');
  setElementValue('twitterAccessToken', currentConfig.api?.twitter?.accessToken || '');
  setElementValue('twitterAccessSecret', currentConfig.api?.twitter?.accessSecret || '');
  // Note: twitterBearerToken element doesn't exist in HTML, so we skip it
  
  setElementValue('supabaseUrl', currentConfig.api?.supabase?.url || '');
  setElementValue('supabaseAnonKey', currentConfig.api?.supabase?.anonKey || '');
  // Note: supabaseServiceKey element doesn't exist in HTML, so we skip it
  
  // Populate Application settings
  setElementValue('autoSave', currentConfig.app?.autoSave || false, true);
  setElementValue('autoSaveInterval', currentConfig.app?.autoSaveInterval || 30);
  setElementValue('contentMaxLength', currentConfig.app?.contentMaxLength || 280);
  setElementValue('contentMinLength', currentConfig.app?.contentMinLength || 10);
  setElementValue('qualityThreshold', currentConfig.app?.qualityThreshold || 0.7);
  setElementValue('qualityThresholdValue', currentConfig.app?.qualityThreshold || 0.7);
  
  // Populate prompts
  if (currentConfig.prompts) {
    configState.prompts = { ...currentConfig.prompts };
    renderPromptsList();
  }
  
  // Populate LLM presets
  if (currentConfig.llmPresets) {
    configState.llmPresets = { ...currentConfig.llmPresets };
    renderLLMPresets();
  }
}

// ===== PROMPT MANAGEMENT =====
function renderPromptsList() {
  // Verificar si el elemento existe antes de intentar usarlo
  const promptsList = document.getElementById('promptsList');
  
  // Si el elemento no existe, no hacer nada (esto ocurre cuando la sección no está visible)
  if (!promptsList) {
    console.warn('Elemento promptsList no encontrado - función renderPromptsList ignorada');
    return;
  }
  
  // Obtener todos los prompts desde el estado
  const allPrompts = Object.entries(configState.prompts || {});
  
  if (allPrompts.length === 0) {
    promptsList.innerHTML = '<div class="empty-state">No hay prompts configurados</div>';
    return;
  }
  
  promptsList.innerHTML = allPrompts.map(([id, prompt]) => `
    <div class="prompt-item ${prompt.is_active ? 'active' : ''}" data-prompt-id="${id}">
      <div class="prompt-header">
        <h4>${escapeHtml(prompt.name || 'Sin nombre')}</h4>
        <div class="prompt-actions">
          <button onclick="activatePrompt('${id}')" class="btn-icon ${prompt.is_active ? 'active' : ''}" title="${prompt.is_active ? 'Prompt activo' : 'Activar prompt'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"></path>
            </svg>
          </button>
          <button onclick="editPrompt('${id}')" class="btn-icon" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button onclick="deletePrompt('${id}')" class="btn-icon" title="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="prompt-content">
        <p>${escapeHtml(prompt.content.substring(0, 100))}${prompt.content.length > 100 ? '...' : ''}</p>
        <div class="prompt-meta">
          <span class="prompt-status">${prompt.is_active ? '✅ Activo' : '⚪ Inactivo'}</span>
          <span class="prompt-updated">${formatDate(prompt.updated_at || prompt.created_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function loadPromptFromHistory(historyId) {
  const historyItem = configState.promptHistory.find(h => h.id === historyId);
  if (!historyItem) return;
  
  document.getElementById('promptName').value = historyItem.name;
  document.getElementById('promptContent').value = historyItem.content;
  
  // Automatically save this as the current prompt
  saveCurrentPrompt();
  
  showNotification('Prompt cargado del historial y establecido como actual', 'info');
}

function loadPromptPreset(presetId) {
  const preset = configState.promptPresets[presetId];
  if (!preset) return;
  
  document.getElementById('promptName').value = preset.name.replace(' (Preset)', '');
  document.getElementById('promptContent').value = preset.content;
  
  // Automatically save this as the current prompt
  saveCurrentPrompt();
  
  showNotification('Preset cargado y establecido como actual', 'info');
}

function deletePromptPreset(presetId) {
  if (!confirm('¿Eliminar este preset? Esta acción no se puede deshacer.')) return;
  
  delete configState.promptPresets[presetId];
  renderPromptPresets();
  showNotification('Preset eliminado', 'info');
}

function renderPromptHistory() {
  const historyList = document.getElementById('promptHistoryList');
  
  if (!configState.promptHistory || configState.promptHistory.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No hay historial de prompts</div>';
    return;
  }
  
  historyList.innerHTML = configState.promptHistory.map(item => `
    <div class="history-item" data-history-id="${item.id}">
      <div class="history-header">
        <span class="history-name">${escapeHtml(item.name)}</span>
        <span class="history-date">${new Date(item.updated_at).toLocaleDateString()}</span>
      </div>
      <div class="history-content">${escapeHtml(item.content.substring(0, 100))}${item.content.length > 100 ? '...' : ''}</div>
      <div class="history-actions">
        <button onclick="loadPromptFromHistory('${item.id}')" class="btn-text">Cargar</button>
      </div>
    </div>
  `).join('');
}

function renderPromptPresets() {
  const presetsList = document.getElementById('promptPresetsList');
  
  // Si el elemento no existe, no hacer nada (esto ocurre cuando la sección no está visible)
  if (!presetsList) {
    console.warn('Elemento promptPresetsList no encontrado - función renderPromptPresets ignorada');
    return;
  }
  
  const presets = Object.entries(configState.promptPresets || {});
  
  if (presets.length === 0) {
    presetsList.innerHTML = '<div class="empty-state">No hay presets guardados</div>';
    return;
  }
  
  presetsList.innerHTML = presets.map(([id, preset]) => `
    <div class="preset-item" data-preset-id="${id}">
      <div class="preset-header">
        <h4>${escapeHtml(preset.name)}</h4>
        <div class="preset-actions">
          <button onclick="loadPromptPreset('${id}')" class="btn-text">Cargar</button>
          <button onclick="deletePromptPreset('${id}')" class="btn-text btn-danger">Eliminar</button>
        </div>
      </div>
      <div class="preset-content">${escapeHtml(preset.content)}</div>
      <div class="preset-variables">
        ${preset.variables.map(v => `<span class="variable-tag">{${escapeHtml(v)}}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function editPrompt(promptId) {
  const prompt = configState.prompts[promptId];
  if (!prompt) return;
  
  currentPromptId = promptId;
  document.getElementById('promptName').value = prompt.name;
  document.getElementById('promptContent').value = prompt.content;
  document.getElementById('promptVariables').value = (prompt.variables || []).join(', ');
  
  // Show prompt editor
  document.getElementById('promptEditor').classList.remove('hidden');
  const promptsList = document.getElementById('promptsList');
  if (promptsList) promptsList.classList.add('hidden');
  
  // Update active prompt indicator
  document.querySelectorAll('.prompt-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-prompt-id="${promptId}"]`)?.classList.add('active');
}

function savePrompt() {
  const name = document.getElementById('promptName').value.trim();
  const content = document.getElementById('promptContent').value.trim();
  const variablesInput = document.getElementById('promptVariables').value.trim();
  
  if (!name || !content) {
    showNotification('Nombre y contenido son requeridos', 'error');
    return;
  }
  
  const variables = variablesInput ? variablesInput.split(',').map(v => v.trim()).filter(v => v) : [];
  
  const promptData = {
    name,
    content,
    variables,
    version: (configState.prompts[currentPromptId]?.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  
  if (currentPromptId) {
    // Update existing prompt
    configState.prompts[currentPromptId] = promptData;
  } else {
    // Create new prompt
    const newId = 'prompt_' + Date.now();
    configState.prompts[newId] = promptData;
  }
  
  markConfigChanged('prompts');
  renderPromptsList();
  closePromptEditor();
  showNotification('Prompt guardado exitosamente', 'success');
  
  // Auto-save if enabled
  if (currentConfig?.app?.autoSave) {
    debouncedAutoSave();
  }
}

async function deletePrompt(promptId) {
  if (!confirm('¿Eliminar este prompt? Esta acción no se puede deshacer.')) return;
  
  try {
    const response = await fetch(`/api/config/prompts/${promptId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.success) {
      delete configState.prompts[promptId];
      renderPromptsList();
      showNotification('Prompt eliminado', 'success');
      
      if (currentPromptId === promptId) {
        closePromptEditor();
      }
    } else {
      showNotification('Error al eliminar prompt: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting prompt:', error);
    showNotification('Error al eliminar prompt', 'error');
  }
}

async function activatePrompt(promptId) {
  try {
    // Get the prompt data first
    const prompt = configState.prompts[promptId];
    if (!prompt) {
      showNotification('Prompt no encontrado', 'error');
      return;
    }
    
    // Update the prompt to be active
    const updatedPrompt = {
      ...prompt,
      is_active: true
    };
    
    // Save to Supabase (this will automatically deactivate others)
    const response = await fetch('/api/config/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPrompt)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Update local state
      configState.prompts[promptId] = result.prompt;
      renderPromptsList();
      showNotification('Prompt activado exitosamente', 'success');
    } else {
      showNotification('Error al activar prompt: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error activating prompt:', error);
    showNotification('Error al activar prompt', 'error');
  }
}

function closePromptEditor() {
  document.getElementById('promptEditor').classList.add('hidden');
  const promptsList = document.getElementById('promptsList');
  if (promptsList) promptsList.classList.remove('hidden');
  currentPromptId = null;
  
  // Clear form
  document.getElementById('promptName').value = '';
  document.getElementById('promptContent').value = '';
  document.getElementById('promptVariables').value = '';
}

function createNewPrompt() {
  currentPromptId = null;
  document.getElementById('promptName').value = '';
  document.getElementById('promptContent').value = '';
  document.getElementById('promptVariables').value = '';
  
  document.getElementById('promptEditor').classList.remove('hidden');
  const promptsList = document.getElementById('promptsList');
  if (promptsList) promptsList.classList.add('hidden');
}

// ===== LLM PRESETS MANAGEMENT =====
function renderLLMPresets() {
  const presetsList = document.getElementById('llmPresetsList');
  
  // Si el elemento no existe, no hacer nada (esto ocurre cuando la sección no está visible)
  if (!presetsList) {
    console.warn('Elemento llmPresetsList no encontrado - función renderLLMPresets ignorada');
    return;
  }
  
  const presets = Object.entries(configState.llmPresets);
  
  if (presets.length === 0) {
    presetsList.innerHTML = '<div class="empty-state">No hay presets de LLM configurados</div>';
    return;
  }
  
  presetsList.innerHTML = presets.map(([id, preset]) => `
    <div class="preset-item" data-preset-id="${id}">
      <div class="preset-header">
        <h4>${escapeHtml(preset.name)}</h4>
        <div class="preset-actions">
          <button onclick="applyLLMPreset('${id}')" class="btn-text" title="Aplicar">
            Aplicar
          </button>
          <button onclick="deleteLLMPreset('${id}')" class="btn-icon" title="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="preset-params">
        <span>Temperatura: ${preset.temperature}</span>
        <span>Top P: ${preset.top_p}</span>
        <span>Max Tokens: ${preset.max_tokens}</span>
      </div>
    </div>
  `).join('');
}

function saveLLMPreset() {
  const name = prompt('Nombre para el preset:');
  if (!name || !name.trim()) return;
  
  const preset = {
    name: name.trim(),
    provider: document.getElementById('llmProvider').value,
    model: document.getElementById('llmModel').value,
    temperature: parseFloat(document.getElementById('temperature').value),
    top_p: parseFloat(document.getElementById('topP').value),
    max_tokens: parseInt(document.getElementById('maxTokens').value),
    createdAt: new Date().toISOString()
  };
  
  const presetId = 'preset_' + Date.now();
  configState.llmPresets[presetId] = preset;
  
  markConfigChanged('llmPresets');
  renderLLMPresets();
  showNotification('Preset guardado exitosamente', 'success');
}

function applyLLMPreset(presetId) {
  const preset = configState.llmPresets[presetId];
  if (!preset) return;
  
  document.getElementById('llmProvider').value = preset.provider;
  document.getElementById('llmModel').value = preset.model;
  document.getElementById('temperature').value = preset.temperature;
  document.getElementById('temperatureValue').textContent = preset.temperature;
  document.getElementById('topP').value = preset.top_p;
  document.getElementById('topPValue').textContent = preset.top_p;
  document.getElementById('maxTokens').value = preset.max_tokens;
  
  markConfigChanged('llm');
  showNotification('Preset aplicado', 'success');
}

function deleteLLMPreset(presetId) {
  if (!confirm('¿Eliminar este preset?')) return;
  
  delete configState.llmPresets[presetId];
  markConfigChanged('llmPresets');
  renderLLMPresets();
  showNotification('Preset eliminado', 'success');
}

// ===== CONFIGURATION CHANGE TRACKING =====
function markConfigChanged(section) {
  configState.unsavedChanges.add(section);
  hasUnsavedChanges = true;
  updateUnsavedChangesWarning();
  
  // Restart auto-save timer if enabled
  if (currentConfig?.app?.autoSave) {
    restartAutoSaveTimer();
  }
}

function updateUnsavedChangesWarning() {
  const warning = document.getElementById('unsavedChangesWarning');
  if (hasUnsavedChanges) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

function clearUnsavedChanges() {
  configState.unsavedChanges.clear();
  hasUnsavedChanges = false;
  updateUnsavedChangesWarning();
  
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ===== AUTO-SAVE FUNCTIONALITY =====
function restartAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  if (!currentConfig?.app?.autoSave) return;
  
  const interval = (currentConfig.app.autoSaveInterval || 30) * 1000;
  autoSaveTimer = setTimeout(() => {
    if (hasUnsavedChanges) {
      saveConfig();
    }
  }, interval);
}

function debouncedAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  autoSaveTimer = setTimeout(() => {
    if (hasUnsavedChanges && currentConfig?.app?.autoSave) {
      saveConfig();
    }
  }, 2000);
}

// ===== SAVE FUNCTIONS =====
async function saveConfig() {
  if (!hasUnsavedChanges) return;
  
  try {
    // Helper function to safely get element value
    const getElementValue = (id, defaultValue = '') => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Elemento ${id} no encontrado, usando valor por defecto: ${defaultValue}`);
        return defaultValue;
      }
      return element.type === 'checkbox' ? element.checked : element.value;
    };

    // Helper function to safely get numeric value
    const getNumericValue = (id, defaultValue = 0) => {
      const value = getElementValue(id, defaultValue);
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    };

    // Prepare configuration data with validation
    const configData = {
      llm: {
        provider: getElementValue('llmProvider'),
        model: getElementValue('llmModel'),
        temperature: getNumericValue('llmTemperature', 0.7),
        top_p: getNumericValue('llmTopP', 1.0),
        max_tokens: 1000, // Valor por defecto ya que no existe el elemento
        apiKey: getElementValue('llmApiKey'),
        endpoint: getElementValue('llmEndpoint')
      },
      api: {
        twitter: {
          apiKey: getElementValue('twitterApiKey'),
          apiSecret: getElementValue('twitterApiSecret'),
          accessToken: getElementValue('twitterAccessToken'),
          accessSecret: getElementValue('twitterAccessSecret'),
          bearerToken: '' // Elemento no existe en HTML
        },
        supabase: {
          url: getElementValue('supabaseUrl'),
          anonKey: getElementValue('supabaseAnonKey'),
          serviceKey: '' // Elemento no existe en HTML
        }
      },
      app: {
        autoSave: getElementValue('autoSave', false),
        autoSaveInterval: getNumericValue('autoSaveInterval', 30),
        contentMaxLength: getNumericValue('contentMaxLength', 280),
        contentMinLength: getNumericValue('contentMinLength', 10),
        qualityThreshold: getNumericValue('qualityThreshold', 0.7)
      },
      prompts: configState.prompts,
      llmPresets: configState.llmPresets
    };
    
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: configData })
    });
    
    const result = await res.json();
    
    if (result.success) {
      currentConfig = JSON.parse(JSON.stringify(configData));
      clearUnsavedChanges();
      showNotification('Configuración guardada exitosamente', 'success');
    } else {
      showNotification('Error al guardar configuración: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showNotification('Error al guardar configuración', 'error');
  }
}

function saveLLMConfig() {
  markConfigChanged('llm');
  showNotification('Configuración de LLM actualizada', 'info');
  
  if (currentConfig?.app?.autoSave) {
    debouncedAutoSave();
  }
}

function saveAPIConfig() {
  markConfigChanged('api');
  showNotification('Configuración de API actualizada', 'info');
  
  if (currentConfig?.app?.autoSave) {
    debouncedAutoSave();
  }
}

function saveAppConfig() {
  markConfigChanged('app');
  showNotification('Configuración de aplicación actualizada', 'info');
  
  if (currentConfig?.app?.autoSave) {
    debouncedAutoSave();
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

function insertVariable(variable) {
  const promptContent = document.getElementById('promptContent');
  if (promptContent) {
    const cursorPos = promptContent.selectionStart;
    const textBefore = promptContent.value.substring(0, cursorPos);
    const textAfter = promptContent.value.substring(cursorPos);
    promptContent.value = textBefore + `{${variable}}` + textAfter;
    promptContent.focus();
    promptContent.setSelectionRange(cursorPos + variable.length + 2, cursorPos + variable.length + 2);
    
    // Trigger input event to update detected variables
    promptContent.dispatchEvent(new Event('input'));
  }
}

async function saveCurrentPrompt() {
  const name = document.getElementById('promptName').value.trim();
  const content = document.getElementById('promptContent').value.trim();
  
  if (!name || !content) {
    showNotification('Por favor completa todos los campos', 'error');
    return;
  }
  
  // Extract variables from content
  const variables = [];
  const variableRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = variableRegex.exec(content)) !== null) {
    variables.push(match[1]);
  }
  
  const promptData = {
    id: currentPromptId || `prompt_${Date.now()}`,
    name,
    content,
    variables: [...new Set(variables)], // Remove duplicates
    is_active: true
  };
  
  try {
    // Guardar en Supabase
    const response = await fetch('/api/config/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentPromptId = result.prompt.id;
      
      // Actualizar estado local
      configState.prompts[result.prompt.id] = result.prompt;
      
      // Recargar lista de prompts
      await loadPromptsFromSupabase();
      
      closePromptEditor();
      showNotification('Prompt guardado exitosamente', 'success');
    } else {
      showNotification('Error al guardar prompt: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error saving prompt:', error);
    showNotification('Error al guardar prompt', 'error');
  }
}

function testPrompt() {
  const content = document.getElementById('promptContent').value.trim();
  if (!content) {
    showNotification('Por favor escribe un prompt primero', 'error');
    return;
  }
  
  // Create a test modal or show a preview
  showNotification('Función de prueba de prompt - Implementar según necesidades', 'info');
}

function clearPromptHistory() {
  if (!confirm('¿Limpiar todo el historial de prompts? Esta acción no se puede deshacer.')) return;
  
  configState.promptHistory = [];
  renderPromptHistory();
  showNotification('Historial limpiado', 'info');
}

function saveAsPreset() {
  const name = document.getElementById('promptName').value.trim();
  const content = document.getElementById('promptContent').value.trim();
  
  if (!name || !content) {
    showNotification('Por favor guarda el prompt primero', 'error');
    return;
  }
  
  const preset = {
    id: `preset_${Date.now()}`,
    name: `${name} (Preset)`,
    content,
    variables: [],
    created_at: new Date().toISOString()
  };
  
  // Extract variables
  const variableRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = variableRegex.exec(content)) !== null) {
    preset.variables.push(match[1]);
  }
  preset.variables = [...new Set(preset.variables)];
  
  if (!configState.promptPresets) configState.promptPresets = {};
  configState.promptPresets[preset.id] = preset;
  
  renderPromptPresets();
  showNotification('Preset guardado exitosamente', 'success');
}

function loadLLMPreset(presetType) {
  const presets = {
    creative: { temperature: 1.2, top_p: 0.9 },
    balanced: { temperature: 0.7, top_p: 1.0 },
    focused: { temperature: 0.3, top_p: 0.8 }
  };
  
  const preset = presets[presetType];
  if (preset) {
    document.getElementById('llmTemperature').value = preset.temperature;
    document.getElementById('temperatureValue').textContent = preset.temperature;
    document.getElementById('llmTopP').value = preset.top_p;
    document.getElementById('topPValue').textContent = preset.top_p;
    
    markConfigChanged('llm');
    showNotification(`Preset ${presetType} cargado`, 'info');
  }
}

function testLLMConnection() {
  showNotification('Probando conexión LLM...', 'info');
  
  // This would need to be implemented based on your LLM provider
  setTimeout(() => {
    showNotification('Conexión LLM - Implementar según proveedor', 'info');
  }, 1000);
}

function testAPIConnections() {
  showNotification('Probando conexiones de APIs...', 'info');
  
  // Test Twitter API
  const twitterApiKey = document.getElementById('twitterApiKey').value;
  if (twitterApiKey) {
    // Implement Twitter API test
    console.log('Testing Twitter API...');
  }
  
  // Test Supabase
  const supabaseUrl = document.getElementById('supabaseUrl').value;
  if (supabaseUrl) {
    // Implement Supabase test
    console.log('Testing Supabase...');
  }
  
  setTimeout(() => {
    showNotification('Pruebas de API completadas - Ver consola para detalles', 'info');
  }, 1500);
}

function discardChanges() {
  if (!confirm('¿Descartar todos los cambios no guardados? Esta acción no se puede deshacer.')) return;
  
  populateConfigUI();
  clearUnsavedChanges();
  showNotification('Cambios descartados', 'info');
}

// ===== IMPORT/EXPORT =====
async function exportConfig() {
  try {
    const res = await fetch('/api/config/export');
    const data = await res.json();
    
    if (data.success) {
      const blob = new Blob([JSON.stringify(data.config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showNotification('Configuración exportada exitosamente', 'success');
    } else {
      showNotification('Error al exportar configuración', 'error');
    }
  } catch (error) {
    console.error('Error exporting configuration:', error);
    showNotification('Error al exportar configuración', 'error');
  }
}

async function importConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const configData = JSON.parse(text);
    
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: configData })
    });
    
    const result = await res.json();
    
    if (result.success) {
      currentConfig = JSON.parse(JSON.stringify(configData));
      originalConfig = JSON.parse(JSON.stringify(configData));
      populateConfigUI();
      clearUnsavedChanges();
      showNotification('Configuración importada exitosamente', 'success');
    } else {
      showNotification('Error al importar configuración: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error importing configuration:', error);
    showNotification('Error al importar configuración: ' + error.message, 'error');
  }
  
  // Clear file input
  event.target.value = '';
}

async function resetToDefaults() {
  if (!confirm('¿Restablecer toda la configuración a valores predeterminados? Esta acción no se puede deshacer.')) return;
  
  try {
    const res = await fetch('/api/config/reset', {
      method: 'POST'
    });
    
    const result = await res.json();
    
    if (result.success) {
      currentConfig = JSON.parse(JSON.stringify(result.config));
      originalConfig = JSON.parse(JSON.stringify(result.config));
      populateConfigUI();
      clearUnsavedChanges();
      showNotification('Configuración restablecida a valores predeterminados', 'success');
    } else {
      showNotification('Error al restablecer configuración', 'error');
    }
  } catch (error) {
    console.error('Error resetting configuration:', error);
    showNotification('Error al restablecer configuración', 'error');
  }
}

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="btn-close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  
  // Add to container or body
  let container = document.getElementById('notificationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notificationContainer';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }
  
  container.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// ===== CONFIGURATION NAVIGATION =====
function showConfigSection(sectionId) {
  // Hide all sections
  document.querySelectorAll('.config-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Show selected section
  document.getElementById(sectionId).classList.add('active');
  
  // Update navigation
  document.querySelectorAll('.config-nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[onclick="showConfigSection('${sectionId}')"]`).classList.add('active');
}

// ===== EVENT LISTENERS FOR CONFIGURATION =====
function setupConfigEventListeners() {
  // LLM Configuration
  document.getElementById('temperature')?.addEventListener('input', (e) => {
    document.getElementById('temperatureValue').textContent = e.target.value;
    saveLLMConfig();
  });
  
  document.getElementById('topP')?.addEventListener('input', (e) => {
    document.getElementById('topPValue').textContent = e.target.value;
    saveLLMConfig();
  });
  
  document.getElementById('llmProvider')?.addEventListener('change', saveLLMConfig);
  document.getElementById('llmModel')?.addEventListener('change', saveLLMConfig);
  document.getElementById('maxTokens')?.addEventListener('change', saveLLMConfig);
  document.getElementById('llmApiKey')?.addEventListener('input', debouncedSaveLLM);
  document.getElementById('llmEndpoint')?.addEventListener('input', debouncedSaveLLM);
  
  // API Configuration
  const apiInputs = [
    'twitterApiKey', 'twitterApiSecret', 'twitterAccessToken', 'twitterAccessSecret', 'twitterBearerToken',
    'supabaseUrl', 'supabaseAnonKey', 'supabaseServiceKey'
  ];
  
  apiInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', debouncedSaveAPI);
    }
  });
  
  // Application Configuration
  document.getElementById('autoSave')?.addEventListener('change', saveAppConfig);
  document.getElementById('autoSaveInterval')?.addEventListener('change', saveAppConfig);
  document.getElementById('contentMaxLength')?.addEventListener('change', saveAppConfig);
  document.getElementById('contentMinLength')?.addEventListener('change', saveAppConfig);
  document.getElementById('qualityThreshold')?.addEventListener('input', (e) => {
    document.getElementById('qualityThresholdValue').textContent = e.target.value;
    saveAppConfig();
  });
  
  // Prompt editor
  document.getElementById('promptContent')?.addEventListener('input', () => {
    detectPromptVariables();
  });
}

function debouncedSaveLLM() {
  clearTimeout(window.debouncedLLMTimer);
  window.debouncedLLMTimer = setTimeout(saveLLMConfig, 1000);
}

function debouncedSaveAPI() {
  clearTimeout(window.debouncedAPITimer);
  window.debouncedAPITimer = setTimeout(saveAPIConfig, 1000);
}

function detectPromptVariables() {
  const content = document.getElementById('promptContent').value;
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = [];
  let match;
  
  while ((match = variableRegex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  
  document.getElementById('promptVariables').value = variables.join(', ');
}

// ===== CONFIGURATION TAB INTEGRATION =====
function showConfigurationView() {
  // Hide other views
  document.getElementById('setupView').classList.add('hidden');
  document.getElementById('timelineView').classList.add('hidden');
  document.getElementById('analyticsView').classList.add('hidden');
  document.getElementById('publishedView').classList.add('hidden');
  
  // Show configuration view
  document.getElementById('configView').classList.remove('hidden');
  
  // Load configuration if not already loaded
  if (!currentConfig) {
    loadConfiguration();
  }
  
  // Setup event listeners if not already setup
  if (!window.configListenersSetup) {
    setupConfigEventListeners();
    window.configListenersSetup = true;
  }
}

// ===== INIT =====
init();
startQueueRefresh();
