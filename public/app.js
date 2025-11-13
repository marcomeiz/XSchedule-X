// ===== STATE =====
let timeline = null;

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
      body: JSON.stringify({ content })
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
}

function renderSlots() {
  if (!timeline || !timeline.slots) return;

  slotsGrid.innerHTML = timeline.slots.map(slot => {
    const date = new Date(slot.scheduled_time);
    const dateStr = date.toLocaleDateString('es-MX', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const isEmpty = slot.status === 'empty';
    const isFilled = slot.status === 'filled';
    const isPublished = slot.status === 'published';
    const isFailed = slot.status === 'failed';

    return `
      <div class="slot-card ${slot.status}">
        <div class="slot-header">
          <div class="slot-time">${dateStr} • ${timeStr}</div>
          <div class="slot-index">#${slot.slot_index + 1}</div>
        </div>

        ${isEmpty ? `
          <div class="slot-empty-text">Vacío</div>
        ` : `
          <div class="slot-content">${escapeHtml(slot.content)}</div>
        `}

        ${isPublished ? `
          <div class="slot-status published">Publicado</div>
        ` : ''}

        ${isFailed ? `
          <div class="slot-status failed">
            <strong>❌ Error al publicar:</strong><br>
            ${escapeHtml(slot.error_message || 'Error desconocido')}
          </div>
        ` : ''}

        ${(isFilled || isFailed) ? `
          <div class="slot-actions">
            <button class="btn-delete" onclick="deleteSlot('${slot.id}')">
              ${isFailed ? 'Limpiar' : 'Eliminar'}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
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

  if (filledCount < 2) {
    alert('Necesitas al menos 2 publicaciones para mezclar');
    return;
  }

  if (!confirm(`¿Mezclar aleatoriamente las ${filledCount} publicaciones?`)) {
    return;
  }

  try {
    const res = await fetch('/api/timeline/shuffle', {
      method: 'POST'
    });

    const data = await res.json();

    if (data.success) {
      timeline = data.timeline;
      renderSlots();
      updateProgress();
    } else {
      alert('Error: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al mezclar');
  }
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
  const writeSection = document.querySelector('.write-section');

  if (tab === 'timeline') {
    timelineTab.classList.remove('hidden');
    publishedTab.classList.add('hidden');
    analyticsTab.classList.add('hidden');
    writeSection.classList.remove('hidden');
  } else if (tab === 'published') {
    timelineTab.classList.add('hidden');
    publishedTab.classList.remove('hidden');
    analyticsTab.classList.add('hidden');
    writeSection.classList.add('hidden');
    loadPublished();
  } else if (tab === 'analytics') {
    timelineTab.classList.add('hidden');
    publishedTab.classList.add('hidden');
    analyticsTab.classList.remove('hidden');
    writeSection.classList.add('hidden');
    loadAnalytics();
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
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ===== INIT =====
init();
