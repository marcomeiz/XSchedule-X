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
          <div class="slot-status failed">Error</div>
        ` : ''}

        ${isFilled ? `
          <div class="slot-actions">
            <button class="btn-delete" onclick="deleteSlot('${slot.id}')">
              Eliminar
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
  const analyticsTab = document.getElementById('analyticsTab');
  const writeSection = document.querySelector('.write-section');

  if (tab === 'timeline') {
    timelineTab.classList.remove('hidden');
    analyticsTab.classList.add('hidden');
    writeSection.classList.remove('hidden');
  } else {
    timelineTab.classList.add('hidden');
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

// ===== INIT =====
init();
