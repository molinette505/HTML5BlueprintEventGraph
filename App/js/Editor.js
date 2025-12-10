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

        this.initLibrary();
        
        document.getElementById('simulate-btn').onclick = () => this.simulation.run();
        document.getElementById('update-lib-btn').onclick = () => this.initLibrary();
        this.dom.contextSearch.oninput = (e) => this.interaction.filterContextMenu(e.target.value);

        this.initDemo();
    }

    initLibrary() {
        window.typeDefinitions = {};
        if(window.globalDataTypes) {
            this.dom.typesInput.value = JSON.stringify(window.globalDataTypes, null, 4);
            window.globalDataTypes.forEach(t => window.typeDefinitions[t.name] = t);
        }
        window.nodeTemplates = [];
        if(window.globalNodes) {
            this.dom.nodesInput.value = JSON.stringify(window.globalNodes, null, 4);
            window.nodeTemplates = window.globalNodes;
        }
    }

    initDemo() {
        if(!window.nodeTemplates) return;
        const t1 = window.nodeTemplates.find(n => n.name === "Event BeginPlay");
        const t2 = window.nodeTemplates.find(n => n.name === "Print String");
        const t3 = window.nodeTemplates.find(n => n.name === "Make Vector");
        
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