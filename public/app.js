// Elementos del DOM
const form = document.getElementById('scheduleForm');
const postCountInput = document.getElementById('postCount');
const intervalInput = document.getElementById('interval');
const timezoneSelect = document.getElementById('timezone');
const startTimeInput = document.getElementById('startTime');
const postsContainer = document.getElementById('postsContainer');
const scheduledPostsContainer = document.getElementById('scheduledPosts');
const userInfoDiv = document.getElementById('userInfo');
const toast = document.getElementById('toast');

// Estado
let postInputs = [];

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    initializePostInputs();
    loadScheduledPosts();
    verifyTwitterConnection();

    // Actualizar publicaciones cada 10 segundos
    setInterval(loadScheduledPosts, 10000);
});

// Verificar conexión con Twitter
async function verifyTwitterConnection() {
    try {
        const response = await fetch('/api/verify');
        const data = await response.json();

        if (data.success) {
            userInfoDiv.innerHTML = `
                <span style="color: var(--success)">✓</span>
                <span>Conectado como @${data.user.username}</span>
            `;
        } else {
            userInfoDiv.innerHTML = `
                <span style="color: var(--error)">✗</span>
                <span>Error de conexión</span>
            `;
            showToast('Error al conectar con Twitter. Verifica tus credenciales.', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        userInfoDiv.innerHTML = `
            <span style="color: var(--error)">✗</span>
            <span>Error de conexión</span>
        `;
    }
}

// Crear campos de entrada para publicaciones
function initializePostInputs() {
    const count = parseInt(postCountInput.value);
    postsContainer.innerHTML = '';
    postInputs = [];

    for (let i = 0; i < count; i++) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post-input';

        const textarea = document.createElement('textarea');
        textarea.placeholder = `Publicación ${i + 1} (máx. 280 caracteres)`;
        textarea.maxLength = 280;
        textarea.required = true;
        textarea.addEventListener('input', (e) => updateCharCount(e.target, charCount));

        const charCount = document.createElement('div');
        charCount.className = 'char-count';
        charCount.textContent = '0/280';

        postDiv.appendChild(textarea);
        postDiv.appendChild(charCount);
        postsContainer.appendChild(postDiv);

        postInputs.push(textarea);
    }
}

// Actualizar contador de caracteres
function updateCharCount(textarea, charCountDiv) {
    const length = textarea.value.length;
    charCountDiv.textContent = `${length}/280`;

    if (length > 260) {
        charCountDiv.className = 'char-count error';
    } else if (length > 240) {
        charCountDiv.className = 'char-count warning';
    } else {
        charCountDiv.className = 'char-count';
    }
}

// Event listeners
postCountInput.addEventListener('change', initializePostInputs);

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const posts = postInputs.map(input => input.value.trim()).filter(Boolean);
    const interval = parseInt(intervalInput.value);
    const timezone = timezoneSelect.value;
    const startTime = startTimeInput.value || new Date().toISOString();

    if (posts.length === 0) {
        showToast('Por favor, escribe al menos una publicación', 'error');
        return;
    }

    try {
        const response = await fetch('/api/schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                posts,
                interval,
                timezone,
                startTime
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            form.reset();
            initializePostInputs();
            loadScheduledPosts();
        } else {
            showToast(data.error || 'Error al programar publicaciones', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
});

// Cargar publicaciones programadas
async function loadScheduledPosts() {
    try {
        const response = await fetch('/api/scheduled');
        const posts = await response.json();

        if (posts.length === 0) {
            scheduledPostsContainer.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <p>No hay publicaciones programadas</p>
                </div>
            `;
            return;
        }

        // Ordenar por fecha programada
        posts.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

        scheduledPostsContainer.innerHTML = posts.map(post => {
            const scheduledDate = new Date(post.scheduledTime);
            const now = new Date();
            const isPast = scheduledDate < now;
            const timeStr = scheduledDate.toLocaleString('es-ES', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: post.timezone
            });

            return `
                <div class="scheduled-post">
                    <div class="post-header">
                        <div class="post-time">
                            ${isPast ? '🕐' : '⏰'} ${timeStr} (${post.timezone})
                        </div>
                        <div class="post-status ${post.status}">${post.status}</div>
                    </div>
                    <div class="post-content">${escapeHtml(post.content)}</div>
                    ${post.status === 'pending' ? `
                        <div class="post-actions">
                            <button class="btn-delete" onclick="deletePost(${post.id})">
                                Eliminar
                            </button>
                        </div>
                    ` : ''}
                    ${post.error ? `<div style="color: var(--error); font-size: 12px; margin-top: 8px;">Error: ${escapeHtml(post.error)}</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error:', error);
        scheduledPostsContainer.innerHTML = `
            <div class="empty-state">
                <p style="color: var(--error)">Error al cargar publicaciones</p>
            </div>
        `;
    }
}

// Eliminar publicación
async function deletePost(postId) {
    if (!confirm('¿Estás seguro de eliminar esta publicación?')) {
        return;
    }

    try {
        const response = await fetch(`/api/scheduled/${postId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Publicación eliminada', 'success');
            loadScheduledPosts();
        } else {
            showToast('Error al eliminar publicación', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al conectar con el servidor', 'error');
    }
}

// Mostrar toast
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Utilidad para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Hacer deletePost disponible globalmente
window.deletePost = deletePost;
