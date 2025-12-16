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
            variablePanel: document.getElementById('variable-panel'),
            btnToggleVars: document.getElementById('btn-toggle-vars'),
            btnPlay: document.getElementById('btn-play'),
            btnPause: document.getElementById('btn-pause'),
            btnStep: document.getElementById('btn-step'),
            btnReplay: document.getElementById('btn-replay'),
            btnStop: document.getElementById('btn-stop')
        };
        
        this.graph = new Graph();
        this.renderer = new Renderer(this.graph, this.dom);
        this.interaction = new Interaction(this.graph, this.renderer, this.dom);
        this.simulation = new Simulation(this.graph, this.renderer);
        this.variableManager = new VariableManager(this);

        this.simulation.onStateChange = (status) => this.updateControls(status);
        this.importFileGlobals();
        this.setupToolbar();
        this.setupDragDrop();
        
        if(this.dom.contextSearch) {
            this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);
        }

        this.initDemo();
    }

    setupToolbar() {
        if (this.dom.btnToggleVars) {
            this.dom.btnToggleVars.onclick = () => {
                this.dom.variablePanel.classList.toggle('visible');
                if(this.dom.variablePanel.classList.contains('visible')) {
                    this.dom.btnToggleVars.style.background = '#36a55d';
                } else {
                    this.dom.btnToggleVars.style.background = '';
                }
            };
        }

        if (this.dom.btnPlay) {
            this.dom.btnPlay.onclick = () => {
                if(this.simulation.status === 'PAUSED') this.simulation.resume();
                else this.simulation.start();
            };
        }
        if (this.dom.btnPause) {
            this.dom.btnPause.onclick = () => {
                if (this.simulation.status === 'STOPPED') this.simulation.startPaused();
                else this.simulation.pause();
            };
        }
        if (this.dom.btnStep) this.dom.btnStep.onclick = () => this.simulation.step();
        if (this.dom.btnReplay) this.dom.btnReplay.onclick = () => this.simulation.replayStep();
        if (this.dom.btnStop) this.dom.btnStop.onclick = () => this.simulation.stop();
        
        this.updateControls(this.simulation.status);
    }

    setupDragDrop() {
        const c = this.dom.container;
        
        c.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'copy';
        });

        c.addEventListener('drop', (e) => {
            e.preventDefault();
            const rawData = e.dataTransfer.getData('application/json');
            if(!rawData) return;

            let data;
            try { data = JSON.parse(rawData); } catch(err) { return; }
            
            if (data.type === 'variable') {
                const rect = c.getBoundingClientRect();
                const x = (e.clientX - rect.left - this.graph.pan.x) / this.graph.scale;
                const y = (e.clientY - rect.top - this.graph.pan.y) / this.graph.scale;

                this.showVariableMenu(e.clientX, e.clientY, data.name, x, y);
            }
        });
    }

    showVariableMenu(mx, my, varName, gx, gy) {
        const menu = this.dom.contextMenu;
        const list = this.dom.contextList;
        const search = this.dom.contextSearch;

        let drawX = mx; let drawY = my;
        if(mx + 150 > window.innerWidth) drawX -= 150;
        if(my + 100 > window.innerHeight) drawY -= 100;

        menu.style.left = `${drawX}px`;
        menu.style.top = `${drawY}px`;
        menu.classList.add('visible');
        
        if(search) search.style.display = 'none';
        list.innerHTML = '';

        const createOption = (label, isSet) => {
            const li = document.createElement('li');
            li.className = 'ctx-item';
            li.innerText = label;
            li.onclick = () => {
                const template = isSet 
                    ? this.variableManager.createSetTemplate(varName)
                    : this.variableManager.createGetTemplate(varName);
                
                if (template) {
                    const node = this.graph.addNode(template, gx, gy);
                    
                    // CRITICAL: Inject the variable name into the node instance
                    // This allows the simulation to know WHICH variable to get/set
                    node.varName = varName; 

                    this.renderer.createNodeElement(node, (e, nid) => this.interaction.handleNodeDown(e, nid));
                }
                menu.classList.remove('visible');
            };
            list.appendChild(li);
        };

        createOption(`Get ${varName}`, false);
        createOption(`Set ${varName}`, true);
    }

    updateControls(status) {
        const d = this.dom;
        if (!d.btnPlay) return; 

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
            if(n) this.renderer.createNodeElement(n, (e,id) => this.interaction.handleNodeDown(e,id));
        });

        this.graph.addConnection(nEvent.id, 0, nBranch.id, 0, 'exec');
        if(nTrue) this.graph.addConnection(nBranch.id, 0, nTrue.id, 0, 'exec'); 
        if(nFalse) this.graph.addConnection(nBranch.id, 1, nFalse.id, 0, 'exec'); 
        this.graph.addConnection(nFloat.id, 0, nAdd.id, 0, 'float');
        this.graph.addConnection(nAdd.id, 0, nGeq.id, 0, 'float');
        this.graph.addConnection(nGeq.id, 0, nBranch.id, 1, 'boolean');

        setTimeout(() => this.renderer.render(), 50);
    }
}

window.onload = () => { window.App = new Editor(); };