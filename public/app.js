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
        workStart,
        workEnd,
        timezone
      })
    });

    const data = await res.json();

    if (data.success) {
      timeline = data.timeline;
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

// ===== RESET =====
function resetApp() {
  if (confirm('¿Crear una nueva timeline? Se borrará la actual.')) {
    timeline = null;
    showSetupView();
  }
}

// ===== INIT =====
init();
