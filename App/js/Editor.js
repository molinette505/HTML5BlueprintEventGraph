class Editor {
    constructor() {
        // 1. Cache DOM elements
        this.dom = {
            container: document.getElementById('graph-container'),
            nodesLayer: document.getElementById('nodes-layer'),
            connectionsLayer: document.getElementById('connections-layer'),
            transformLayer: document.getElementById('transform-layer'),
            contextMenu: document.getElementById('context-menu'),
            contextList: document.getElementById('context-list'),
            contextSearch: document.getElementById('context-search'),
            
            // Simulation Controls
            btnPlay: document.getElementById('btn-play'),
            btnPause: document.getElementById('btn-pause'),
            btnStep: document.getElementById('btn-step'),
            btnReplay: document.getElementById('btn-replay'),
            btnStop: document.getElementById('btn-stop')
        };
        
        // 2. Initialize Logic Systems
        this.graph = new Graph();
        this.renderer = new Renderer(this.graph, this.dom);
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        
        // Pass renderer to Simulation so it can trigger wire animations
        this.simulation = new Simulation(this.graph, this.renderer);

        // Bind State Change for UI Updates (Button states)
        this.simulation.onStateChange = (status) => this.updateControls(status);

        // 3. PHASE 1: Load Data from Files -> Memory
        this.importFileGlobals();
        
        // 4. Bind Events
        
        // --- Play Button Logic ---
        this.dom.btnPlay.onclick = () => {
            if(this.simulation.status === 'PAUSED') this.simulation.resume();
            else this.simulation.start();
        };
        
        // --- Pause / Start Paused Logic ---
        this.dom.btnPause.onclick = () => {
            if (this.simulation.status === 'STOPPED') {
                this.simulation.startPaused();
            } else {
                this.simulation.pause();
            }
        };

        // --- Stepping Logic ---
        this.dom.btnStep.onclick = () => this.simulation.step();
        this.dom.btnReplay.onclick = () => this.simulation.replayStep();
        this.dom.btnStop.onclick = () => this.simulation.stop();
        
        // Initialize Controls State
        this.updateControls(this.simulation.status);
        
        // Context Menu Search Filter
        if(this.dom.contextSearch) {
            this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);
        }

        // --- PERSISTENCE ---
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveGraph();
            }
        });

        // Load saved state or default
        const saved = localStorage.getItem('blueprints_save');
        if (saved) {
            this.loadGraph(saved);
        } else {
            this.initDemo();
        }
    }

    /**
     * Updates the Toolbar buttons based on the Simulation State.
     */
    updateControls(status) {
        const d = this.dom;
        const iconStartPaused = `<svg viewBox="0 0 24 24"><path d="M6 5v14l9-7z M17 5v14h2V5z"/></svg>`;
        const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

        if (status === 'STOPPED') {
            d.btnPlay.disabled = false;
            d.btnPlay.title = "Play";
            
            d.btnPause.disabled = false;
            d.btnPause.innerHTML = iconStartPaused; 
            d.btnPause.title = "Start Paused"; 
            
            d.btnReplay.disabled = true; 
            d.btnStep.disabled = false; 
            d.btnStop.disabled = true;
        } 
        else if (status === 'RUNNING') {
            d.btnPlay.disabled = true;
            d.btnPause.disabled = false;
            d.btnPause.innerHTML = iconPause; 
            d.btnPause.title = "Pause";
            
            d.btnReplay.disabled = true; 
            d.btnStep.disabled = true; 
            d.btnStop.disabled = false;
        } 
        else if (status === 'PAUSED') {
            d.btnPlay.disabled = false; 
            d.btnPlay.title = "Resume";
            d.btnPause.disabled = true; 
            d.btnReplay.disabled = !this.simulation.lastProcessedItem;
            d.btnStep.disabled = false;
            d.btnStop.disabled = false;
        }
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

    // --- SAVE / LOAD ---

    saveGraph() {
        const json = JSON.stringify(this.graph.toJSON());
        localStorage.setItem('blueprints_save', json);
        console.log("Graph Saved");
    }

    loadGraph(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this.graph.clear();
            this.dom.nodesLayer.innerHTML = '';
            this.dom.connectionsLayer.innerHTML = '';

            if (data.viewport) {
                this.graph.pan = { x: data.viewport.x, y: data.viewport.y };
                this.graph.scale = data.viewport.scale;
                this.renderer.updateTransform();
            }

            if (data.counters) {
                this.graph.nextId = data.counters.nextId;
                this.graph.nextConnId = data.counters.nextConnId;
            }

            data.nodes.forEach(nData => {
                const template = window.nodeTemplates.find(t => t.name === nData.name);
                if (!template) return;

                const node = this.graph.addNode(template, nData.x, nData.y);
                node.id = nData.id; 
                
                // [FIX 1] Restore Pin Types FIRST
                if (nData.pinTypes) {
                    if (nData.pinTypes.inputs) {
                        nData.pinTypes.inputs.forEach((type, idx) => {
                            if (node.inputs[idx] && type && node.inputs[idx].type !== type) {
                                node.inputs[idx].setType(type);
                            }
                        });
                    }
                    if (nData.pinTypes.outputs) {
                        nData.pinTypes.outputs.forEach((type, idx) => {
                            if (node.outputs[idx] && type && node.outputs[idx].type !== type) {
                                node.outputs[idx].setType(type);
                            }
                        });
                    }
                }

                // [FIX 2] Restore Widget Values SECOND
                if (nData.inputs) {
                    nData.inputs.forEach((savedPin, index) => {
                        const realPin = node.inputs[index];
                        if (realPin) {
                            realPin.value = savedPin.value;
                            if (realPin.widget) {
                                realPin.widget.value = savedPin.value;
                            }
                        }
                    });
                }
                
                this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
            });

            data.connections.forEach(c => {
                const n1 = this.graph.nodes.find(n => n.id === c.fromNode);
                const n2 = this.graph.nodes.find(n => n.id === c.toNode);
                if (n1 && n2) {
                    this.graph.addConnection(c.fromNode, c.fromPin, c.toNode, c.toPin, c.type);
                }
            });

            this.renderer.render();

        } catch(e) {
            console.error("Failed to load graph", e);
            this.initDemo();
        }
    }

    initDemo() {
        if(!window.nodeTemplates) return;
        
        const tEvent = window.nodeTemplates.find(n => n.name === "Event BeginPlay");
        const tMakeFloat = window.nodeTemplates.find(n => n.name === "Make Float");
        const tAdd = window.nodeTemplates.find(n => n.name === "Add");
        const tGeq = window.nodeTemplates.find(n => n.name === "Greater Equal (>=)");
        const tBranch = window.nodeTemplates.find(n => n.name === "Branch");
        const tPrint = window.nodeTemplates.find(n => n.name === "Print String");

        if(!tEvent || !tMakeFloat || !tAdd || !tGeq || !tBranch) return;

        const nEvent = this.graph.addNode(tEvent, 50, 50);
        const nBranch = this.graph.addNode(tBranch, 300, 50);
        
        const nFloat = this.graph.addNode(tMakeFloat, 50, 200);
        if(nFloat.inputs[0].widget) nFloat.inputs[0].widget.value = 5.0; 

        const nAdd = this.graph.addNode(tAdd, 250, 200);
        if(nAdd.inputs[1].widget) nAdd.inputs[1].widget.value = 10.0; 

        const nGeq = this.graph.addNode(tGeq, 450, 200);
        if(nGeq.inputs[1].widget) nGeq.inputs[1].widget.value = 12.0; 

        let nTrue, nFalse;
        if(tPrint) {
            nTrue = this.graph.addNode(tPrint, 550, 20);
            if(nTrue.inputs[1].widget) nTrue.inputs[1].widget.value = "True: >= 12";
            
            nFalse = this.graph.addNode(tPrint, 550, 150);
            if(nFalse.inputs[1].widget) nFalse.inputs[1].widget.value = "False: < 12";
        }

        [nEvent, nBranch, nFloat, nAdd, nGeq, nTrue, nFalse].forEach(n => {
            if(n) this.renderer.createNodeElement(n, (e,id) => this.interaction.handleNodeDown(e,id));
        });

        this.graph.addConnection(nEvent.id, 0, nBranch.id, 0, 'exec');
        if(nTrue) this.graph.addConnection(nBranch.id, 0, nTrue.id, 0, 'exec'); 
        if(nFalse) this.graph.addConnection(nBranch.id, 1, nFalse.id, 0, 'exec'); 

        this.graph.addConnection(nFloat.id, 0, nAdd.id, 0, 'float');
        this.graph.addConnection(nAdd.id, 0, nGeq.id, 0, 'float');
        this.graph.addConnection(nGeq.id, 0, nBranch.id, 1, 'boolean');

        this.renderer.render();
    }
}

window.onload = () => { window.App = new Editor(); };