class Simulation {
    constructor(graph) { this.graph = graph; }
    
    async run() {
        console.log("Simulating...");
        const starts = this.graph.nodes.filter(n => n.config.name === "Event BeginPlay");
        for(const n of starts) await this.exec(n);
    }

    async exec(node) {
        const el = document.getElementById(`node-${node.id}`);
        if(el) {
            el.style.boxShadow = "0 0 0 4px #ff9900";
            await new Promise(r => setTimeout(r, 600));
            el.style.boxShadow = "";
        }

        const outIdx = (node.outputs||[]).findIndex(p => p.type === 'exec');
        if(outIdx !== -1) {
            const conn = this.graph.connections.find(c => c.fromNode === node.id && c.fromPin === outIdx);
            if(conn) {
                const next = this.graph.nodes.find(n => n.id === conn.toNode);
                if(next) await this.exec(next);
            }
        }
    }
}