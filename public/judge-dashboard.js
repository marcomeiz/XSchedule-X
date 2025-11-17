/**
 * Judge Dashboard - Main JavaScript Controller
 * Cambio: El dashboard ahora usa la API del servidor para evaluar con LLM (OpenRouter)
 * Propósito: Eliminar evaluación local duplicada y centralizar en servidor
 * Fecha: 2025-11-17
 * Autor: marcomeipersonal
 * Justificación: Consolidar lógica del JUDGE y evitar discrepancias cliente/servidor
 */

class JudgeDashboard {
    constructor() {
        this.currentTab = 'evaluation';
        this.evaluationResults = [];
        this.restrictions = [];
        this.currentRestriction = null;
        this.charts = {};
        this.monitoringInterval = null;
        this.history = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.initializeCharts();
        await this.loadInitialData();
        this.startMonitoring();
        
        // Initialize tab switching
        this.switchTab('evaluation');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Content evaluation
        const contentTextarea = document.getElementById('contentToEvaluate');
        if (contentTextarea) {
            contentTextarea.addEventListener('input', (e) => {
                this.updateCharCount(e.target.value.length);
            });
        }

        // Real-time evaluation (debounced)
        let evaluationTimeout;
        if (contentTextarea) {
            contentTextarea.addEventListener('input', (e) => {
                clearTimeout(evaluationTimeout);
                evaluationTimeout = setTimeout(() => {
                    if (e.target.value.trim().length > 10) {
                        this.performRealTimeEvaluation(e.target.value);
                    }
                }, 1000);
            });
        }

        // History search
        const historySearch = document.getElementById('historySearch');
        if (historySearch) {
            historySearch.addEventListener('input', (e) => {
                this.searchHistory(e.target.value);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'Enter':
                        if (this.currentTab === 'evaluation') {
                            this.evaluateContent();
                        }
                        break;
                    case 'r':
                        if (this.currentTab === 'monitoring') {
                            this.refreshMonitoring();
                        }
                        break;
                }
            }
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            this.resizeCharts();
        });
    }

    switchTab(tab) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}Tab`).classList.add('active');

        this.currentTab = tab;

        // Load tab-specific data
        switch (tab) {
            case 'evaluation':
                this.loadEvaluationData();
                break;
            case 'restrictions':
                this.loadRestrictions();
                break;
            case 'monitoring':
                this.loadMonitoringData();
                break;
            case 'history':
                this.loadHistory();
                break;
        }
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadRestrictions(),
                this.loadMonitoringData(),
                this.loadHistory()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Error al cargar datos iniciales', 'error');
        }
    }

    // Content Evaluation Methods
    async evaluateContent() {
        const content = document.getElementById('contentToEvaluate').value.trim();
        if (!content) {
            this.showNotification('Por favor ingresa contenido para evaluar', 'warning');
            return;
        }

        const isReplyMode = document.getElementById('enableReplyMode').checked;
        const context = document.getElementById('evaluationContext').value.trim();

        this.showLoading('Evaluando contenido...');

        try {
            const currentRestriction = await judgeRestrictionsService.getCurrentRestriction();

            const result = await this.performEvaluation(content, {
                isReply: isReplyMode,
                context: context,
                restrictionId: currentRestriction?.id || null
            });

            this.displayEvaluationResult(result);

            this.showNotification('Evaluación completada', 'success');

        } catch (error) {
            console.error('Evaluation error:', error);
            this.showNotification('Error al evaluar contenido: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async performEvaluation(content, options = {}) {
        const { isReply = false, context = '', restrictionId = null } = options;
        const headers = { 'Content-Type': 'application/json' };
        const token = window.judgeRestrictionsService?.authToken || null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch('/api/judge/evaluate', {
            method: 'POST',
            headers,
            body: JSON.stringify({ content, isReply, context, restrictionId })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || 'Failed to evaluate');
        }
        const data = await resp.json();
        return data.evaluation;
    }

    checkLength(content, isReply, restriction) {
        const minLength = isReply ? 
            (restriction?.mode_length_limits?.reply?.[0] || 20) : 
            (restriction?.min_length || 40);
        const maxLength = isReply ? 
            (restriction?.mode_length_limits?.reply?.[1] || 220) : 
            (restriction?.max_length || 280);

        const length = content.length;
        const passed = length >= minLength && length <= maxLength;

        return {
            passed,
            value: length,
            min: minLength,
            max: maxLength,
            message: passed ? 
                `Longitud válida (${length} caracteres)` : 
                `Longitud inválida: debe estar entre ${minLength} y ${maxLength} caracteres`
        };
    }

    checkBannedContent(content, restriction) {
        const bannedSubstrings = restriction?.banned_substrings || [
            'as an ai', 'chatgpt', 'hustle', 'crush your goals'
        ];
        const bannedPrefixes = restriction?.banned_prefixes || [
            'here are', 'in this thread'
        ];

        const foundSubstrings = bannedSubstrings.filter(substring => 
            content.toLowerCase().includes(substring.toLowerCase())
        );
        const foundPrefixes = bannedPrefixes.filter(prefix => 
            content.toLowerCase().startsWith(prefix.toLowerCase())
        );

        const passed = foundSubstrings.length === 0 && foundPrefixes.length === 0;

        return {
            passed,
            foundSubstrings,
            foundPrefixes,
            message: passed ? 
                'Sin contenido prohibido' : 
                `Contenido prohibido encontrado: ${[...foundSubstrings, ...foundPrefixes].join(', ')}`
        };
    }

    displayEvaluationResult(result) {
        const resultsContainer = document.getElementById('evaluationResults');
        
        const resultHTML = `
            <div class="evaluation-result ${result.passed ? 'approved' : 'rejected'}">
                <div class="result-header">
                    <div class="result-status">
                        <i class="fas fa-${result.passed ? 'check-circle' : 'times-circle'}"></i>
                        <span class="status-text">${result.passed ? 'APROBADO' : 'RECHAZADO'}</span>
                    </div>
                    <div class="result-score">
                        <span class="score-label">Puntuación:</span>
                        <span class="score-value">${result.score.toFixed(1)}%</span>
                    </div>
                </div>
                
                <div class="result-details">
                    <div class="result-summary">
                        <p><strong>Contenido:</strong> "${result.content}"</p>
                        <p><strong>Tiempo de evaluación:</strong> ${result.evaluationTime}ms</p>
                        <p><strong>Confianza:</strong> ${result.confidence.toFixed(1)}%</p>
                    </div>
                    
                    <div class="checks-summary">
                        ${Object.entries(result.checks).map(([type, check]) => `
                            <div class="check-item ${check.passed ? 'passed' : 'failed'}">
                                <i class="fas fa-${check.passed ? 'check' : 'times'}"></i>
                                <span class="check-type">${this.formatCheckType(type)}:</span>
                                <span class="check-message">${check.message}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${result.failedChecks.length > 0 ? `
                        <div class="failed-checks">
                            <h4>Razones del rechazo:</h4>
                            <ul>
                                ${result.failedChecks.map(check => `
                                    <li><strong>${this.formatCheckType(check.type)}:</strong> ${check.message}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div class="result-actions">
                        <button class="btn btn-primary" onclick="judgeDashboard.retryEvaluation()">
                            <i class="fas fa-redo"></i> Re-evaluar
                        </button>
                        <button class="btn btn-secondary" onclick="judgeDashboard.copyResult()">
                            <i class="fas fa-copy"></i> Copiar Resultado
                        </button>
                        <button class="btn btn-outline" onclick="judgeDashboard.saveResult()">
                            <i class="fas fa-save"></i> Guardar
                        </button>
                    </div>
                </div>
            </div>
        `;

        resultsContainer.innerHTML = resultHTML;
        this.evaluationResults.push(result);
    }

    formatCheckType(type) {
        const typeMap = {
            length: 'Longitud',
            similarity: 'Similitud',
            bannedContent: 'Contenido Prohibido',
            aiDetection: 'Detección IA',
            checklistPattern: 'Patrón de Lista'
        };
        return typeMap[type] || type;
    }

    performRealTimeEvaluation(content) {
        // Perform a quick evaluation for real-time feedback
        if (content.length < 10) return;

        // Simple checks for real-time feedback
        const checks = {
            length: this.checkLength(content, false, this.currentRestriction),
            bannedContent: this.checkBannedContent(content, this.currentRestriction)
        };

        this.updateRealTimeFeedback(checks);
    }

    updateRealTimeFeedback(checks) {
        const textarea = document.getElementById('contentToEvaluate');
        const footer = textarea.closest('.form-group').querySelector('.textarea-footer');
        
        let feedbackHTML = '<div class="real-time-feedback">';
        
        Object.entries(checks).forEach(([type, check]) => {
            feedbackHTML += `
                <div class="feedback-item ${check.passed ? 'valid' : 'invalid'}">
                    <i class="fas fa-${check.passed ? 'check' : 'exclamation-triangle'}"></i>
                    ${check.message}
                </div>
            `;
        });
        
        feedbackHTML += '</div>';
        
        // Remove existing feedback
        const existingFeedback = footer.querySelector('.real-time-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        // Add new feedback
        footer.insertAdjacentHTML('beforeend', feedbackHTML);
    }

    // Restriction Management Methods
    async loadRestrictions() {
        try {
            this.restrictions = await judgeRestrictionsService.getAllRestrictions();
            this.renderRestrictionsList();
        } catch (error) {
            console.error('Error loading restrictions:', error);
            this.showNotification('Error al cargar restricciones', 'error');
        }
    }

    renderRestrictionsList() {
        const container = document.getElementById('restrictionsList');
        
        if (!this.restrictions || this.restrictions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cog"></i>
                    <h4>No hay restricciones configuradas</h4>
                    <p>Crea tu primera restricción para empezar</p>
                    <button class="btn btn-primary" onclick="judgeDashboard.createNewRestriction()">
                        <i class="fas fa-plus"></i> Crear Restricción
                    </button>
                </div>
            `;
            return;
        }

        const activeRestriction = this.restrictions.find(r => r.is_active);

        container.innerHTML = `
            <div class="restrictions-grid">
                ${this.restrictions.map(restriction => this.renderRestrictionCard(restriction, activeRestriction?.id === restriction.id)).join('')}
            </div>
        `;
    }

    renderRestrictionCard(restriction, isActive) {
        const createdDate = new Date(restriction.created_at).toLocaleDateString('es-ES');
        const updatedDate = new Date(restriction.updated_at).toLocaleDateString('es-ES');

        return `
            <div class="restriction-card ${isActive ? 'active' : ''} ${!restriction.is_active ? 'inactive' : ''}">
                ${isActive ? '<div class="card-badge badge-active">Activa</div>' : ''}
                ${restriction.is_default ? '<div class="card-badge badge-default">Por defecto</div>' : ''}
                
                <div class="restriction-header">
                    <h3 class="restriction-title">${restriction.name}</h3>
                    <div class="restriction-status">
                        <span class="status-indicator ${restriction.is_active ? 'active' : 'inactive'}">
                            <i class="fas fa-${restriction.is_active ? 'check' : 'times'}"></i>
                            ${restriction.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                    </div>
                </div>
                
                ${restriction.description ? `
                    <p class="restriction-description">${restriction.description}</p>
                ` : ''}
                
                <div class="restriction-stats">
                    <div class="stat-item">
                        <div class="stat-label">Longitud</div>
                        <div class="stat-value">${restriction.min_length}-${restriction.max_length}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Similitud</div>
                        <div class="stat-value">${restriction.min_similarity}-${restriction.max_similarity}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">IA Detección</div>
                        <div class="stat-value">${restriction.ai_cop_threshold}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Prohibidas</div>
                        <div class="stat-value">${restriction.banned_substrings?.length || 0}</div>
                    </div>
                </div>
                
                <div class="restriction-actions">
                    ${!isActive ? `
                        <button class="btn btn-success btn-sm" onclick="judgeDashboard.activateRestriction('${restriction.id}')">
                            <i class="fas fa-play"></i> Activar
                        </button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm" onclick="judgeDashboard.editRestriction('${restriction.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    ${!restriction.is_default ? `
                        <button class="btn btn-danger btn-sm" onclick="judgeDashboard.deleteRestriction('${restriction.id}')">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    ` : ''}
                </div>
                
                <div class="restriction-meta">
                    <small class="text-muted">
                        <i class="fas fa-calendar"></i> Creada: ${createdDate} | 
                        <i class="fas fa-sync"></i> Actualizada: ${updatedDate}
                    </small>
                </div>
            </div>
        `;
    }

    // Monitoring Methods
    initializeCharts() {
        // Initialize Chart.js charts
        const evaluationsCtx = document.getElementById('evaluationsChart');
        const rejectionReasonsCtx = document.getElementById('rejectionReasonsChart');

        if (evaluationsCtx) {
            this.charts.evaluations = new Chart(evaluationsCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Evaluaciones',
                        data: [],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Aprobados',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Rechazados',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        if (rejectionReasonsCtx) {
            this.charts.rejectionReasons = new Chart(rejectionReasonsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Longitud', 'Similitud', 'Contenido Prohibido', 'IA Detección', 'Formato'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: [
                            '#f59e0b',
                            '#8b5cf6',
                            '#ef4444',
                            '#06b6d4',
                            '#84cc16'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }

    async loadMonitoringData() {
        try {
            // Simulate loading monitoring data
            // In real implementation, this would fetch from API
            
            const mockData = this.generateMockMonitoringData();
            this.updateMonitoringDashboard(mockData);
            
        } catch (error) {
            console.error('Error loading monitoring data:', error);
        }
    }

    generateMockMonitoringData() {
        const now = new Date();
        const data = [];
        
        // Generate data for the last 24 hours
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60 * 60 * 1000);
            const evaluations = Math.floor(Math.random() * 50) + 10;
            const approved = Math.floor(evaluations * (0.7 + Math.random() * 0.2));
            const rejected = evaluations - approved;
            
            data.push({
                time: time.toISOString(),
                evaluations,
                approved,
                rejected
            });
        }

        const totalEvaluations = data.reduce((sum, item) => sum + item.evaluations, 0);
        const totalApproved = data.reduce((sum, item) => sum + item.approved, 0);
        const totalRejected = data.reduce((sum, item) => sum + item.rejected, 0);
        const avgTime = Math.floor(Math.random() * 200) + 50;

        return {
            timeline: data,
            totals: {
                evaluations: totalEvaluations,
                approved: totalApproved,
                rejected: totalRejected,
                avgTime
            },
            rejectionReasons: {
                length: Math.floor(totalRejected * 0.3),
                similarity: Math.floor(totalRejected * 0.2),
                bannedContent: Math.floor(totalRejected * 0.25),
                aiDetection: Math.floor(totalRejected * 0.15),
                format: Math.floor(totalRejected * 0.1)
            }
        };
    }

    updateMonitoringDashboard(data) {
        // Update metrics
        document.getElementById('totalEvaluations').textContent = data.totals.evaluations;
        document.getElementById('approvedCount').textContent = data.totals.approved;
        document.getElementById('rejectedCount').textContent = data.totals.rejected;
        document.getElementById('avgEvaluationTime').textContent = data.totals.avgTime + 'ms';

        // Calculate rates
        const approvalRate = data.totals.evaluations > 0 ? 
            (data.totals.approved / data.totals.evaluations * 100).toFixed(1) : 0;
        const rejectionRate = data.totals.evaluations > 0 ? 
            (data.totals.rejected / data.totals.evaluations * 100).toFixed(1) : 0;

        document.getElementById('approvalRate').textContent = approvalRate + '%';
        document.getElementById('rejectionRate').textContent = rejectionRate + '%';

        // Update charts
        this.updateCharts(data);

        // Update activity feed
        this.updateActivityFeed(data.timeline.slice(-10));
    }

    updateCharts(data) {
        if (this.charts.evaluations) {
            const labels = data.timeline.map(item => 
                new Date(item.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            );
            
            this.charts.evaluations.data.labels = labels;
            this.charts.evaluations.data.datasets[0].data = data.timeline.map(item => item.evaluations);
            this.charts.evaluations.data.datasets[1].data = data.timeline.map(item => item.approved);
            this.charts.evaluations.data.datasets[2].data = data.timeline.map(item => item.rejected);
            this.charts.evaluations.update();
        }

        if (this.charts.rejectionReasons) {
            this.charts.rejectionReasons.data.datasets[0].data = Object.values(data.rejectionReasons);
            this.charts.rejectionReasons.update();
        }
    }

    updateActivityFeed(recentActivity) {
        const container = document.getElementById('recentActivity');
        
        if (!recentActivity || recentActivity.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>Sin actividad reciente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentActivity.map(activity => {
            const status = activity.approved > activity.rejected ? 'success' : 'error';
            const icon = status === 'success' ? 'check-circle' : 'times-circle';
            const title = status === 'success' ? 'Evaluaciones Aprobadas' : 'Evaluaciones Rechazadas';
            const description = `${activity.evaluations} evaluaciones, ${activity.approved} aprobadas, ${activity.rejected} rechazadas`;

            return `
                <div class="activity-item">
                    <div class="activity-icon ${status}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${title}</div>
                        <div class="activity-description">${description}</div>
                    </div>
                    <div class="activity-time">
                        ${new Date(activity.time).toLocaleTimeString('es-ES')}
                    </div>
                </div>
            `;
        }).join('');
    }

    // History Methods
    async loadHistory(page = 1) {
        try {
            // Simulate loading history data
            // In real implementation, this would fetch from API with pagination
            
            const mockHistory = this.generateMockHistory(page);
            this.displayHistory(mockHistory.items);
            this.updateHistoryPagination(mockHistory.pagination);
            
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    generateMockHistory(page) {
        const items = [];
        const totalItems = 150;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        
        const startIndex = (page - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
        
        for (let i = startIndex; i < endIndex; i++) {
            const passed = Math.random() > 0.3;
            const score = passed ? Math.random() * 30 + 70 : Math.random() * 40 + 20;
            
            items.push({
                id: `eval-${i}`,
                content: this.generateRandomTweet(),
                passed,
                score,
                timestamp: new Date(Date.now() - i * 60000).toISOString(),
                evaluationTime: Math.floor(Math.random() * 200) + 50,
                restriction: 'Default Configuration'
            });
        }

        return {
            items,
            pagination: {
                currentPage: page,
                totalPages,
                hasNext: page < totalPages,
                hasPrevious: page > 1
            }
        };
    }

    generateRandomTweet() {
        const tweets = [
            "Just shipped a new feature! 🚀 Excited to see how users respond to the improved experience.",
            "Working on something big... Can't wait to share it with you all soon! 👀",
            "The best code is the code you don't have to write. Keep it simple, stupid.",
            "Debugging: Being the detective in a crime movie where you are also the murderer.",
            "As an AI language model, I can help you with that request.",
            "CRUSH your goals this week! 💪 The hustle never stops!",
            "Here's a thread on how to 10x your productivity...",
            "Just another inspirational quote to get you through the day ✨",
            "Building something real is what matters. Stop talking, start doing.",
            "When you guard this time like it's gold, that's when the real building happens."
        ];
        
        return tweets[Math.floor(Math.random() * tweets.length)];
    }

    displayHistory(items) {
        const container = document.getElementById('historyList');
        
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h4>Sin historial</h4>
                    <p>No hay evaluaciones registradas</p>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="history-item">
                <div class="history-item-header">
                    <div class="history-item-title">
                        <i class="fas fa-${item.passed ? 'check-circle text-success' : 'times-circle text-danger'}"></i>
                        ${item.passed ? 'Aprobado' : 'Rechazado'}
                    </div>
                    <div class="history-item-status ${item.passed ? 'status-approved' : 'status-rejected'}">
                        ${item.score.toFixed(1)}%
                    </div>
                </div>
                <div class="history-item-content">
                    "${item.content}"
                </div>
                <div class="history-item-meta">
                    <span><i class="fas fa-clock"></i> ${new Date(item.timestamp).toLocaleString('es-ES')}</span>
                    <span><i class="fas fa-tachometer-alt"></i> ${item.evaluationTime}ms</span>
                    <span><i class="fas fa-cog"></i> ${item.restriction}</span>
                </div>
            </div>
        `).join('');
    }

    updateHistoryPagination(pagination) {
        document.getElementById('currentPage').textContent = pagination.currentPage;
        document.getElementById('totalPages').textContent = pagination.totalPages;
        
        const prevBtn = document.querySelector('[onclick="loadPreviousHistory()"]');
        const nextBtn = document.querySelector('[onclick="loadNextHistory()"]');
        
        if (prevBtn) prevBtn.disabled = !pagination.hasPrevious;
        if (nextBtn) nextBtn.disabled = !pagination.hasNext;
        
        this.currentPage = pagination.currentPage;
    }

    // Utility Methods
    showLoading(message = 'Cargando...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = document.getElementById('loadingText');
        
        if (text) text.textContent = message;
        if (overlay) overlay.classList.remove('hidden');
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    color: white;
                    font-weight: 500;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    animation: slideInRight 0.3s ease;
                    max-width: 400px;
                }
                .notification-success { background: #10b981; }
                .notification-error { background: #ef4444; }
                .notification-warning { background: #f59e0b; }
                .notification-info { background: #3b82f6; }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0.25rem;
                    border-radius: 4px;
                    margin-left: auto;
                }
                .notification-close:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    updateCharCount(count) {
        const charCount = document.querySelector('.char-count');
        if (charCount) {
            charCount.textContent = `${count} / 280`;
            charCount.style.color = count > 280 ? '#ef4444' : '#6b7280';
        }
    }

    // Public API Methods
    async evaluateContent() {
        await this.evaluateContent();
    }

    async evaluateBatch() {
        const modal = document.getElementById('batchEvaluationModal');
        modal.classList.remove('hidden');
    }

    createNewRestriction() {
        // Redirect to restriction editor or open modal
        window.location.href = '/config-enhanced.html#judge';
    }

    editRestriction(id) {
        const restriction = this.restrictions.find(r => r.id === id);
        if (restriction) {
            // Open restriction editor with this restriction
            window.location.href = `/config-enhanced.html#judge?edit=${id}`;
        }
    }

    async activateRestriction(id) {
        if (!confirm('¿Activar esta restricción? Las demás se desactivarán.')) {
            return;
        }

        try {
            await judgeRestrictionsService.activateRestriction(id);
            await this.loadRestrictions();
            this.showNotification('Restricción activada exitosamente', 'success');
        } catch (error) {
            console.error('Error activating restriction:', error);
            this.showNotification('Error al activar restricción', 'error');
        }
    }

    async deleteRestriction(id) {
        const restriction = this.restrictions.find(r => r.id === id);
        if (!restriction) return;

        if (!confirm(`¿Eliminar la restricción "${restriction.name}"? Esta acción no se puede deshacer.`)) {
            return;
        }

        try {
            await judgeRestrictionsService.deleteRestriction(id);
            await this.loadRestrictions();
            this.showNotification('Restricción eliminada exitosamente', 'success');
        } catch (error) {
            console.error('Error deleting restriction:', error);
            this.showNotification('Error al eliminar restricción', 'error');
        }
    }

    refreshRestrictions() {
        this.loadRestrictions();
    }

    refreshMonitoring() {
        this.loadMonitoringData();
    }

    loadPreviousHistory() {
        if (this.currentPage > 1) {
            this.loadHistory(this.currentPage - 1);
        }
    }

    loadNextHistory() {
        this.loadHistory(this.currentPage + 1);
    }

    searchHistory(query) {
        // Implement search functionality
        console.log('Searching history for:', query);
    }

    // Modal Methods
    closeBatchModal() {
        const modal = document.getElementById('batchEvaluationModal');
        modal.classList.add('hidden');
    }

    async executeBatchEvaluation() {
        const content = document.getElementById('batchContent').value.trim();
        const isReplyMode = document.getElementById('batchReplyMode').checked;

        if (!content) {
            this.showNotification('Por favor ingresa contenido para evaluar', 'warning');
            return;
        }

        const items = content.split('\n').filter(line => line.trim());
        
        this.showLoading(`Evaluando ${items.length} items...`);
        this.closeBatchModal();

        try {
            const results = [];
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i].trim();
                if (item) {
                    const result = await this.performEvaluation(item, { isReply: isReplyMode });
                    results.push(result);
                    
                    // Update progress
                    if (i % 5 === 0) {
                        this.showLoading(`Evaluando ${items.length} items... (${i + 1}/${items.length})`);
                    }
                }
            }

            this.displayBatchResults(results);
            this.showNotification(`Evaluación por lotes completada: ${results.length} items evaluados`, 'success');

        } catch (error) {
            console.error('Batch evaluation error:', error);
            this.showNotification('Error en evaluación por lotes', 'error');
        } finally {
            this.hideLoading();
        }
    }

    displayBatchResults(results) {
        const container = document.getElementById('evaluationResults');
        
        const approved = results.filter(r => r.passed).length;
        const rejected = results.filter(r => !r.passed).length;
        const total = results.length;

        const summaryHTML = `
            <div class="batch-results-summary">
                <h3>Resultados del Lote</h3>
                <div class="batch-stats">
                    <div class="batch-stat">
                        <span class="stat-label">Total:</span>
                        <span class="stat-value">${total}</span>
                    </div>
                    <div class="batch-stat approved">
                        <span class="stat-label">Aprobados:</span>
                        <span class="stat-value">${approved}</span>
                    </div>
                    <div class="batch-stat rejected">
                        <span class="stat-label">Rechazados:</span>
                        <span class="stat-value">${rejected}</span>
                    </div>
                    <div class="batch-stat">
                        <span class="stat-label">Tasa de Aprobación:</span>
                        <span class="stat-value">${((approved / total) * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;

        const resultsHTML = results.map((result, index) => `
            <div class="batch-result-item ${result.passed ? 'approved' : 'rejected'}">
                <div class="result-header">
                    <span class="result-number">#${index + 1}</span>
                    <span class="result-status">
                        <i class="fas fa-${result.passed ? 'check' : 'times'}"></i>
                        ${result.passed ? 'APROBADO' : 'RECHAZADO'}
                    </span>
                    <span class="result-score">${result.score.toFixed(1)}%</span>
                </div>
                <div class="result-content">
                    "${result.content}"
                </div>
                ${result.failedChecks.length > 0 ? `
                    <div class="result-reasons">
                        ${result.failedChecks.map(check => check.message).join('; ')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        container.innerHTML = summaryHTML + '<div class="batch-results-list">' + resultsHTML + '</div>';
    }

    // Utility Methods
    startMonitoring() {
        // Update monitoring data every 30 seconds
        this.monitoringInterval = setInterval(() => {
            if (this.currentTab === 'monitoring') {
                this.loadMonitoringData();
            }
        }, 30000);
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    resizeCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }

    // Cleanup
    destroy() {
        this.stopMonitoring();
        
        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.judgeDashboard = new JudgeDashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (window.judgeDashboard) {
        window.judgeDashboard.destroy();
    }
});
