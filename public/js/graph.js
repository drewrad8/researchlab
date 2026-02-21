/* ===================================
   RESEARCHLAB — Graph Initialization
   Cytoscape.js + Cola force-directed layout
   =================================== */

(function () {
    'use strict';

    var cy = null;
    var selectedNode = null;

    function getNodeColor(type) {
        var colors = {
            'contaminant':   { bg: '#8b2020', border: '#c03030', text: '#e0d0d0' },
            'health-effect': { bg: '#a67c1a', border: '#d4a830', text: '#e0d8c0' },
            'solution':      { bg: '#1a6b1a', border: '#2a9b2a', text: '#c0e0c0' },
            'product':       { bg: '#0a8a8a', border: '#00c8d4', text: '#c0e0e0' },
            'context':       { bg: '#505050', border: '#707070', text: '#c0c0c0' },
            'domain':        { bg: '#d4a830', border: '#f0c040', text: '#1a1a10' }
        };
        return colors[type] || colors['context'];
    }

    function getBorderWidth(severity) {
        if (severity === 'critical') return 3;
        if (severity === 'high') return 2;
        return 1;
    }

    function getNodeSize(type) {
        if (type === 'domain') return 50;
        return 30;
    }

    function getEdgeStyle(type) {
        if (type === 'causation') return 'solid';
        if (type === 'evidence') return 'dashed';
        if (type === 'composition') return 'dotted';
        return 'solid';
    }

    function buildElements() {
        var data = window.researchGraph;
        if (!data) return { nodes: [], edges: [] };

        var nodes = (data.nodes || []).map(function (n) {
            var el = {
                data: {
                    id: n.id,
                    label: n.label || n.id,
                    type: n.type || 'context',
                    severity: n.severity || 'moderate',
                    summary: n.summary || ''
                }
            };
            if (n.parent) {
                el.data.parent = n.parent;
            }
            return el;
        });

        var edges = (data.edges || []).map(function (e) {
            return {
                data: {
                    id: e.id || (e.source + '-' + e.target),
                    source: e.source,
                    target: e.target,
                    label: e.label || '',
                    type: e.type || 'evidence',
                    citation: e.citation || ''
                }
            };
        });

        return { nodes: nodes, edges: edges };
    }

    function buildStylesheet() {
        return [
            // Base node style
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'font-family': "'Courier New', monospace",
                    'font-size': '10px',
                    'color': '#c0c0c0',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'text-margin-y': '8px',
                    'text-outline-color': '#050507',
                    'text-outline-width': '2px',
                    'width': 38,
                    'height': 38,
                    'shape': 'diamond',
                    'background-color': '#505050',
                    'border-width': 1,
                    'border-color': '#707070',
                    'overlay-padding': '4px',
                    'overlay-opacity': 0,
                    'transition-property': 'background-color, border-color, border-width, opacity, width, height',
                    'transition-duration': '0.2s'
                }
            },
            // Compound / parent nodes
            {
                selector: ':parent',
                style: {
                    'shape': 'roundrectangle',
                    'background-opacity': 0.04,
                    'border-opacity': 0.2,
                    'border-style': 'dashed',
                    'text-valign': 'top',
                    'text-halign': 'center',
                    'font-family': "'Cinzel', Georgia, serif",
                    'font-size': '9px',
                    'font-weight': 'bold',
                    'padding': '20px',
                    'text-margin-y': '-6px',
                    'color': '#606060'
                }
            },
            // Node types
            {
                selector: 'node[type="contaminant"]',
                style: {
                    'background-color': '#8b2020',
                    'border-color': '#c03030',
                    'color': '#e0d0d0'
                }
            },
            {
                selector: 'node[type="health-effect"]',
                style: {
                    'background-color': '#a67c1a',
                    'border-color': '#d4a830',
                    'color': '#e0d8c0'
                }
            },
            {
                selector: 'node[type="solution"]',
                style: {
                    'background-color': '#1a6b1a',
                    'border-color': '#2a9b2a',
                    'color': '#c0e0c0'
                }
            },
            {
                selector: 'node[type="product"]',
                style: {
                    'background-color': '#0a8a8a',
                    'border-color': '#00c8d4',
                    'color': '#c0e0e0'
                }
            },
            {
                selector: 'node[type="context"]',
                style: {
                    'background-color': '#505050',
                    'border-color': '#707070',
                    'color': '#c0c0c0'
                }
            },
            {
                selector: 'node[type="domain"]',
                style: {
                    'background-color': '#d4a830',
                    'border-color': '#f0c040',
                    'color': '#d4a830',
                    'width': 52,
                    'height': 52,
                    'shape': 'diamond',
                    'font-family': "'Cinzel', Georgia, serif",
                    'font-size': '11px',
                    'font-weight': 'bold',
                    'text-max-width': '120px'
                }
            },
            {
                selector: 'node[type="investigation"]',
                style: {
                    'background-color': '#4a1a5e',
                    'border-color': '#7030a0',
                    'color': '#b090c0',
                    'shape': 'diamond'
                }
            },
            // Severity: critical
            {
                selector: 'node[severity="critical"]',
                style: {
                    'border-width': 3,
                    'overlay-opacity': 0.08,
                    'overlay-color': '#6b1a1a'
                }
            },
            // Severity: high
            {
                selector: 'node[severity="high"]',
                style: {
                    'border-width': 2
                }
            },
            // Base edge style
            {
                selector: 'edge',
                style: {
                    'width': 1,
                    'line-color': '#303040',
                    'target-arrow-color': '#303040',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 0.6,
                    'curve-style': 'bezier',
                    'opacity': 0.5,
                    'font-size': '7px',
                    'color': '#707070',
                    'text-rotation': 'autorotate',
                    'text-margin-y': '-6px',
                    'transition-property': 'line-color, target-arrow-color, width, opacity',
                    'transition-duration': '0.2s'
                }
            },
            // Edge types
            {
                selector: 'edge[type="causation"]',
                style: {
                    'line-style': 'solid',
                    'line-color': '#504030',
                    'target-arrow-color': '#504030'
                }
            },
            {
                selector: 'edge[type="evidence"]',
                style: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [6, 3]
                }
            },
            {
                selector: 'edge[type="composition"]',
                style: {
                    'line-style': 'dotted',
                    'line-dash-pattern': [2, 4]
                }
            },
            {
                selector: 'edge[type="solution"]',
                style: {
                    'line-color': '#1a4a1a',
                    'target-arrow-color': '#1a4a1a',
                    'line-style': 'solid'
                }
            },
            {
                selector: 'edge[type="gap"]',
                style: {
                    'line-color': '#5a1a1a',
                    'target-arrow-color': '#5a1a1a',
                    'line-style': 'dashed',
                    'line-dash-pattern': [8, 4]
                }
            },
            {
                selector: 'edge[type="context"]',
                style: {
                    'line-color': '#353545',
                    'target-arrow-color': '#353545',
                    'line-style': 'dotted'
                }
            },
            {
                selector: 'edge[type="investigation"]',
                style: {
                    'line-color': '#3a1a4e',
                    'target-arrow-color': '#3a1a4e',
                    'line-style': 'dashed'
                }
            },
            // Hover states
            {
                selector: 'node:active',
                style: {
                    'overlay-opacity': 0.12,
                    'overlay-color': '#a67c1a'
                }
            },
            {
                selector: 'edge:active',
                style: {
                    'overlay-opacity': 0.08,
                    'overlay-color': '#a67c1a'
                }
            },
            // Highlighted class (connected to selected node)
            {
                selector: 'node.highlighted',
                style: {
                    'border-width': 3,
                    'overlay-opacity': 0.06,
                    'overlay-color': '#a67c1a'
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 2,
                    'line-color': '#a67c1a',
                    'target-arrow-color': '#a67c1a',
                    'opacity': 0.9,
                    'label': 'data(label)'
                }
            },
            // Dimmed class (unconnected when a node is selected)
            {
                selector: 'node.dimmed',
                style: {
                    'opacity': 0.2
                }
            },
            {
                selector: 'edge.dimmed',
                style: {
                    'opacity': 0.08
                }
            },
            // Selected node
            {
                selector: 'node.selected',
                style: {
                    'border-width': 3,
                    'border-color': '#d4a830',
                    'overlay-opacity': 0.1,
                    'overlay-color': '#d4a830'
                }
            },
            // Search match
            {
                selector: 'node.search-match',
                style: {
                    'border-width': 3,
                    'border-color': '#00c8d4',
                    'overlay-opacity': 0.12,
                    'overlay-color': '#0a8a8a'
                }
            }
        ];
    }

    function initGraph() {
        if (!window.researchGraph) {
            console.warn('No research graph data found (window.researchGraph)');
            return;
        }

        var elements = buildElements();
        var container = document.getElementById('cy');

        if (!container) return;

        cy = cytoscape({
            container: container,
            elements: elements,
            style: buildStylesheet(),
            layout: {
                name: 'cola',
                animate: true,
                animationDuration: 1000,
                maxSimulationTime: 4000,
                nodeSpacing: function () { return 55; },
                edgeLength: function (edge) {
                    var type = edge.data('type');
                    if (type === 'composition') return 90;
                    if (type === 'solution') return 200;
                    if (type === 'gap') return 180;
                    return 160;
                },
                avoidOverlap: true,
                convergenceThreshold: 0.01,
                handleDisconnected: true,
                fit: true,
                padding: 50
            },
            minZoom: 0.3,
            maxZoom: 3,
            wheelSensitivity: 0.3,
            boxSelectionEnabled: false,
            autounselectify: true
        });

        // Update node + edge counts in system message
        var nodeCountEl = document.getElementById('node-count');
        var edgeCountEl = document.getElementById('edge-count');
        if (nodeCountEl) nodeCountEl.textContent = cy.nodes().length;
        if (edgeCountEl) edgeCountEl.textContent = cy.edges().length;

        bindEvents();
        bindControls();
        exportAPI();
    }

    function bindEvents() {
        // Click on node: select, highlight neighbors, open detail panel
        cy.on('tap', 'node', function (evt) {
            var node = evt.target;

            // Skip compound parent nodes for selection
            if (node.isParent()) return;

            selectNode(node);

            // Dispatch event for research.js to render detail panel
            var event = new CustomEvent('graph:nodeSelected', {
                detail: { nodeId: node.id(), nodeData: node.data() }
            });
            document.dispatchEvent(event);
        });

        // Click on background: deselect
        cy.on('tap', function (evt) {
            if (evt.target === cy) {
                deselectAll();
                var event = new CustomEvent('graph:backgroundTap');
                document.dispatchEvent(event);
            }
        });

        // Edge hover: show label
        cy.on('mouseover', 'edge', function (evt) {
            evt.target.style('label', evt.target.data('label'));
            evt.target.style('opacity', 0.9);
            evt.target.style('width', 2);
        });

        cy.on('mouseout', 'edge', function (evt) {
            if (!evt.target.hasClass('highlighted')) {
                evt.target.style('label', '');
                evt.target.style('opacity', 0.5);
                evt.target.style('width', 1);
            }
        });
    }

    function selectNode(node) {
        deselectAll();
        selectedNode = node;

        // Mark selected node
        node.addClass('selected');

        // Get connected edges and neighbor nodes
        var connectedEdges = node.connectedEdges();
        var neighbors = node.neighborhood('node');

        // Highlight connected elements
        connectedEdges.addClass('highlighted');
        neighbors.addClass('highlighted');

        // Dim everything else
        cy.elements().not(node).not(connectedEdges).not(neighbors).addClass('dimmed');
    }

    function deselectAll() {
        if (!cy) return;
        selectedNode = null;
        cy.elements().removeClass('selected highlighted dimmed search-match');
    }

    function bindControls() {
        var zoomIn = document.getElementById('zoom-in');
        var zoomOut = document.getElementById('zoom-out');
        var fitGraph = document.getElementById('fit-graph');

        if (zoomIn) {
            zoomIn.addEventListener('click', function () {
                cy.animate({ zoom: cy.zoom() * 1.3, duration: 200 });
            });
        }

        if (zoomOut) {
            zoomOut.addEventListener('click', function () {
                cy.animate({ zoom: cy.zoom() / 1.3, duration: 200 });
            });
        }

        if (fitGraph) {
            fitGraph.addEventListener('click', function () {
                cy.animate({ fit: { padding: 40 }, duration: 400 });
            });
        }
    }

    function exportAPI() {
        window.graphAPI = {
            highlightNode: function (nodeId) {
                if (!cy) return;
                var node = cy.getElementById(nodeId);
                if (node.length > 0) {
                    selectNode(node);
                    cy.animate({
                        center: { eles: node },
                        zoom: 1.5,
                        duration: 400
                    });
                }
            },

            resetHighlight: function () {
                deselectAll();
            },

            getNode: function (nodeId) {
                if (!cy) return null;
                var node = cy.getElementById(nodeId);
                return node.length > 0 ? node : null;
            },

            searchNodes: function (query) {
                if (!cy) return [];
                deselectAll();

                if (!query || query.trim() === '') return [];

                var lowerQuery = query.toLowerCase();
                var matches = [];

                cy.nodes().forEach(function (node) {
                    var label = (node.data('label') || '').toLowerCase();
                    var summary = (node.data('summary') || '').toLowerCase();
                    if (label.indexOf(lowerQuery) !== -1 || summary.indexOf(lowerQuery) !== -1) {
                        node.addClass('search-match');
                        matches.push(node);
                    } else {
                        node.addClass('dimmed');
                    }
                });

                cy.edges().addClass('dimmed');

                // If only one match, center on it
                if (matches.length === 1) {
                    cy.animate({
                        center: { eles: matches[0] },
                        duration: 400
                    });
                } else if (matches.length > 1) {
                    var collection = cy.collection();
                    matches.forEach(function (m) { collection = collection.union(m); });
                    cy.animate({
                        fit: { eles: collection, padding: 60 },
                        duration: 400
                    });
                }

                return matches;
            },

            getConnectedNodes: function (nodeId) {
                if (!cy) return [];
                var node = cy.getElementById(nodeId);
                if (node.length === 0) return [];

                var result = [];
                node.connectedEdges().forEach(function (edge) {
                    var sourceId = edge.data('source');
                    var targetId = edge.data('target');
                    var otherId = sourceId === nodeId ? targetId : sourceId;
                    var otherNode = cy.getElementById(otherId);
                    if (otherNode.length > 0) {
                        result.push({
                            id: otherId,
                            label: otherNode.data('label'),
                            type: otherNode.data('type'),
                            edgeLabel: edge.data('label'),
                            edgeType: edge.data('type'),
                            citation: edge.data('citation'),
                            direction: sourceId === nodeId ? 'outgoing' : 'incoming'
                        });
                    }
                });
                return result;
            },

            getCy: function () {
                return cy;
            }
        };
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGraph);
    } else {
        initGraph();
    }

    // Re-initialize when SPA loads new graph data
    document.addEventListener('researchlab:graphReady', function () {
        if (cy) {
            cy.destroy();
            cy = null;
        }
        selectedNode = null;
        initGraph();
    });
})();
