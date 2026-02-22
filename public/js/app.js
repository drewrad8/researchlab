/* ===================================
   RESEARCH LAB — SPA Controller
   Screen switching, project list,
   progress SSE, graph loading
   =================================== */

(function () {
    'use strict';

    var currentScreen = 'project-list';
    var currentProjectId = null;
    var pollTimer = null;
    var eventSource = null;

    // ===================================
    // SCREEN SWITCHING
    // ===================================

    function showScreen(name) {
        var screens = document.querySelectorAll('.screen');
        screens.forEach(function (s) { s.classList.remove('active'); });

        var target = document.getElementById('screen-' + name);
        if (target) target.classList.add('active');

        currentScreen = name;

        // Update breadcrumb
        var navCurrent = document.getElementById('nav-current');
        if (name === 'project-list') {
            navCurrent.textContent = 'COGITATOR ENGINE';
            updateSystemStatus('COGITATOR ENGINE // AWAITING DIRECTIVES');
        } else if (name === 'progress') {
            navCurrent.textContent = 'ACTIVE RESEARCH';
        } else if (name === 'graph') {
            navCurrent.textContent = 'KNOWLEDGE GRAPH';
            updateSystemStatus('RESEARCH COGITATOR // RENDERING KNOWLEDGE GRAPH');
        }

        // Start/stop polling
        if (name === 'project-list') {
            startPolling();
        } else {
            stopPolling();
        }
    }

    function updateSystemStatus(text) {
        var el = document.getElementById('system-status');
        if (el) el.textContent = text;
    }

    // ===================================
    // PROJECT LIST
    // ===================================

    function fetchProjects() {
        fetch('/api/projects')
            .then(function (resp) {
                if (!resp.ok) throw new Error('Failed to fetch projects');
                return resp.json();
            })
            .then(function (projects) {
                renderProjectList(projects);
            })
            .catch(function (err) {
                console.error('Failed to fetch projects:', err);
            });
    }

    function renderProjectList(projects) {
        var body = document.getElementById('project-list-body');
        if (!body) return;

        if (!projects || projects.length === 0) {
            body.innerHTML = '<div class="empty-state">NO PROJECTS FOUND // INITIATE NEW RESEARCH</div>';
            return;
        }

        var html = '<table class="project-table">';
        html += '<thead><tr><th>Topic</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>';
        html += '<tbody>';

        projects.forEach(function (p) {
            html += '<tr>';
            html += '<td class="project-topic">' + escapeHtml(p.topic || p.id) + '</td>';
            html += '<td><span class="project-status ' + escapeHtml(p.status || 'pending') + '">' + escapeHtml(p.status || 'pending') + '</span></td>';
            html += '<td>' + formatDate(p.created) + '</td>';
            html += '<td>';
            if (p.status === 'complete') {
                html += '<button class="project-action" data-action="graph" data-id="' + escapeAttr(p.id) + '">View Graph</button>';
            }
            if (p.status !== 'complete' && p.status !== 'error') {
                html += '<button class="project-action" data-action="progress" data-id="' + escapeAttr(p.id) + '">Monitor</button>';
            }
            html += '<button class="project-action" data-action="delete" data-id="' + escapeAttr(p.id) + '">Delete</button>';
            // Resume control for error, complete, or any pipeline phase status
            var resumableStatuses = ['error', 'complete', 'protocol', 'planning', 'classifying', 'pre-screening', 'investigating', 'adjudicating', 'synthesizing'];
            if (resumableStatuses.indexOf(p.status) !== -1) {
                html += ' <select class="resume-phase-select" data-id="' + escapeAttr(p.id) + '">';
                var phases = ['protocol', 'planning', 'classifying', 'investigating', 'adjudicating', 'synthesizing'];
                phases.forEach(function (ph) {
                    html += '<option value="' + ph + '">' + ph + '</option>';
                });
                html += '</select>';
                html += '<button class="project-action resume-btn" data-action="resume" data-id="' + escapeAttr(p.id) + '">Resume</button>';
            }
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        body.innerHTML = html;

        // Bind action buttons
        body.querySelectorAll('.project-action').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                var id = btn.getAttribute('data-id');
                handleProjectAction(action, id);
            });
        });
    }

    function handleProjectAction(action, projectId) {
        if (action === 'graph') {
            loadGraph(projectId);
        } else if (action === 'progress') {
            openProgress(projectId);
        } else if (action === 'resume') {
            var select = document.querySelector('.resume-phase-select[data-id="' + projectId + '"]');
            var fromPhase = select ? select.value : 'protocol';
            fetch('/api/projects/' + projectId + '/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromPhase: fromPhase })
            })
                .then(function (resp) {
                    if (!resp.ok) throw new Error('Failed to resume');
                    return resp.json();
                })
                .then(function () {
                    openProgress(projectId);
                })
                .catch(function (err) {
                    console.error('Resume failed:', err);
                    alert('Failed to resume project: ' + err.message);
                });
        } else if (action === 'delete') {
            if (confirm('Delete this project?')) {
                fetch('/api/projects/' + projectId, { method: 'DELETE' })
                    .then(function () { fetchProjects(); })
                    .catch(function (err) { console.error('Delete failed:', err); });
            }
        }
    }

    function startPolling() {
        stopPolling();
        fetchProjects();
        pollTimer = setInterval(fetchProjects, 5000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ===================================
    // NEW PROJECT
    // ===================================

    function openNewProjectModal() {
        var modal = document.getElementById('new-project-modal');
        var input = document.getElementById('input-topic');
        var budgetInput = document.getElementById('input-investigation-budget');
        if (modal) {
            modal.classList.add('visible');
            if (input) { input.value = ''; input.focus(); }
            if (budgetInput) { budgetInput.value = '10'; }
        }
    }

    function closeNewProjectModal() {
        var modal = document.getElementById('new-project-modal');
        if (modal) modal.classList.remove('visible');
    }

    function submitNewProject() {
        var input = document.getElementById('input-topic');
        var topic = input ? input.value.trim() : '';
        if (!topic) return;

        var budgetInput = document.getElementById('input-investigation-budget');
        var investigationBudget = budgetInput ? parseInt(budgetInput.value, 10) : 10;
        if (isNaN(investigationBudget) || investigationBudget < 0) investigationBudget = 10;
        if (investigationBudget > 50) investigationBudget = 50;

        closeNewProjectModal();

        fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: topic, investigationBudget: investigationBudget })
        })
            .then(function (resp) {
                if (!resp.ok) throw new Error('Failed to create project');
                return resp.json();
            })
            .then(function (project) {
                openProgress(project.id);
            })
            .catch(function (err) {
                console.error('Failed to create project:', err);
                alert('Failed to create project: ' + err.message);
            });
    }

    // ===================================
    // PROGRESS SCREEN + SSE
    // ===================================

    function openProgress(projectId) {
        currentProjectId = projectId;
        showScreen('progress');

        // Fetch project detail for topic
        fetch('/api/projects/' + projectId)
            .then(function (resp) { return resp.json(); })
            .then(function (project) {
                var topicEl = document.getElementById('progress-topic');
                if (topicEl) topicEl.textContent = project.topic || projectId;
                updateSystemStatus('COGITATOR // RESEARCHING: ' + (project.topic || '').toUpperCase());

                // Set initial phase states from project
                updatePhaseFromProject(project);
            })
            .catch(function () {});

        // Clear worker log
        var log = document.getElementById('worker-log');
        if (log) log.innerHTML = '<div class="worker-log-title">Worker Activity Feed</div>';

        // Reset phase blocks
        document.querySelectorAll('.phase-block').forEach(function (block) {
            block.classList.remove('active', 'complete');
            block.querySelector('.phase-status').textContent = 'Waiting...';
            var fill = block.querySelector('.phase-progress-fill');
            if (fill) fill.style.width = '0%';
        });

        // Connect SSE
        connectSSE(projectId);
    }

    function updatePhaseFromProject(project) {
        var status = project.status || 'pending';
        var phases = ['planning', 'researching', 'synthesizing'];
        var currentPhaseIndex = phases.indexOf(status);

        phases.forEach(function (phase, i) {
            var block = document.querySelector('.phase-block[data-phase="' + phase + '"]');
            if (!block) return;

            if (status === 'complete') {
                block.classList.add('complete');
                block.classList.remove('active');
                block.querySelector('.phase-status').textContent = 'Complete';
            } else if (i < currentPhaseIndex) {
                block.classList.add('complete');
                block.classList.remove('active');
                block.querySelector('.phase-status').textContent = 'Complete';
            } else if (i === currentPhaseIndex) {
                block.classList.add('active');
                block.classList.remove('complete');
                block.querySelector('.phase-status').textContent = 'In Progress...';
            }
        });
    }

    function connectSSE(projectId) {
        disconnectSSE();

        eventSource = new EventSource('/api/projects/' + projectId + '/events');

        eventSource.addEventListener('phase', function (e) {
            var data = JSON.parse(e.data);
            handlePhaseEvent(data);
        });

        eventSource.addEventListener('worker', function (e) {
            var data = JSON.parse(e.data);
            appendWorkerEvent(data);
        });

        eventSource.addEventListener('progress', function (e) {
            var data = JSON.parse(e.data);
            handleProgressEvent(data);
        });

        eventSource.addEventListener('complete', function (e) {
            var data = JSON.parse(e.data);
            handleCompleteEvent(data);
        });

        eventSource.addEventListener('error_event', function (e) {
            var data = JSON.parse(e.data);
            appendWorkerEvent({ phase: 'ERROR', message: data.message || 'Unknown error', type: 'error' });
        });

        // Generic message fallback
        eventSource.onmessage = function (e) {
            try {
                var data = JSON.parse(e.data);
                if (data.type === 'phase') handlePhaseEvent(data);
                else if (data.type === 'worker') appendWorkerEvent(data);
                else if (data.type === 'progress') handleProgressEvent(data);
                else if (data.type === 'complete') handleCompleteEvent(data);
                else if (data.type === 'error') appendWorkerEvent({ phase: 'ERROR', message: data.message, type: 'error' });
                else appendWorkerEvent(data);
            } catch (err) {
                // Ignore parse errors for keepalive etc.
            }
        };

        eventSource.onerror = function () {
            // SSE will auto-reconnect
        };
    }

    function disconnectSSE() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    }

    function handlePhaseEvent(data) {
        var phase = data.phase || data.name;
        if (!phase) return;

        var phaseLower = phase.toLowerCase();

        // Mark previous phases complete
        var phases = ['planning', 'researching', 'synthesizing'];
        var idx = phases.indexOf(phaseLower);
        phases.forEach(function (p, i) {
            var block = document.querySelector('.phase-block[data-phase="' + p + '"]');
            if (!block) return;
            if (i < idx) {
                block.classList.add('complete');
                block.classList.remove('active');
                block.querySelector('.phase-status').textContent = 'Complete';
                var fill = block.querySelector('.phase-progress-fill');
                if (fill) fill.style.width = '100%';
            } else if (i === idx) {
                block.classList.add('active');
                block.classList.remove('complete');
                block.querySelector('.phase-status').textContent = data.status || 'In Progress...';
                var fill2 = block.querySelector('.phase-progress-fill');
                if (fill2) fill2.style.width = (data.progress || 0) + '%';
            }
        });

        appendWorkerEvent({ phase: phase.toUpperCase(), message: data.message || 'Phase started', type: 'phase' });
    }

    function handleProgressEvent(data) {
        var phase = (data.phase || '').toLowerCase();
        var block = document.querySelector('.phase-block[data-phase="' + phase + '"]');
        if (block) {
            var fill = block.querySelector('.phase-progress-fill');
            if (fill && data.progress != null) fill.style.width = data.progress + '%';
            if (data.status) block.querySelector('.phase-status').textContent = data.status;
        }
    }

    function handleCompleteEvent(data) {
        // Mark all phases complete
        document.querySelectorAll('.phase-block').forEach(function (block) {
            block.classList.add('complete');
            block.classList.remove('active');
            block.querySelector('.phase-status').textContent = 'Complete';
            var fill = block.querySelector('.phase-progress-fill');
            if (fill) fill.style.width = '100%';
        });

        appendWorkerEvent({ phase: 'COMPLETE', message: 'Research complete. Graph ready.', type: 'complete' });
        disconnectSSE();

        // Auto-open graph after short delay
        if (currentProjectId) {
            setTimeout(function () {
                loadGraph(currentProjectId);
            }, 1500);
        }
    }

    function appendWorkerEvent(data) {
        var log = document.getElementById('worker-log');
        if (!log) return;

        var div = document.createElement('div');
        div.className = 'worker-event';
        if (data.type === 'error') div.className += ' error';
        if (data.type === 'complete') div.className += ' complete';

        var now = new Date();
        var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

        div.innerHTML = '<span class="worker-event-time">' + timeStr + '</span>'
            + (data.phase ? '<span class="worker-event-phase">[' + escapeHtml(data.phase) + ']</span>' : '')
            + escapeHtml(data.message || data.step || data.currentStep || JSON.stringify(data));

        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    }

    // ===================================
    // GRAPH LOADING
    // ===================================

    function loadGraph(projectId) {
        currentProjectId = projectId;

        fetch('/api/projects/' + projectId + '/graph')
            .then(function (resp) {
                if (!resp.ok) throw new Error('Graph not available');
                return resp.json();
            })
            .then(function (graphData) {
                window.researchGraph = graphData;
                showScreen('graph');

                // Update system status with node/edge counts
                var nodeCount = (graphData.nodes || []).length;
                var edgeCount = (graphData.edges || []).length;
                var nodeCountEl = document.getElementById('node-count');
                var edgeCountEl = document.getElementById('edge-count');
                if (nodeCountEl) nodeCountEl.textContent = nodeCount;
                if (edgeCountEl) edgeCountEl.textContent = edgeCount;
                updateSystemStatus('RESEARCH COGITATOR // ' + nodeCount + ' NODES MAPPED // ' + edgeCount + ' CONNECTIONS TRACED');

                // Dispatch event for graph.js to reinitialize
                document.dispatchEvent(new CustomEvent('researchlab:graphReady'));

                // Initialize research UI if available
                if (window.initResearchUI) {
                    window.initResearchUI();
                }
            })
            .catch(function (err) {
                console.error('Failed to load graph:', err);
                alert('Graph not available for this project yet.');
            });
    }

    // ===================================
    // NAVIGATION BINDINGS
    // ===================================

    function bindNavigation() {
        // New project button
        var btnNew = document.getElementById('btn-new-project');
        if (btnNew) btnNew.addEventListener('click', openNewProjectModal);

        // Modal cancel
        var btnCancel = document.getElementById('btn-modal-cancel');
        if (btnCancel) btnCancel.addEventListener('click', closeNewProjectModal);

        // Modal submit
        var btnSubmit = document.getElementById('btn-modal-submit');
        if (btnSubmit) btnSubmit.addEventListener('click', submitNewProject);

        // Modal overlay click to close
        var overlay = document.getElementById('new-project-modal');
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeNewProjectModal();
            });
        }

        // Enter key in topic input
        var topicInput = document.getElementById('input-topic');
        if (topicInput) {
            topicInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') submitNewProject();
                if (e.key === 'Escape') closeNewProjectModal();
            });
        }

        // Back to list from progress
        var btnBackList = document.getElementById('btn-back-list');
        if (btnBackList) {
            btnBackList.addEventListener('click', function () {
                disconnectSSE();
                showScreen('project-list');
            });
        }

        // Back to progress from graph
        var btnBackProgress = document.getElementById('btn-back-progress');
        if (btnBackProgress) {
            btnBackProgress.addEventListener('click', function () {
                if (currentProjectId) {
                    openProgress(currentProjectId);
                } else {
                    showScreen('project-list');
                }
            });
        }

        // Home nav link
        var navHome = document.getElementById('nav-home');
        if (navHome) {
            navHome.addEventListener('click', function (e) {
                e.preventDefault();
                disconnectSSE();
                showScreen('project-list');
            });
        }
    }

    // ===================================
    // UTILITIES
    // ===================================

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function formatDate(isoStr) {
        if (!isoStr) return '---';
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return '---';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    // ===================================
    // EXPORT for external use
    // ===================================

    window.researchApp = {
        showScreen: showScreen,
        loadGraph: loadGraph,
        openProgress: openProgress
    };

    // ===================================
    // BOOT
    // ===================================

    function init() {
        bindNavigation();
        showScreen('project-list');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
