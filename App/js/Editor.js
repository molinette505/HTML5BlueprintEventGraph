class Editor {
    constructor() {
        this.dom = {
            container: document.getElementById('graph-container'),
            nodesLayer: document.getElementById('nodes-layer'),
            connectionsLayer: document.getElementById('connections-layer'),
            transformLayer: document.getElementById('transform-layer'),
            contextMenu: document.getElementById('context-menu'),
            contextList: document.getElementById('context-list'),
            contextSearch: document.getElementById('context-search'),
            typesInput: document.getElementById('types-input'),
            nodesInput: document.getElementById('nodes-input')
        };
        
        this.graph = new Graph();
        this.renderer = new Renderer(this.graph, this.dom);
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        this.simulation = new Simulation(this.graph);

        // 1. Load Data
        this.importFileGlobals();
        this.populateUI();
        
        // 2. Bind Events
        document.getElementById('simulate-btn').onclick = () => this.simulation.run();
        
        const updateBtn = document.getElementById('update-lib-btn');
        if (updateBtn) updateBtn.onclick = () => this.applyFromUI();
        
        if(this.dom.contextSearch) {
            this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);
        }

        // --- NEW: Add Save/Load Buttons or Logic ---
        // For now, we auto-load if available, and add a Save shortcut/button if you want.
        // I will add a hidden logic or simple console exposure for now, 
        // or we can add a button to the toolbar in HTML later.
        // For tutorial purposes, let's auto-load if localStorage exists.
        
        const saved = localStorage.getItem('blueprints_save');
        if (saved) {
            this.loadGraph(saved);
        } else {
            this.initDemo();
        }

        // Auto-save every 30s? Or just manual. 
        // Let's bind Ctrl+S
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveGraph();
            }
        });
    }

    importFileGlobals() {
        window.typeDefinitions = {};
        if (window.globalDataTypes) {
            window.globalDataTypes.forEach(t => window.typeDefinitions[t.name] = t);
        }
        window.nodeTemplates = [];
        if (window.globalNodes) {
            window.nodeTemplates = JSON.parse(JSON.stringify(window.globalNodes));
        }
    }

    populateUI() {
        if (this.dom.typesInput && window.globalDataTypes) {
            this.dom.typesInput.value = JSON.stringify(window.globalDataTypes, null, 4);
        }
        if (this.dom.nodesInput && window.globalNodes) {
            this.dom.nodesInput.value = JSON.stringify(window.globalNodes, null, 4);
        }
    }

    applyFromUI() {
        if (!this.dom.typesInput || !this.dom.nodesInput) return;
        try {
            const rawTypes = this.dom.typesInput.value;
            const parsedTypes = JSON.parse(rawTypes);
            window.typeDefinitions = {};
            parsedTypes.forEach(t => window.typeDefinitions[t.name] = t);

            const rawNodes = this.dom.nodesInput.value;
            window.nodeTemplates = JSON.parse(rawNodes);
            
            const btn = document.getElementById('update-lib-btn');
            const originalText = btn.innerText;
            btn.innerText = "Saved!";
            setTimeout(() => btn.innerText = originalText, 1000);
        } catch(e) {
            alert("JSON Syntax Error: " + e.message);
        }
    }

    // --- SAVE / LOAD LOGIC ---

    saveGraph() {
        const json = JSON.stringify(this.graph.toJSON());
        localStorage.setItem('blueprints_save', json);
        console.log("Graph Saved to LocalStorage");
        
        // Notification
        const notif = document.getElementById('notification');
        notif.innerText = "Graph Saved!";
        notif.style.opacity = 1;
        setTimeout(() => notif.style.opacity = 0, 2000);
    }

    loadGraph(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            // Clear current
            this.graph.clear();
            this.dom.nodesLayer.innerHTML = '';
            this.dom.connectionsLayer.innerHTML = '';

            // Restore Viewport
            if (data.viewport) {
                this.graph.pan = { x: data.viewport.x, y: data.viewport.y };
                this.graph.scale = data.viewport.scale;
                this.renderer.updateTransform();
            }

            // Restore Counters
            if (data.counters) {
                this.graph.nextId = data.counters.nextId;
                this.graph.nextConnId = data.counters.nextConnId;
            }

            // Restore Nodes
            data.nodes.forEach(nData => {
                const template = window.nodeTemplates.find(t => t.name === nData.name);
                if (!template) return;

                // Manually construct to preserve ID
                const node = this.graph.addNode(template, nData.x, nData.y);
                node.id = nData.id; // Force ID match
                
                // Restore Inputs
                if (nData.inputs) {
                    nData.inputs.forEach(savedPin => {
                        const realPin = node.inputs.find(p => p.name === savedPin.name);
                        if (realPin) {
                            realPin.value = savedPin.value;
                            if (realPin.widget) realPin.widget.value = savedPin.value;
                        }
                    });
                }
                
                this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
            });

            // Restore Connections
            data.connections.forEach(c => {
                // Check validity
                const n1 = this.graph.nodes.find(n => n.id === c.fromNode);
                const n2 = this.graph.nodes.find(n => n.id === c.toNode);
                if (n1 && n2) {
                    this.graph.addConnection(c.fromNode, c.fromPin, c.toNode, c.toPin, c.type);
                }
            });

            this.renderer.render();
            console.log("Graph Loaded");

        } catch(e) {
            console.error("Failed to load graph", e);
            this.initDemo();
        }
    }

    initDemo() {
        if(!window.nodeTemplates) return;
        const t1 = window.nodeTemplates.find(n => n.name === "Event BeginPlay");
        const t2 = window.nodeTemplates.find(n => n.name === "Print String");
        
        if(t1 && t2) {
            const n1 = this.graph.addNode(t1, 100, 150);
            const n2 = this.graph.addNode(t2, 450, 150);
            
            this.renderer.createNodeElement(n1, (e,id) => this.interaction.handleNodeDown(e,id));
            this.renderer.createNodeElement(n2, (e,id) => this.interaction.handleNodeDown(e,id));
            
            this.graph.addConnection(n1.id, 0, n2.id, 0, 'exec');
            this.renderer.render();
        }
    }
    
    switchTab(tabName) {
        const buttons = document.querySelectorAll('.tab');
        buttons.forEach(b => b.classList.remove('active'));
        if(tabName === 'graph') buttons[0].classList.add('active');
        else buttons[1].classList.add('active');

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        if(tabName === 'graph') document.getElementById('graph-view').classList.add('active');
        else document.getElementById('settings-view').classList.add('active');
    }
}

window.onload = () => { window.App = new Editor(); };