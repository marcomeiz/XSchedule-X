// ===== ESTADO GLOBAL =====
let appState = {
    timeline: null, // { totalSlots, workStart, workEnd, timezone, startDate, slots: [] }
    timelineId: null // ID único del timeline actual
};

// ===== ELEMENTOS DEL DOM =====
const elements = {
    // Setup
    setupSection: document.getElementById('setupSection'),
    setupHeader: document.querySelector('.setup-header'),
    setupContent: document.getElementById('setupContent'),
    setupForm: document.getElementById('setupForm'),
    setupArrow: document.getElementById('setupArrow'),

    // Progress
    progressSection: document.getElementById('progressSection'),
    usedSlots: document.getElementById('usedSlots'),
    totalSlotsDisplay: document.getElementById('totalSlotsDisplay'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressFill: document.getElementById('progressFill'),

    // Input
    inputSection: document.getElementById('inputSection'),
    postForm: document.getElementById('postForm'),
    postContent: document.getElementById('postContent'),
    charCount: document.getElementById('charCount'),
    nextSlotIndicator: document.getElementById('nextSlotIndicator'),

    // Timeline
    timelineSection: document.getElementById('timelineSection'),
    timeline: document.getElementById('timeline'),

    // Other
    emptyState: document.getElementById('emptyState'),
    userInfo: document.getElementById('userInfo'),
    toast: document.getElementById('toast'),
    confetti: document.getElementById('confetti')
};

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    verifyTwitterConnection();
    loadExistingTimeline();

    // Event Listeners
    elements.setupForm.addEventListener('submit', handleSetupSubmit);
    elements.postForm.addEventListener('submit', handlePostSubmit);
    elements.postContent.addEventListener('input', updateCharCount);
});

// ===== VERIFICAR CONEXIÓN TWITTER =====
async function verifyTwitterConnection() {
    try {
        const response = await fetch('/api/verify');
        const data = await response.json();

        if (data.success) {
            elements.userInfo.innerHTML = `
                <span style="color: var(--success)">✓</span>
                <span>@${data.user.username}</span>
            `;
        } else {
            elements.userInfo.innerHTML = `
                <span style="color: var(--error)">✗</span>
                <span>Sin conexión</span>
            `;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// ===== TOGGLE SETUP =====
function toggleSetup() {
    elements.setupHeader.classList.toggle('collapsed');
    elements.setupContent.classList.toggle('collapsed');
}

// ===== CARGAR TIMELINE EXISTENTE =====
async function loadExistingTimeline() {
    try {
        const response = await fetch('/api/timeline/current');
        const data = await response.json();

        if (data.timeline) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id;
            renderTimeline();
            showWorkArea();
            toggleSetup(); // Colapsar setup
        }
    } catch (error) {
        console.log('No hay timeline existente');
    }
}

// ===== HANDLE SETUP SUBMIT =====
async function handleSetupSubmit(e) {
    e.preventDefault();

    const totalSlots = parseInt(document.getElementById('totalSlots').value);
    const timezone = document.getElementById('timezone').value;
    const workStart = document.getElementById('workStart').value;
    const workEnd = document.getElementById('workEnd').value;
    const startDate = document.getElementById('startDate').value || new Date().toISOString().split('T')[0];

    try {
        // Crear timeline en el backend
        const response = await fetch('/api/timeline/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                totalSlots,
                workStart,
                workEnd,
                timezone,
                startDate
            })
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id;
            renderTimeline();
            showWorkArea();
            toggleSetup();
            showToast('✨ Timeline creado con éxito', 'success');
        } else {
            showToast(data.error || 'Error al crear timeline', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
}

// ===== MOSTRAR ÁREA DE TRABAJO =====
function showWorkArea() {
    elements.emptyState.classList.add('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.inputSection.classList.remove('hidden');
    elements.timelineSection.classList.remove('hidden');

    updateProgress();
}

// ===== RENDERIZAR TIMELINE =====
function renderTimeline() {
    if (!appState.timeline) return;

    const { slots } = appState.timeline;
    elements.timeline.innerHTML = '';

    // Encontrar próximo slot disponible
    const nextEmptyIndex = slots.findIndex(slot => slot.status === 'empty');

    slots.forEach((slot, index) => {
        const isNextAvailable = index === nextEmptyIndex;
        const itemClass = `timeline-item ${slot.status} ${isNextAvailable ? 'next-available' : ''}`;

        const date = new Date(slot.scheduledTime);
        const timeStr = date.toLocaleString('es-ES', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: appState.timeline.timezone
        });

        const item = document.createElement('div');
        item.className = itemClass;
        item.innerHTML = `
            <div class="timeline-slot">
                <div class="slot-number">#${index + 1}</div>
                <div class="slot-time">${timeStr}</div>
            </div>
            <div class="timeline-content">
                ${slot.status === 'empty' ?
                    `<div class="timeline-text" style="color: var(--text-secondary); font-style: italic;">Slot disponible</div>` :
                    `<div class="timeline-text">${escapeHtml(slot.content)}</div>`
                }
                <div class="timeline-status">
                    <span class="status-badge ${slot.status}">
                        ${slot.status === 'empty' ? '⏳ Vacío' :
                          slot.status === 'filled' ? '📝 Programado' :
                          slot.status === 'published' ? '✅ Publicado' :
                          '❌ Error'}
                    </span>
                    ${slot.status === 'filled' ? `
                        <button class="btn-delete-slot" onclick="deleteSlot(${index})">Eliminar</button>
                    ` : ''}
                </div>
            </div>
        `;
        elements.timeline.appendChild(item);
    });

    updateProgress();
    updateNextSlotIndicator();
}

// ===== ACTUALIZAR PROGRESO =====
function updateProgress() {
    if (!appState.timeline) return;

    const { slots, totalSlots } = appState.timeline;
    const usedCount = slots.filter(s => s.status !== 'empty').length;
    const percentage = Math.round((usedCount / totalSlots) * 100);

    elements.usedSlots.textContent = usedCount;
    elements.totalSlotsDisplay.textContent = totalSlots;
    elements.progressPercentage.textContent = `${percentage}%`;
    elements.progressFill.style.width = `${percentage}%`;

    // Confetti si se completó todo
    if (usedCount === totalSlots && usedCount > 0) {
        launchConfetti();
    }
}

// ===== ACTUALIZAR INDICADOR DE PRÓXIMO SLOT =====
function updateNextSlotIndicator() {
    if (!appState.timeline) return;

    const nextSlot = appState.timeline.slots.find(s => s.status === 'empty');

    if (nextSlot) {
        const date = new Date(nextSlot.scheduledTime);
        const timeStr = date.toLocaleString('es-ES', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: appState.timeline.timezone
        });
        elements.nextSlotIndicator.textContent = `Próximo: ${timeStr}`;
    } else {
        elements.nextSlotIndicator.textContent = '🎉 ¡Timeline completo!';
        elements.postForm.querySelector('button[type="submit"]').disabled = true;
        elements.postContent.disabled = true;
    }
}

// ===== HANDLE POST SUBMIT =====
async function handlePostSubmit(e) {
    e.preventDefault();

    const content = elements.postContent.value.trim();

    if (!content) {
        showToast('Escribe algo para publicar', 'warning');
        return;
    }

    if (!appState.timelineId) {
        showToast('Primero configura tu timeline', 'error');
        return;
    }

    try {
        console.log('📤 Enviando post - Timeline ID:', appState.timelineId);
        const response = await fetch('/api/timeline/add-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timelineId: appState.timelineId,
                content
            })
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id; // Asegurar sincronización del ID
            renderTimeline();
            elements.postContent.value = '';
            updateCharCount();
            showToast('✅ Publicación agregada al timeline', 'success');
        } else {
            showToast(data.error || 'Error al agregar publicación', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
}

// ===== ELIMINAR SLOT =====
async function deleteSlot(slotIndex) {
    if (!confirm('¿Eliminar esta publicación del slot?')) return;

    try {
        const response = await fetch('/api/timeline/remove-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timelineId: appState.timelineId,
                slotIndex
            })
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id; // Asegurar sincronización del ID
            renderTimeline();
            showToast('Publicación eliminada', 'success');
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
}

// ===== RESET TIMELINE =====
async function resetTimeline() {
    if (!confirm('¿Reiniciar el timeline? Esto eliminará todas las publicaciones programadas.')) return;

    try {
        const response = await fetch('/api/timeline/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timelineId: appState.timelineId
            })
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = null;
            appState.timelineId = null;

            elements.progressSection.classList.add('hidden');
            elements.inputSection.classList.add('hidden');
            elements.timelineSection.classList.add('hidden');
            elements.emptyState.classList.remove('hidden');

            // Expandir setup
            elements.setupHeader.classList.remove('collapsed');
            elements.setupContent.classList.remove('collapsed');

            showToast('Timeline reiniciado', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al reiniciar timeline', 'error');
    }
}

// ===== ACTUALIZAR CONTADOR DE CARACTERES =====
function updateCharCount() {
    const length = elements.postContent.value.length;
    elements.charCount.textContent = length;
    elements.charCount.style.color = length > 260 ? 'var(--error)' : length > 240 ? 'var(--warning)' : 'var(--primary)';
}

// ===== CONFETTI =====
function launchConfetti() {
    const canvas = elements.confetti;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiPieces = [];
    const colors = ['#1da1f2', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }

    let animationId;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        confettiPieces.forEach((piece, index) => {
            ctx.save();
            ctx.translate(piece.x, piece.y);
            ctx.rotate(piece.rotation * Math.PI / 180);
            ctx.fillStyle = piece.color;
            ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size);
            ctx.restore();

            piece.y += piece.speedY;
            piece.x += piece.speedX;
            piece.rotation += piece.rotationSpeed;

            if (piece.y > canvas.height) {
                confettiPieces.splice(index, 1);
            }
        });

        if (confettiPieces.length > 0) {
            animationId = requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    animate();

    setTimeout(() => {
        if (animationId) cancelAnimationFrame(animationId);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 5000);
}

// ===== TOAST =====
function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// ===== UTILS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Hacer funciones disponibles globalmente
window.toggleSetup = toggleSetup;
window.deleteSlot = deleteSlot;
window.resetTimeline = resetTimeline;
