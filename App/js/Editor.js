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
            
            // Buttons
            btnPlay: document.getElementById('btn-play'),
            btnPause: document.getElementById('btn-pause'),
            btnStep: document.getElementById('btn-step'),
            btnStop: document.getElementById('btn-stop')
        };
        
        this.graph = new Graph();
        this.renderer = new Renderer(this.graph, this.dom);
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        this.simulation = new Simulation(this.graph, this.renderer);

        this.simulation.onStateChange = (status) => this.updateControls(status);

        this.importFileGlobals();
        
        // Bind Controls
        this.dom.btnPlay.onclick = () => {
            if(this.simulation.status === 'PAUSED') this.simulation.resume();
            else this.simulation.start();
        };
        
        this.dom.btnPause.onclick = () => {
            if (this.simulation.status === 'STOPPED') {
                this.simulation.startPaused();
            } else {
                this.simulation.pause();
            }
        };

        this.dom.btnStep.onclick = () => this.simulation.step();
        this.dom.btnStop.onclick = () => this.simulation.stop();
        
        // Initialize Controls State
        this.updateControls(this.simulation.status);
        
        if(this.dom.contextSearch) {
            this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);
        }

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveGraph();
            }
        });

        const saved = localStorage.getItem('blueprints_save');
        if (saved) {
            this.loadGraph(saved);
        } else {
            this.initDemo();
        }
    }

    updateControls(status) {
        const d = this.dom;
        const iconStartPaused = `<svg viewBox="0 0 24 24"><path d="M6 5v14l9-7z M17 5v14h2V5z"/></svg>`;
        const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

        if (status === 'STOPPED') {
            d.btnPlay.disabled = false;
            d.btnPlay.title = "Play";
            
            // Enable Pause button as "Start Paused"
            d.btnPause.disabled = false;
            d.btnPause.innerHTML = iconStartPaused; // Set Icon: Play+Bar
            d.btnPause.title = "Start Paused"; 
            
            d.btnStep.disabled = false; 
            d.btnStep.title = "Start & Step";

            d.btnStop.disabled = true;
        } 
        else if (status === 'RUNNING') {
            d.btnPlay.disabled = true;
            
            d.btnPause.disabled = false;
            d.btnPause.innerHTML = iconPause; // Set Icon: Standard Pause
            d.btnPause.title = "Pause";
            
            d.btnStep.disabled = true; 
            d.btnStop.disabled = false;
        } 
        else if (status === 'PAUSED') {
            d.btnPlay.disabled = false; 
            d.btnPlay.title = "Resume";
            
            d.btnPause.disabled = true; 
            
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
                
                if (nData.inputs) {
                    nData.inputs.forEach(savedPin => {
                        const realPin = node.inputs.find(p => p.name === savedPin.name);
                        if (realPin) {
                            realPin.value = savedPin.value;
                            if (realPin.widget) realPin.widget.value = savedPin.value;
                        }
                    });
                }

                if (nData.pinTypes) {
                    if (nData.pinTypes.inputs) {
                        nData.pinTypes.inputs.forEach((type, idx) => {
                            if (node.inputs[idx] && type) node.inputs[idx].setType(type);
                        });
                    }
                    if (nData.pinTypes.outputs) {
                        nData.pinTypes.outputs.forEach((type, idx) => {
                            if (node.outputs[idx] && type) node.outputs[idx].setType(type);
                        });
                    }
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
        const t1 = window.nodeTemplates.find(n => n.name === "Event BeginPlay");
        const t2 = window.nodeTemplates.find(n => n.name === "Print String");
        const t3 = window.nodeTemplates.find(n => n.name === "Spawn Actor From Class");
        
        if(t1 && t2) {
            const n1 = this.graph.addNode(t1, 100, 150);
            const n2 = this.graph.addNode(t2, 450, 150);
            
            if(t3) {
                 const n3 = this.graph.addNode(t3, 100, 350);
                 this.renderer.createNodeElement(n3, (e,id) => this.interaction.handleNodeDown(e,id));
            }

            this.renderer.createNodeElement(n1, (e,id) => this.interaction.handleNodeDown(e,id));
            this.renderer.createNodeElement(n2, (e,id) => this.interaction.handleNodeDown(e,id));
            
            this.graph.addConnection(n1.id, 0, n2.id, 0, 'exec');
            this.renderer.render();
        }
    }
}

window.onload = () => { window.App = new Editor(); };