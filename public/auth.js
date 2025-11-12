// ===== SUPABASE CLIENT =====
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://lzzmfproweybcafbecnm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6em1mcHJvd2V5YmNhZmJlY25tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTc0OTMsImV4cCI6MjA3ODUzMzQ5M30.E9f9Iqebch1rEZGkkWaiBgAg0JLj81WkJDHpd5q7n8M';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ELEMENTOS DEL DOM =====
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authError = document.getElementById('authError');
const authTabs = document.querySelectorAll('.auth-tab');
const toast = document.getElementById('toast');

// ===== VERIFICAR SI YA ESTÁ LOGUEADO =====
checkAuth();

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        // Usuario ya está logueado, redirigir a app
        window.location.href = '/';
    }
}

// ===== TABS =====
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Update active tab
        authTabs.forEach(t => {
            if (t.dataset.tab === targetTab) {
                t.style.background = 'var(--surface)';
                t.style.color = 'var(--text)';
                t.classList.add('active');
            } else {
                t.style.background = 'transparent';
                t.style.color = 'var(--text-muted)';
                t.classList.remove('active');
            }
        });

        // Show/hide forms
        if (targetTab === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        }

        // Clear error
        authError.classList.add('hidden');
    });
});

// ===== LOGIN =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    // Clear error
    authError.classList.add('hidden');

    // Disable button
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Success - guardar session y redirigir
        showToast('¡Bienvenido de vuelta!', 'success');

        setTimeout(() => {
            window.location.href = '/';
        }, 500);
    } catch (error) {
        console.error('Error en login:', error);
        showError(error.message || 'Error al iniciar sesión');
        btn.disabled = false;
        btn.textContent = 'Iniciar sesión';
    }
});

// ===== REGISTRO =====
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    // Clear error
    authError.classList.add('hidden');

    // Validar que las contraseñas coincidan
    if (password !== passwordConfirm) {
        showError('Las contraseñas no coinciden');
        return;
    }

    // Validar longitud mínima
    if (password.length < 6) {
        showError('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    // Disable button
    const btn = registerForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin
            }
        });

        if (error) throw error;

        // Success
        showToast('¡Cuenta creada! Redirigiendo...', 'success');

        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    } catch (error) {
        console.error('Error en registro:', error);
        showError(error.message || 'Error al crear cuenta');
        btn.disabled = false;
        btn.textContent = 'Crear cuenta';
    }
});

// ===== HELPERS =====
function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
