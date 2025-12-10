class Connection {
    constructor(id, fromNodeId, fromPinIdx, toNodeId, toPinIdx, type) {
        this.id = id;
        this.fromNode = fromNodeId;
        this.fromPin = fromPinIdx;
        this.toNode = toNodeId;
        this.toPin = toPinIdx;
        this.type = type;
    }
}