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
            // These might be null if you remove the "Developer Mode" HTML later, so we handle that safely
            typesInput: document.getElementById('types-input'),
            nodesInput: document.getElementById('nodes-input')
        };
        
        // 2. Initialize Logic Systems
        this.graph = new Graph();
        this.renderer = new Renderer(this.graph, this.dom);
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        this.simulation = new Simulation(this.graph);

        // 3. PHASE 1: Load Data from Files -> Memory (App works without UI now)
        this.importFileGlobals();

        // 4. PHASE 2: Load Data from Memory -> UI (Developer Mode)
        this.populateUI();
        
        // 5. Bind Events
        document.getElementById('simulate-btn').onclick = () => this.simulation.run();
        
        // Only bind these if the button exists
        const updateBtn = document.getElementById('update-lib-btn');
        if (updateBtn) updateBtn.onclick = () => this.applyFromUI();
        
        if(this.dom.contextSearch) {
            this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);
        }

        // 6. Start the App
        this.initDemo();
    }

    importFileGlobals() {
        // 1. Load Types
        window.typeDefinitions = {};
        if (window.globalDataTypes) {
            window.globalDataTypes.forEach(t => window.typeDefinitions[t.name] = t);
        }

        // 2. Load Nodes
        window.nodeTemplates = [];
        if (window.globalNodes) {
            // Deep copy to ensure we don't accidentally mutate the original file data reference
            window.nodeTemplates = JSON.parse(JSON.stringify(window.globalNodes));
        }
    }

    //Fill the text areas
    populateUI() {
        if (this.dom.typesInput && window.globalDataTypes) {
            this.dom.typesInput.value = JSON.stringify(window.globalDataTypes, null, 4);
        }
        if (this.dom.nodesInput && window.globalNodes) {
            this.dom.nodesInput.value = JSON.stringify(window.globalNodes, null, 4);
        }
    }

    // --- PHASE 3: EDITING (Text Area -> Memory) ---
    applyFromUI() {
        if (!this.dom.typesInput || !this.dom.nodesInput) return;

        try {
            // 1. Parse Types
            const rawTypes = this.dom.typesInput.value;
            const parsedTypes = JSON.parse(rawTypes);
            window.typeDefinitions = {};
            parsedTypes.forEach(t => window.typeDefinitions[t.name] = t);

            // 2. Parse Nodes
            const rawNodes = this.dom.nodesInput.value;
            window.nodeTemplates = JSON.parse(rawNodes);
            
            // Visual Feedback
            const btn = document.getElementById('update-lib-btn');
            const originalText = btn.innerText;
            btn.innerText = "Saved!";
            setTimeout(() => btn.innerText = originalText, 1000);

        } catch(e) {
            alert("JSON Syntax Error: " + e.message);
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
                 this.renderer.createNodeElement(n3, (e,id) => this.interaction.startNodeDrag(e,id));
            }

            this.renderer.createNodeElement(n1, (e,id) => this.interaction.startNodeDrag(e,id));
            this.renderer.createNodeElement(n2, (e,id) => this.interaction.startNodeDrag(e,id));
            
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