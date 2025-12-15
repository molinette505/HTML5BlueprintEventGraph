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
            btnStop: document.getElementById('btn-stop'),
            
            // Developer Mode Inputs (Safety check in case elements are missing)
            typesInput: document.getElementById('types-input'),
            nodesInput: document.getElementById('nodes-input')
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

        // 4. PHASE 2: Load Data from Memory -> UI (Developer Mode)
        this.populateUI();
        
        // 5. Bind Events
        
        // --- Play Button Logic ---
        if (this.dom.btnPlay) {
            this.dom.btnPlay.onclick = () => {
                if(this.simulation.status === 'PAUSED') this.simulation.resume();
                else this.simulation.start();
            };
        }
        
        // --- Pause / Start Paused Logic ---
        if (this.dom.btnPause) {
            this.dom.btnPause.onclick = () => {
                if (this.simulation.status === 'STOPPED') {
                    this.simulation.startPaused();
                } else {
                    this.simulation.pause();
                }
            };
        }

        // --- Stepping Logic ---
        if (this.dom.btnStep) this.dom.btnStep.onclick = () => this.simulation.step();
        if (this.dom.btnReplay) this.dom.btnReplay.onclick = () => this.simulation.replayStep();
        if (this.dom.btnStop) this.dom.btnStop.onclick = () => this.simulation.stop();
        
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

        this.initDemo();
    }

    /**
     * Updates the Toolbar buttons based on the Simulation State.
     */
    updateControls(status) {
        const d = this.dom;
        if (!d.btnPlay) return; // Guard against missing DOM

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

    populateUI() {
        if (this.dom.typesInput && window.globalDataTypes) {
            this.dom.typesInput.value = JSON.stringify(window.globalDataTypes, null, 4);
        }
        if (this.dom.nodesInput && window.globalNodes) {
            this.dom.nodesInput.value = JSON.stringify(window.globalNodes, null, 4);
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

        // Position isn't critical here because layoutNodes will override it
        const nEvent = this.graph.addNode(tEvent, 50, 50);
        const nBranch = this.graph.addNode(tBranch, 300, 50);
        
        const nFloat = this.graph.addNode(tMakeFloat, 50, 200);
        if(nFloat.inputs[0].widget) nFloat.inputs[0].widget.value = 5.0; 

        const nAdd = this.graph.addNode(tAdd, 250, 200);
        
        // [FIX] Explicitly resolve Wildcard -> Float for the demo
        nAdd.inputs.forEach(p => p.setType('float'));
        nAdd.outputs.forEach(p => p.setType('float'));

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
            // [FIX] Using the correct interaction method: handleNodeDown
            if(n) this.renderer.createNodeElement(n, (e,id) => this.interaction.handleNodeDown(e,id));
        });

        this.graph.addConnection(nEvent.id, 0, nBranch.id, 0, 'exec');
        if(nTrue) this.graph.addConnection(nBranch.id, 0, nTrue.id, 0, 'exec'); 
        if(nFalse) this.graph.addConnection(nBranch.id, 1, nFalse.id, 0, 'exec'); 

        this.graph.addConnection(nFloat.id, 0, nAdd.id, 0, 'float');
        this.graph.addConnection(nAdd.id, 0, nGeq.id, 0, 'float');
        this.graph.addConnection(nGeq.id, 0, nBranch.id, 1, 'boolean');

        // [CRITICAL FIX] 
        // 1. Commented out layoutNodes because it does NOT exist in Interaction.js and was causing a crash.
        // const demoNodes = [nEvent, nBranch, nFloat, nAdd, nGeq, nTrue, nFalse].filter(n => !!n);
        // this.interaction.layoutNodes(demoNodes);

        // 2. Added setTimeout. This ensures the DOM elements are painted 
        //    before we try to calculate wire positions. Without this, wires are invisible (0,0).
        setTimeout(() => {
            this.renderer.render();
        }, 50);
    }
}

window.onload = () => { window.App = new Editor(); };