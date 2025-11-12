// ===== SUPABASE CLIENT =====
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://lzzmfproweybcafbecnm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6em1mcHJvd2V5YmNhZmJlY25tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTc0OTMsImV4cCI6MjA3ODUzMzQ5M30.E9f9Iqebch1rEZGkkWaiBgAg0JLj81WkJDHpd5q7n8M';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ESTADO GLOBAL =====
let appState = {
    user: null,
    session: null,
    timeline: null,
    timelineId: null
};

// ===== ELEMENTOS DEL DOM =====
const elements = {
    setupSection: document.getElementById('setupSection'),
    setupHeader: document.querySelector('.setup-header'),
    setupContent: document.getElementById('setupContent'),
    setupForm: document.getElementById('setupForm'),

    progressSection: document.getElementById('progressSection'),
    usedSlots: document.getElementById('usedSlots'),
    totalSlotsDisplay: document.getElementById('totalSlotsDisplay'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressFill: document.getElementById('progressFill'),

    inputSection: document.getElementById('inputSection'),
    postForm: document.getElementById('postForm'),
    postContent: document.getElementById('postContent'),
    charCount: document.getElementById('charCount'),
    nextSlotIndicator: document.getElementById('nextSlotIndicator'),

    timelineSection: document.getElementById('timelineSection'),
    timeline: document.getElementById('timeline'),

    emptyState: document.getElementById('emptyState'),
    userInfo: document.getElementById('userInfo'),
    toast: document.getElementById('toast'),
    confetti: document.getElementById('confetti')
};

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
});

// ===== VERIFICAR AUTENTICACIÓN =====
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        // No hay sesión, redirigir a login
        window.location.href = '/auth.html';
        return;
    }

    appState.user = session.user;
    appState.session = session;

    // Mostrar info de usuario
    updateUserInfo();

    // Cargar timeline (si existe)
    await loadCurrentTimeline();

    // Event Listeners
    elements.setupForm.addEventListener('submit', handleSetupSubmit);
    elements.postForm.addEventListener('submit', handlePostSubmit);
    elements.postContent.addEventListener('input', updateCharCount);
}

// ===== ACTUALIZAR INFO DE USUARIO =====
function updateUserInfo() {
    if (!appState.user) return;

    elements.userInfo.innerHTML = `
        <span style="color: var(--success)">●</span>
        <span>${appState.user.email}</span>
        <button
            onclick="logout()"
            class="btn-ghost"
            style="margin-left: 8px; padding: 6px 12px; font-size: var(--font-small);"
        >
            Salir
        </button>
    `;
}

// ===== LOGOUT =====
window.logout = async function() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${appState.session.access_token}`
            }
        });

        await supabase.auth.signOut();
        window.location.href = '/auth.html';
    } catch (error) {
        console.error('Error en logout:', error);
        showToast('Error al cerrar sesión', 'error');
    }
};

// ===== TOGGLE SETUP =====
window.toggleSetup = function() {
    elements.setupHeader.classList.toggle('collapsed');
    elements.setupContent.classList.toggle('collapsed');
};

// ===== CARGAR TIMELINE ACTUAL =====
async function loadCurrentTimeline() {
    try {
        const response = await fetch('/api/timelines', {
            headers: {
                'Authorization': `Bearer ${appState.session.access_token}`
            }
        });

        const data = await response.json();

        if (data.timelines && data.timelines.length > 0) {
            // Tomar el timeline más reciente
            appState.timeline = data.timelines[0];
            appState.timelineId = appState.timeline.id;
            renderTimeline();
            showWorkArea();
            toggleSetup();
        }
    } catch (error) {
        console.log('No hay timeline existente o error:', error);
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
        const response = await fetch('/api/timelines/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${appState.session.access_token}`
            },
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

        const date = new Date(slot.scheduled_time);
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
                <div class="slot-number">#${slot.slot_index + 1}</div>
                <div class="slot-time">${timeStr}</div>
            </div>
            <div class="timeline-content">
                ${slot.status === 'empty' ?
                    `<div class="timeline-text" style="color: var(--text-muted); font-style: italic;">Slot disponible</div>` :
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
                        <button class="btn-delete-slot" onclick="deleteSlot('${slot.id}')">Eliminar</button>
                    ` : ''}
                </div>
                ${slot.error_message ? `<div style="color: var(--danger); font-size: 12px; margin-top: 8px;">Error: ${escapeHtml(slot.error_message)}</div>` : ''}
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

    const { slots, total_slots } = appState.timeline;
    const usedCount = slots.filter(s => s.status !== 'empty').length;
    const percentage = Math.round((usedCount / total_slots) * 100);

    elements.usedSlots.textContent = usedCount;
    elements.totalSlotsDisplay.textContent = total_slots;
    elements.progressPercentage.textContent = `${percentage}%`;
    elements.progressFill.style.width = `${percentage}%`;

    // Confetti si se completó todo
    if (usedCount === total_slots && usedCount > 0) {
        launchConfetti();
    }
}

// ===== ACTUALIZAR INDICADOR DE PRÓXIMO SLOT =====
function updateNextSlotIndicator() {
    if (!appState.timeline) return;

    const nextSlot = appState.timeline.slots.find(s => s.status === 'empty');

    if (nextSlot) {
        const date = new Date(nextSlot.scheduled_time);
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
        const response = await fetch(`/api/timelines/${appState.timelineId}/add-post`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${appState.session.access_token}`
            },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id;
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
window.deleteSlot = async function(slotId) {
    if (!confirm('¿Eliminar esta publicación del slot?')) return;

    try {
        const response = await fetch(`/api/timelines/${appState.timelineId}/slots/${slotId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${appState.session.access_token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = data.timeline;
            appState.timelineId = data.timeline.id;
            renderTimeline();
            showToast('Publicación eliminada', 'success');
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
};

// ===== RESET TIMELINE =====
window.resetTimeline = async function() {
    if (!confirm('¿Reiniciar el timeline? Esto eliminará todas las publicaciones programadas.')) return;

    try {
        const response = await fetch(`/api/timelines/${appState.timelineId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${appState.session.access_token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            appState.timeline = null;
            appState.timelineId = null;

            elements.progressSection.classList.add('hidden');
            elements.inputSection.classList.add('hidden');
            elements.timelineSection.classList.add('hidden');
            elements.emptyState.classList.remove('hidden');

            elements.setupHeader.classList.remove('collapsed');
            elements.setupContent.classList.remove('collapsed');

            showToast('Timeline reiniciado', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al reiniciar timeline', 'error');
    }
};

// ===== ACTUALIZAR CONTADOR DE CARACTERES =====
function updateCharCount() {
    const length = elements.postContent.value.length;
    elements.charCount.textContent = length;
}

// ===== CONFETTI =====
function launchConfetti() {
    const canvas = elements.confetti;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiPieces = [];
    const colors = ['#F3D33B', '#2FA69A', '#1FBF62', '#6E3B6E', '#E86F2A'];

    for (let i = 0; i < 100; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 6 + 3,
            speedY: Math.random() * 2 + 1,
            speedX: Math.random() * 2 - 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 8 - 4
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
    }, 4000);
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
