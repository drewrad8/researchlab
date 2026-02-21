/* ===================================
   RESEARCH LAB — UI Controller
   View switching, detail panel, report,
   search integration
   Research Lab UI controller
   =================================== */

(function () {
    'use strict';

    var currentView = 'graph';
    var reportRendered = false;
    var detailPanelOpen = false;
    var initialized = false;

    // ===================================
    // INITIALIZATION
    // ===================================

    function init() {
        if (initialized) return;
        initialized = true;
        bindViewToggles();
        bindSearch();
        bindDetailPanel();
        bindKeyboard();
        listenGraphEvents();
    }

    // Expose init for external calling by app.js
    window.initResearchUI = function () {
        reportRendered = false; // Reset so report re-renders with new data
        initialized = false;
        init();
    };

    // ===================================
    // VIEW SWITCHING
    // ===================================

    function bindViewToggles() {
        var toggles = document.querySelectorAll('.view-toggle');
        toggles.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var view = btn.getAttribute('data-view');
                switchView(view);
            });
        });
    }

    function switchView(view) {
        if (view === currentView) return;
        currentView = view;

        var graphView = document.getElementById('graph-view');
        var reportView = document.getElementById('report-view');
        var toggles = document.querySelectorAll('.view-toggle');

        toggles.forEach(function (btn) {
            var isActive = btn.getAttribute('data-view') === view;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (view === 'graph') {
            graphView.style.display = '';
            graphView.classList.add('active-view');
            reportView.style.display = 'none';
        } else if (view === 'report') {
            graphView.style.display = 'none';
            graphView.classList.remove('active-view');
            reportView.style.display = '';
            if (!reportRendered) {
                renderReport();
                reportRendered = true;
            }
        }

        // Close detail panel when switching views
        closeDetailPanel();
    }

    // ===================================
    // GRAPH EVENT LISTENERS
    // ===================================

    function listenGraphEvents() {
        document.addEventListener('graph:nodeSelected', function (e) {
            var nodeId = e.detail.nodeId;
            renderDetailPanel(nodeId);
        });

        document.addEventListener('graph:backgroundTap', function () {
            closeDetailPanel();
        });
    }

    // ===================================
    // DETAIL PANEL
    // ===================================

    function bindDetailPanel() {
        var closeBtn = document.querySelector('.detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                closeDetailPanel();
                if (window.graphAPI) window.graphAPI.resetHighlight();
            });
        }
    }

    function openDetailPanel() {
        var panel = document.getElementById('detail-panel');
        if (panel) {
            panel.classList.add('open');
            detailPanelOpen = true;
        }
    }

    function closeDetailPanel() {
        var panel = document.getElementById('detail-panel');
        if (panel) {
            panel.classList.remove('open');
            detailPanelOpen = false;
        }
    }

    function renderDetailPanel(nodeId) {
        var data = window.researchGraph;
        if (!data) return;

        var node = null;
        for (var i = 0; i < data.nodes.length; i++) {
            if (data.nodes[i].id === nodeId) {
                node = data.nodes[i];
                break;
            }
        }

        if (!node) return;

        var topic = data.topics ? data.topics[nodeId] : null;
        var contentEl = document.querySelector('.detail-content');
        if (!contentEl) return;

        var html = '';

        // Title
        html += '<h2 class="detail-title">' + escapeHtml(node.label || nodeId) + '</h2>';

        // Meta: type badge + severity badge
        html += '<div class="detail-meta">';
        html += '<span class="detail-type-badge ' + escapeHtml(node.type || 'context') + '">' + escapeHtml(node.type || 'context') + '</span>';
        if (node.severity && node.severity !== 'moderate') {
            html += '<span class="severity-badge ' + escapeHtml(node.severity) + '">' + escapeHtml(node.severity) + '</span>';
        }
        html += '</div>';

        // Summary
        if (node.summary) {
            html += '<div class="detail-summary">' + escapeHtml(node.summary) + '</div>';
        }

        // Key stats from node's keyStats object
        if (node.keyStats && typeof node.keyStats === 'object') {
            var statKeys = Object.keys(node.keyStats);
            if (statKeys.length > 0) {
                html += '<div class="stats-grid">';
                statKeys.forEach(function (key) {
                    html += '<div class="stat-item">';
                    html += '<div class="stat-label">' + escapeHtml(formatStatLabel(key)) + '</div>';
                    html += '<div class="stat-value">' + escapeHtml(String(node.keyStats[key])) + '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
        }

        // If topic data exists, render full detail
        if (topic) {
            // Sections
            if (topic.sections && topic.sections.length > 0) {
                topic.sections.forEach(function (section) {
                    if (!section.content && !section.chart) return;
                    html += '<div class="detail-section">';
                    html += '<h3 class="detail-section-title">' + escapeHtml(section.heading || section.title || '') + '</h3>';
                    if (section.content) {
                        var CONTENT_LIMIT = 400;
                        var content = section.content;
                        if (content.length > CONTENT_LIMIT) {
                            var truncated = content.substring(0, CONTENT_LIMIT);
                            var lastSpace = truncated.lastIndexOf(' ');
                            if (lastSpace > CONTENT_LIMIT * 0.7) truncated = truncated.substring(0, lastSpace);
                            html += '<div class="detail-section-content truncated-content">' + escapeHtml(truncated) + '...</div>';
                            html += '<div class="detail-section-content full-content" style="display:none;">' + escapeHtml(content) + '</div>';
                            html += '<button class="show-more-btn content-toggle">SHOW MORE</button>';
                        } else {
                            html += '<div class="detail-section-content">' + escapeHtml(content) + '</div>';
                        }
                    }
                    if (section.chart) {
                        html += '<img class="detail-chart" src="assets/charts/' + escapeAttr(section.chart) + '" alt="' + escapeAttr(section.heading || '') + ' chart" loading="lazy">';
                    }
                    html += '</div>';
                });
            }

            // Citations
            if (topic.citations && topic.citations.length > 0) {
                var validCites = topic.citations.filter(isValidCitation);
                if (validCites.length > 0) {
                    html += '<div class="detail-section">';
                    html += '<h3 class="detail-section-title">Citations (' + validCites.length + ')</h3>';
                    var CITE_LIMIT = 8;
                    var showAll = validCites.length <= CITE_LIMIT;
                    html += '<ul class="data-sources' + (showAll ? '' : ' collapsed-list') + '">';
                    validCites.forEach(function (c, i) {
                        var overflowClass = (i >= CITE_LIMIT && !showAll) ? ' class="overflow-item"' : '';
                        html += '<li' + overflowClass + '>' + formatCitation(c) + '</li>';
                    });
                    html += '</ul>';
                    if (!showAll) {
                        html += '<button class="show-more-btn" data-target="citations">SHOW ALL ' + validCites.length + ' CITATIONS</button>';
                    }
                    html += '</div>';
                }
            }

            // Data sources
            if (topic.dataSources && topic.dataSources.length > 0) {
                html += '<div class="detail-section">';
                html += '<h3 class="detail-section-title">Data Sources</h3>';
                html += '<ul class="data-sources">';
                topic.dataSources.forEach(function (ds) {
                    if (typeof ds === 'string') {
                        html += '<li>' + escapeHtml(ds) + '</li>';
                    } else {
                        var dsLabel = escapeHtml(ds.name || '');
                        if (ds.records) dsLabel += ' (' + ds.records + ' records)';
                        if (ds.url) {
                            html += '<li><a href="' + escapeAttr(ds.url) + '" target="_blank" rel="noopener" class="cite-link">' + dsLabel + '</a></li>';
                        } else {
                            html += '<li>' + dsLabel + '</li>';
                        }
                    }
                });
                html += '</ul>';
                html += '</div>';
            }
        }

        // Connected nodes (evidence chain)
        if (window.graphAPI) {
            var connections = window.graphAPI.getConnectedNodes(nodeId);
            if (connections.length > 0) {
                html += '<div class="detail-section">';
                html += '<h3 class="detail-section-title">Connections</h3>';

                // Evidence chain rendering
                html += '<div class="evidence-chain">';
                connections.forEach(function (conn) {
                    html += '<div class="evidence-item">';
                    html += '<div class="evidence-connector">';
                    html += '<span class="evidence-dot"></span>';
                    html += '<span class="evidence-line"></span>';
                    html += '<span class="evidence-label">' + escapeHtml(conn.edgeLabel || conn.edgeType || 'linked') + '</span>';
                    html += '</div>';
                    html += '<div class="evidence-body">';
                    html += '<div class="evidence-target">' + escapeHtml(conn.label) + '</div>';
                    if (conn.citation) {
                        html += '<div class="evidence-citation">' + escapeHtml(conn.citation) + '</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';

                // Clickable links to navigate graph
                html += '<ul class="connected-nodes">';
                connections.forEach(function (conn) {
                    html += '<li><a class="connected-node-link" data-node-id="' + escapeAttr(conn.id) + '" href="#">' + escapeHtml(conn.label) + '</a></li>';
                });
                html += '</ul>';
                html += '</div>';
            }
        }

        contentEl.innerHTML = html;

        // Bind show-more buttons for truncated content
        contentEl.querySelectorAll('.content-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var section = btn.parentElement;
                var truncEl = section.querySelector('.truncated-content');
                var fullEl = section.querySelector('.full-content');
                if (truncEl && fullEl) {
                    var isExpanded = fullEl.style.display !== 'none';
                    truncEl.style.display = isExpanded ? '' : 'none';
                    fullEl.style.display = isExpanded ? 'none' : '';
                    btn.textContent = isExpanded ? 'SHOW MORE' : 'SHOW LESS';
                }
            });
        });

        // Bind show-more for citation/datasource overflow lists
        contentEl.querySelectorAll('.show-more-btn[data-target]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var list = btn.previousElementSibling;
                if (list && list.classList.contains('collapsed-list')) {
                    list.classList.remove('collapsed-list');
                    btn.style.display = 'none';
                }
            });
        });

        // Bind connected node links
        contentEl.querySelectorAll('.connected-node-link').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var targetId = link.getAttribute('data-node-id');
                if (window.graphAPI) {
                    window.graphAPI.highlightNode(targetId);
                    renderDetailPanel(targetId);
                }
            });
        });

        openDetailPanel();
    }

    // ===================================
    // REPORT VIEW
    // ===================================

    function renderReport() {
        var reportContent = document.getElementById('report-content');
        if (!reportContent) return;

        var data = window.researchGraph;
        if (!data || !data.topics) {
            reportContent.innerHTML = '<div style="text-align:center; padding:2rem; color:#6b1a1a; font-size:0.8rem; letter-spacing:2px;">COGITATOR ERROR // NO TOPIC DATA AVAILABLE</div>';
            return;
        }

        // Generate findings from topics
        var findings = buildFindingsFromTopics(data.topics, data.nodes || []);
        renderFindings(findings, reportContent);
    }

    function buildFindingsFromTopics(topics, nodes) {
        // Group nodes by type to create report categories
        var categories = {};

        // Build a node lookup
        var nodeMap = {};
        nodes.forEach(function (n) { nodeMap[n.id] = n; });

        Object.keys(topics).forEach(function (topicId) {
            var topic = topics[topicId];
            var node = nodeMap[topicId];
            var type = (node && node.type) || 'context';

            // Map node types to category keys
            var catKey = type;
            if (!categories[catKey]) {
                categories[catKey] = {
                    severity: null,
                    headline: '',
                    findings: [],
                    actions: [],
                    products: []
                };
            }

            var cat = categories[catKey];

            // Build a finding from topic sections
            var evidence = '';
            if (topic.sections && topic.sections.length > 0) {
                evidence = topic.sections.map(function (s) {
                    return (s.heading || s.title || '') + ': ' + (s.content || '');
                }).join(' ');
            }

            cat.findings.push({
                claim: (node && node.label) || topicId,
                evidence: evidence || (node && node.summary) || '',
                severity: (node && node.severity) || 'moderate'
            });

            // Track highest severity
            if (node && node.severity === 'critical') cat.severity = 'critical';
            else if (node && node.severity === 'high' && cat.severity !== 'critical') cat.severity = 'high';
        });

        return categories;
    }

    var categoryNames = {
        'contaminant': 'Contaminants',
        'health-effect': 'Health Effects',
        'solution': 'Solutions',
        'product': 'Products',
        'context': 'Context',
        'domain': 'Domains',
        'investigation': 'Investigations'
    };

    var categoryIcons = {
        'contaminant': '\u2666',
        'health-effect': '\u25C6',
        'solution': '\u25A0',
        'product': '\u25CF',
        'context': '\u25CB',
        'domain': '\u25C8',
        'investigation': '\u25C7'
    };

    function renderFindings(findings, container) {
        var html = '';

        var keys = Object.keys(findings);
        if (keys.length === 0) {
            html = '<div style="text-align:center; padding:2rem; color:#707070;">No findings available.</div>';
            container.innerHTML = html;
            return;
        }

        var categories = [];
        keys.forEach(function (key) {
            var cat = findings[key];
            categories.push({
                id: key,
                title: categoryNames[key] || key.replace(/-/g, ' ').toUpperCase(),
                severity: cat.severity,
                headline: cat.headline,
                findings: cat.findings || [],
                actions: cat.actions || [],
                products: cat.products || []
            });
        });

        // Topic filter buttons
        html += '<div class="topic-filters">';
        html += '<button class="topic-filter active" data-topic="all">ALL REPORTS</button>';
        categories.forEach(function (cat) {
            html += '<button class="topic-filter" data-topic="' + escapeAttr(cat.id) + '">';
            html += (categoryIcons[cat.id] || '\u25A0') + ' ' + escapeHtml(cat.title).toUpperCase();
            html += '</button>';
        });
        html += '</div>';

        categories.forEach(function (category) {
            html += '<div class="report-category" data-category="' + escapeAttr(category.id) + '">';

            // Category header
            html += '<div class="report-category-header">';
            html += '<h2 class="report-category-title">' + escapeHtml(category.title) + '</h2>';
            if (category.severity) {
                html += '<span class="severity-badge ' + escapeHtml(category.severity) + '">' + escapeHtml(category.severity) + '</span>';
            }
            html += '</div>';

            // Headline
            if (category.headline) {
                html += '<div class="report-headline">' + escapeHtml(category.headline) + '</div>';
            }

            // Findings
            if (category.findings.length > 0) {
                category.findings.forEach(function (finding, idx) {
                    var cardClass = 'finding-card';
                    if (finding.severity) cardClass += ' severity-' + finding.severity;

                    html += '<div class="' + cardClass + '" data-finding-index="' + idx + '">';

                    // Header (clickable to expand)
                    html += '<div class="finding-header">';
                    html += '<div class="finding-title-row">';
                    if (finding.severity) {
                        html += '<span class="severity-badge ' + escapeHtml(finding.severity) + '">' + escapeHtml(finding.severity) + '</span>';
                    }
                    html += '<span class="finding-title">' + escapeHtml(finding.claim || finding.title || '') + '</span>';
                    html += '</div>';
                    html += '<span class="finding-expand-icon">&rsaquo;</span>';
                    html += '</div>';

                    // Body (hidden by default)
                    html += '<div class="finding-body">';
                    if (finding.evidence) {
                        html += '<div class="finding-content">' + escapeHtml(finding.evidence) + '</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            }

            // Action items
            if (category.actions && category.actions.length > 0) {
                html += '<div class="action-items">';
                html += '<div class="action-items-title">Recommended Actions</div>';
                html += '<ol class="action-list">';
                category.actions.forEach(function (act) {
                    var text = act.action || act;
                    if (act.reason) text += ' -- ' + act.reason;
                    html += '<li>' + escapeHtml(text) + '</li>';
                });
                html += '</ol>';
                html += '</div>';
            }

            // Product recommendations
            if (category.products && category.products.length > 0) {
                html += '<div class="products-section">';
                html += '<div class="products-section-title">Top Products</div>';

                category.products.forEach(function (productCat) {
                    html += '<div class="product-category">';
                    html += '<h3 class="product-category-name">' + escapeHtml(productCat.category) + '</h3>';

                    if (productCat.picks && productCat.picks.length > 0) {
                        html += '<div class="product-picks">';
                        productCat.picks.forEach(function (pick) {
                            var rankClass = pick.rank === 1 ? ' top-pick' : '';
                            html += '<div class="product-card' + rankClass + '">';
                            html += '<div class="product-rank">#' + pick.rank + '</div>';
                            html += '<div class="product-info">';
                            html += '<div class="product-name">' + escapeHtml(pick.name) + '</div>';
                            html += '<div class="product-type">' + escapeHtml(pick.type) + '</div>';
                            var meta = [];
                            if (pick.price) meta.push(pick.price);
                            if (pick.score) meta.push(pick.score);
                            if (pick.annualCost) meta.push(pick.annualCost);
                            if (meta.length > 0) {
                                html += '<div class="product-meta">' + escapeHtml(meta.join(' \u00b7 ')) + '</div>';
                            }
                            if (pick.detail || pick.performance) {
                                html += '<div class="product-detail">' + escapeHtml(pick.detail || pick.performance) + '</div>';
                            }
                            if (pick.certifications) {
                                html += '<div class="product-certs">' + escapeHtml(pick.certifications) + '</div>';
                            }
                            html += '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                    }

                    if (productCat.avoid) {
                        html += '<div class="product-avoid collapsed">';
                        html += '<span class="avoid-label">AVOID:</span> ';
                        html += '<span class="avoid-toggle">[+]</span>';
                        html += '<span class="avoid-text">' + escapeHtml(productCat.avoid) + '</span>';
                        html += '</div>';
                    }

                    html += '</div>';
                });

                html += '</div>';
            }

            html += '</div>';
        });

        container.innerHTML = html;

        // Auto-expand first critical finding in each category
        container.querySelectorAll('.report-category').forEach(function (cat) {
            var firstCritical = cat.querySelector('.finding-card.severity-critical');
            var target = firstCritical || cat.querySelector('.finding-card');
            if (target) target.classList.add('expanded');
        });

        // Bind expand/collapse for finding cards
        container.querySelectorAll('.finding-header').forEach(function (header) {
            header.addEventListener('click', function () {
                var card = header.closest('.finding-card');
                card.classList.toggle('expanded');
            });
        });

        // Bind evidence toggle
        container.querySelectorAll('.evidence-toggle').forEach(function (toggle) {
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                toggle.classList.toggle('expanded');
                var section = toggle.nextElementSibling;
                if (section) section.classList.toggle('visible');
            });
        });

        // Bind avoid section toggle
        container.querySelectorAll('.product-avoid').forEach(function (avoidEl) {
            var label = avoidEl.querySelector('.avoid-label');
            var toggle = avoidEl.querySelector('.avoid-toggle');
            function flip() {
                var collapsed = avoidEl.classList.toggle('collapsed');
                if (toggle) toggle.textContent = collapsed ? '[+]' : '[\u2212]';
            }
            if (label) label.addEventListener('click', flip);
            if (toggle) toggle.addEventListener('click', flip);
        });

        // Bind topic filter buttons
        container.querySelectorAll('.topic-filter').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var topic = btn.getAttribute('data-topic');
                container.querySelectorAll('.topic-filter').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                container.querySelectorAll('.report-category').forEach(function (cat) {
                    if (topic === 'all') {
                        cat.style.display = '';
                    } else {
                        cat.style.display = cat.getAttribute('data-category') === topic ? '' : 'none';
                    }
                });
            });
        });
    }

    // ===================================
    // SEARCH
    // ===================================

    function bindSearch() {
        var searchInput = document.getElementById('research-search');
        if (!searchInput) return;

        var debounceTimer = null;

        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                var query = searchInput.value.trim();
                performSearch(query);
            }, 250);
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                searchInput.value = '';
                performSearch('');
                searchInput.blur();
            }
        });
    }

    function performSearch(query) {
        if (currentView === 'graph') {
            if (window.graphAPI) {
                if (query === '') {
                    window.graphAPI.resetHighlight();
                } else {
                    window.graphAPI.searchNodes(query);
                }
            }
        } else if (currentView === 'report') {
            filterReportFindings(query);
        }
    }

    function filterReportFindings(query) {
        var cards = document.querySelectorAll('.finding-card');
        var categories = document.querySelectorAll('.report-category');
        var lowerQuery = query.toLowerCase();

        if (!query) {
            cards.forEach(function (card) { card.style.display = ''; });
            categories.forEach(function (cat) { cat.style.display = ''; });
            return;
        }

        categories.forEach(function (cat) {
            var hasVisible = false;
            var catCards = cat.querySelectorAll('.finding-card');
            catCards.forEach(function (card) {
                var text = card.textContent.toLowerCase();
                var match = text.indexOf(lowerQuery) !== -1;
                card.style.display = match ? '' : 'none';
                if (match) hasVisible = true;
            });
            cat.style.display = hasVisible ? '' : 'none';
        });
    }

    // ===================================
    // KEYBOARD SHORTCUTS
    // ===================================

    function bindKeyboard() {
        document.addEventListener('keydown', function (e) {
            // ESC: close detail panel
            if (e.key === 'Escape' && detailPanelOpen) {
                closeDetailPanel();
                if (window.graphAPI) window.graphAPI.resetHighlight();
            }

            // Ctrl/Cmd+K: focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                var searchInput = document.getElementById('research-search');
                if (searchInput) searchInput.focus();
            }
        });

        var graphContainer = document.querySelector('.graph-container');
        if (graphContainer) {
            graphContainer.addEventListener('click', function (e) {
                // Let Cytoscape's background tap handler deal with this
            });
        }
    }

    // ===================================
    // UTILITIES
    // ===================================

    function formatStatLabel(key) {
        var spaced = key
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([a-zA-Z])(\d)/g, '$1 $2')
            .replace(/(\d)([a-zA-Z])/g, '$1 $2');
        return spaced.replace(/\b(ppb|ppm|ug|ewg|epa|mcl|bll|tthm|haa)\b/gi, function (m) {
            return m.toUpperCase();
        });
    }

    var GARBAGE_CITE_WORDS = /^(the|a|an|in|of|on|for|and|or|by|to|with|from|its|at|as|is|it|be|do|no|up|so|if|my|we|he|she|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|lead|period|directive|analysis|reviews|review|revision|facility|status|updated|welfare|council|comprehensive|commission|landmark|ban|triclosan|regulation|expulsion|secretary|trial|press|monograph|guide|pediatrics|opinion|finances|health|lancet|rapids|year|late|early)$/i;

    function isValidCitation(c) {
        var text = typeof c === 'string' ? c : (c.text || '');
        if (!text) return false;
        var core = text.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        if (!core) return false;
        if (core.indexOf(' ') === -1) {
            return !GARBAGE_CITE_WORDS.test(core);
        }
        return true;
    }

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

    function formatCitation(c) {
        if (typeof c === 'string') {
            return linkifyPmid(escapeHtml(c));
        }
        var text = c.text || '';
        var year = (c.year && text.indexOf(c.year) === -1) ? ' (' + c.year + ')' : '';
        var display = escapeHtml(text + year);

        if (c.pmid) {
            return '<a href="https://pubmed.ncbi.nlm.nih.gov/' + escapeAttr(c.pmid) + '/" target="_blank" rel="noopener" class="cite-link">' + display + ' \u2197</a>';
        }
        if (c.url) {
            return '<a href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener" class="cite-link">' + display + ' \u2197</a>';
        }
        return linkifyPmid(display);
    }

    function linkifyPmid(html) {
        return html.replace(/PMID\s*(\d{6,9})/g, function (match, id) {
            return '<a href="https://pubmed.ncbi.nlm.nih.gov/' + id + '/" target="_blank" rel="noopener" class="cite-link">' + match + ' \u2197</a>';
        });
    }

    // Export utilities for external use
    window.escapeHtml = escapeHtml;
    window.formatCitation = formatCitation;
    window.isValidCitation = isValidCitation;

    // ===================================
    // BOOT
    // ===================================

    // Listen for graph ready event from app.js
    document.addEventListener('researchlab:graphReady', function () {
        // Re-initialize when new graph data is loaded
        reportRendered = false;
        initialized = false;
        init();
    });

    // Also auto-init if graph data already present
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (window.researchGraph) init();
        });
    } else {
        if (window.researchGraph) init();
    }
})();
