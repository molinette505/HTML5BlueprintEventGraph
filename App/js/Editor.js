/**
 * Editor Class
 * Acts as the main entry point and "Glue" for the application.
 * It initializes all the subsystems (Graph, Renderer, Interaction, etc.)
 * and wires up the UI (Toolbar, Drag & Drop).
 */
class Editor {
    constructor() {
        // 1. Cache all DOM elements we need to interact with
        this.dom = {
            container: document.getElementById('graph-container'),
            nodesLayer: document.getElementById('nodes-layer'),
            connectionsLayer: document.getElementById('connections-layer'),
            transformLayer: document.getElementById('transform-layer'),
            contextMenu: document.getElementById('context-menu'),
            contextList: document.getElementById('context-list'),
            contextSearch: document.getElementById('context-search'),
            variablePanel: document.getElementById('variable-panel'),
            btnToggleVars: document.getElementById('btn-toggle-vars'),
            
            // Simulation Toolbar Buttons
            btnPlay: document.getElementById('btn-play'),
            btnPause: document.getElementById('btn-pause'),
            btnStep: document.getElementById('btn-step'),
            btnReplay: document.getElementById('btn-replay'),
            btnStop: document.getElementById('btn-stop')
        };
        
        // 2. Instantiate the Core Systems
        this.graph = new Graph(); // The Data Model
        this.renderer = new Renderer(this.graph, this.dom); // The Visual System
        
        // The Interaction Controller (Inputs, Clicks, Drags)
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        
        // The Execution Engine
        this.simulation = new Simulation(this.graph, this.renderer);
        
        // The Variable/Property Manager
        this.variableManager = new VariableManager(this);

        // 3. Bind Simulation Events
        // When the simulation runs/stops, update the toolbar buttons (Play/Pause icons)
        this.simulation.onStateChange = (status) => this.updateControls(status);

        // 4. Run Setup Routines
        this.importFileGlobals(); // Load node definitions from window
        this.setupToolbar();      // Click listeners for UI buttons
        this.setupDragDrop();     // Allow dragging variables onto canvas
        
        // 5. Load the Default Demo
        this.initDemo();
    }

    /**
     * Wires up the buttons in the top toolbar (Variables, Play, Pause, etc.)
     */
    setupToolbar() {
        // Toggle the Variable Side Panel
        if (this.dom.btnToggleVars) {
            this.dom.btnToggleVars.onclick = () => {
                this.dom.variablePanel.classList.toggle('visible');
                // Change button color to indicate active state
                if(this.dom.variablePanel.classList.contains('visible')) {
                    this.dom.btnToggleVars.style.background = '#36a55d';
                } else {
                    this.dom.btnToggleVars.style.background = '';
                }
            };
        }

        // Play Button Logic
        if (this.dom.btnPlay) {
            this.dom.btnPlay.onclick = () => {
                // If paused, just resume. Otherwise, start from scratch.
                if(this.simulation.status === 'PAUSED') this.simulation.resume();
                else this.simulation.start();
            };
        }

        // Pause Button Logic
        if (this.dom.btnPause) {
            this.dom.btnPause.onclick = () => {
                // If stopped, "Step 0" (Start Paused). Otherwise, just pause.
                if (this.simulation.status === 'STOPPED') this.simulation.startPaused();
                else this.simulation.pause();
            };
        }

        // Stepping and Stopping
        if (this.dom.btnStep) this.dom.btnStep.onclick = () => this.simulation.step();
        if (this.dom.btnReplay) this.dom.btnReplay.onclick = () => this.simulation.replayStep();
        if (this.dom.btnStop) this.dom.btnStop.onclick = () => this.simulation.stop();
        
        // Set initial button states
        this.updateControls(this.simulation.status);
    }

    /**
     * Handles dragging a "Variable" from the side panel onto the Canvas.
     */
    setupDragDrop() {
        const c = this.dom.container;
        
        // Allow dropping logic
        c.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'copy';
        });

        // Handle the actual Drop
        c.addEventListener('drop', (e) => {
            e.preventDefault();
            const rawData = e.dataTransfer.getData('application/json');
            if(!rawData) return;

            let data;
            try { data = JSON.parse(rawData); } catch(err) { return; }
            
            // If the user dropped a variable, calculate where it landed
            if (data.type === 'variable') {
                const rect = c.getBoundingClientRect();
                // Convert Screen Coords -> Graph Coords (accounting for Pan/Zoom)
                const x = (e.clientX - rect.left - this.graph.pan.x) / this.graph.scale;
                const y = (e.clientY - rect.top - this.graph.pan.y) / this.graph.scale;

                // Open the specific "Get vs Set" menu
                this.showVariableMenu(e.clientX, e.clientY, data.name, x, y);
            }
        });
    }

    /**
     * A specialized Context Menu for Variables.
     * Asks the user: "Do you want to GET this variable or SET it?"
     */
    showVariableMenu(mx, my, varName, gx, gy) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;

        // 1. Boundary Checks (keep menu inside screen)
        let drawX = mx; let drawY = my;
        if(mx + 150 > window.innerWidth) drawX -= 150;
        if(my + 100 > window.innerHeight) drawY -= 100;

        // 2. Show the Menu
        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        menu.classList.add('visible');
        
        // Hide search for this specific menu (we only have 2 options)
        if(search) search.style.display = 'none';
        list.innerHTML = '';

        // Helper to create the menu items
        const createOption = (label, isSet) => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerText = label;
            li.onclick = () => {
                // Ask VariableManager for the JSON template
                const template = isSet 
                    ? this.variableManager.createSetTemplate(varName)
                    : this.variableManager.createGetTemplate(varName);
                
                if (template) {
                    const node = this.graph.addNode(template, gx, gy);
                    
                    // CRITICAL: Inject the variable name into the node instance
                    // This allows the simulation to know WHICH variable to get/set
                    node.varName = varName; 

                    // Create DOM and attach Interaction listeners (Drag/Select)
                    this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
                }
                menu.classList.remove('visible');
            };
            list.appendChild(li);
        };

        // 3. Add the two options
        createOption(`Get ${varName}`, false);
        createOption(`Set ${varName}`, true);
    }

    /**
     * Updates the Toolbar buttons (Enabled/Disabled) based on the Simulation State.
     * @param {string} status - 'STOPPED', 'RUNNING', or 'PAUSED'
     */
    updateControls(status) {
        const d = this.dom;
        if (!d.btnPlay) return; 

        // Icons
        const iconStartPaused = `<svg viewBox="0 0 24 24"><path d="M6 5v14l9-7z M17 5v14h2V5z"/></svg>`;
        const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

        if (status === 'STOPPED') {
            d.btnPlay.disabled = false; d.btnPlay.title = "Play";
            d.btnPause.disabled = false; d.btnPause.innerHTML = iconStartPaused; d.btnPause.title = "Start Paused";
            d.btnReplay.disabled = true; d.btnStep.disabled = false; d.btnStop.disabled = true;
        } 
        else if (status === 'RUNNING') {
            d.btnPlay.disabled = true;
            d.btnPause.disabled = false; d.btnPause.innerHTML = iconPause; d.btnPause.title = "Pause";
            d.btnReplay.disabled = true; d.btnStep.disabled = true; d.btnStop.disabled = false;
        } 
        else if (status === 'PAUSED') {
            d.btnPlay.disabled = false; d.btnPlay.title = "Resume";
            d.btnPause.disabled = true; 
            d.btnReplay.disabled = !this.simulation.lastProcessedItem;
            d.btnStep.disabled = false; d.btnStop.disabled = false;
        }
    }

    /**
     * Reads Global Definitions (window.globalNodes) and prepares them.
     */
    importFileGlobals() {
        window.typeDefinitions = {};
        if (window.globalDataTypes) {
            window.globalDataTypes.forEach(t => window.typeDefinitions[t.name] = t);
        }
        window.nodeTemplates = [];
        if (window.globalNodes) {
            // Deep copy to prevent modifying the original definitions
            window.nodeTemplates = JSON.parse(JSON.stringify(window.globalNodes));
        }
    }

    /**
     * HARDCODED DEMO
     * Creates the initial "Event BeginPlay -> Loop" example graph.
     */
    initDemo() {
        if(!window.nodeTemplates) return;
        
        // 1. Find Templates
        const tEvent = window.nodeTemplates.find(n => n.name === "Event BeginPlay");
        const tMakeFloat = window.nodeTemplates.find(n => n.name === "Make Float");
        const tAdd = window.nodeTemplates.find(n => n.name === "Add");
        const tGeq = window.nodeTemplates.find(n => n.name === "Greater Equal (>=)");
        const tBranch = window.nodeTemplates.find(n => n.name === "Branch");
        const tPrint = window.nodeTemplates.find(n => n.name === "Print String");

        if(!tEvent || !tMakeFloat || !tAdd || !tGeq || !tBranch) return;

        // 2. Create Nodes
        const nEvent = this.graph.addNode(tEvent, 50, 50);
        const nBranch = this.graph.addNode(tBranch, 300, 50);
        
        const nFloat = this.graph.addNode(tMakeFloat, 50, 200);
        if(nFloat.inputs[0].widget) nFloat.inputs[0].widget.value = 5.0; 

        const nAdd = this.graph.addNode(tAdd, 250, 200);
        nAdd.inputs.forEach(p => p.setType('float')); // Change wildcard pins to float
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

        // 3. Render Nodes to DOM
        [nEvent, nBranch, nFloat, nAdd, nGeq, nTrue, nFalse].forEach(n => {
            if(n) this.renderer.createNodeElement(n, (e,id) => this.interaction.handleNodeDown(e,id));
        });

        // 4. Create Connections
        this.graph.addConnection(nEvent.id, 0, nBranch.id, 0, 'exec');
        if(nTrue) this.graph.addConnection(nBranch.id, 0, nTrue.id, 0, 'exec'); 
        if(nFalse) this.graph.addConnection(nBranch.id, 1, nFalse.id, 0, 'exec'); 
        this.graph.addConnection(nFloat.id, 0, nAdd.id, 0, 'float');
        this.graph.addConnection(nAdd.id, 0, nGeq.id, 0, 'float');
        this.graph.addConnection(nGeq.id, 0, nBranch.id, 1, 'boolean');

        // Force a final render to draw the wires
        setTimeout(() => this.renderer.render(), 50);
    }
}

// Global Entry Point
window.onload = () => { window.App = new Editor(); };