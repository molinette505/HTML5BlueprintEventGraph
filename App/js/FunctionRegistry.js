window.FunctionRegistry = {
    // --- VARIABLES ---
    
    // Accessed via 'this.varName' because the node is bound as context
    "Variable.Get": function() {
        const vm = window.App.variableManager;
        if (!vm || !this.varName) return null;
        return vm.runtimeValues[this.varName];
    },

    "Variable.Set": function(value) {
        const vm = window.App.variableManager;
        if (vm && this.varName) {
            vm.runtimeValues[this.varName] = value;
        }
        return value; // Pass-through
    },

    // --- REST OF REGISTRY ---
    getVisualDebug: (node, inputs, result) => {
        const visualizer = window.FunctionRegistry.Visualizers[node.functionId];
        if (visualizer) {
            try { return visualizer(inputs, result, node); } // Pass node to visualizer too
            catch(e) { console.error("Visualizer Error", e); }
        }
        if (typeof result === 'object' && result !== null) {
            if ('x' in result && 'y' in result && 'z' in result) return `(${result.x.toFixed(1)}, ${result.y.toFixed(1)}, ${result.z.toFixed(1)})`;
            if ('loc' in result && 'rot' in result) return `Trs(...)`;
            return '{Obj}';
        }
        return String(result);
    },

    Visualizers: {
        "Math.AddGeneric": (inps, res) => `${fmt(inps[0])} + ${fmt(inps[1])} = ${fmt(res)}`,
        "Math.SubtractGeneric": (inps, res) => `${fmt(inps[0])} - ${fmt(inps[1])} = ${fmt(res)}`,
        "Math.MultiplyGeneric": (inps, res) => `${fmt(inps[0])} × ${fmt(inps[1])} = ${fmt(res)}`,
        "Math.DivideGeneric": (inps, res) => `${fmt(inps[0])} ÷ ${fmt(inps[1])} = ${fmt(res)}`,
        
        "Logic.Greater": (inps, res) => `(${fmt(inps[0])} > ${fmt(inps[1])}) = ${res}`,
        "Logic.Less": (inps, res) => `(${fmt(inps[0])} < ${fmt(inps[1])}) = ${res}`,
        "Logic.GreaterEqual": (inps, res) => `(${fmt(inps[0])} >= ${fmt(inps[1])}) = ${res}`,
        "Logic.LessEqual": (inps, res) => `(${fmt(inps[0])} <= ${fmt(inps[1])}) = ${res}`,
        "Logic.Equal": (inps, res) => `(${fmt(inps[0])} == ${fmt(inps[1])}) = ${res}`,
        "Logic.NotEqual": (inps, res) => `(${fmt(inps[0])} != ${fmt(inps[1])}) = ${res}`,
        
        "Vector.Make": (inps, res) => `Vec(${inps[0]}, ${inps[1]}, ${inps[2]})`,
        "Vector.Length": (inps, res) => {
            const v = inps[0] || {x:0, y:0, z:0};
            return `sqrt(${v.x.toFixed(1)}^2 + ${v.y.toFixed(1)}^2 + ${v.z.toFixed(1)}^2) = ${fmt(res)}`;
        },
        
        "Conv.FloatToInt": (inps, res) => `${inps[0]} ➞ ${res}`,
        "Conv.IntToFloat": (inps, res) => `${inps[0]} ➞ ${fmt(res)}`,
        "Conv.FloatToString": (inps, res) => `${inps[0]} ➞ "${res}"`,
        "Conv.IntToString": (inps, res) => `${inps[0]} ➞ "${res}"`,
        "Conv.BoolToString": (inps, res) => `${inps[0]} ➞ "${res}"`,
        "Conv.VectorToString": (inps, res) => `Vec ➞ "${res}"`,

        // Visualizer also needs to check node.varName if inputs are empty
        "Variable.Get": (inps, res, node) => `${node.varName} = ${fmt(res)}`,
        "Variable.Set": (inps, res, node) => `${node.varName} = ${fmt(res)}`
    },

    "Flow.Print": (msg) => { console.log("%c[Blueprint Output]:", "color: cyan", msg); return msg; },
    "Flow.Branch": (condition) => !!condition,

    "Math.AddGeneric": (a, b) => polyOp(a, b, (x,y)=>x+y),
    "Math.SubtractGeneric": (a, b) => polyOp(a, b, (x,y)=>x-y),
    "Math.MultiplyGeneric": (a, b) => polyOp(a, b, (x,y)=>x*y),
    "Math.DivideGeneric": (a, b) => {
        if (typeof b === 'number' && b === 0) { throw new Error("Division by zero."); }
        return polyOp(a, b, (x,y)=>x/y);
    },

    "Logic.Equal": (a, b) => deepEq(a, b),
    "Logic.NotEqual": (a, b) => !deepEq(a, b),
    "Logic.Greater": (a, b) => checkNum(a,b) && a > b,
    "Logic.GreaterEqual": (a, b) => checkNum(a,b) && a >= b,
    "Logic.Less": (a, b) => checkNum(a,b) && a < b,
    "Logic.LessEqual": (a, b) => checkNum(a,b) && a <= b,

    "Vector.Make": (x, y, z) => ({ x: x||0, y: y||0, z: z||0 }),
    "Vector.Add": (v1, v2) => {
        const a = v1 || {x:0, y:0, z:0};
        const b = v2 || {x:0, y:0, z:0};
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },
    "Vector.Length": (v) => {
        if (!v) return 0;
        return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    },
    "Vector.Normalize": (v) => {
        if (!v) return {x:0, y:0, z:0};
        const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        if (len === 0) return {x:0, y:0, z:0};
        return { x: v.x/len, y: v.y/len, z: v.z/len };
    },
    "Rotator.Make": (r, p, y) => ({ roll: r||0, pitch: p||0, yaw: y||0 }),
    "Transform.Make": (loc, rot, scale) => ({
        loc: loc || {x:0, y:0, z:0},
        rot: rot || {roll:0, pitch:0, yaw:0},
        scale: scale || {x:1, y:1, z:1}
    }),

    "Make.Bool": (val) => val === true,
    "Make.Float": (val) => parseFloat(val),
    "Make.Int": (val) => parseInt(val),
    "Make.String": (val) => String(val),

    "Conv.IntToFloat": (val) => val, 
    "Conv.FloatToInt": (val) => Math.floor(val), 
    "Conv.FloatToString": (val) => (val !== undefined ? val.toString() : "0.0"),
    "Conv.IntToString": (val) => (val !== undefined ? val.toString() : "0"),
    "Conv.BoolToString": (val) => (val ? "true" : "false"),
    "Conv.VectorToString": (v) => {
        if (!v) return "X=0.000 Y=0.000 Z=0.000";
        return `X=${v.x.toFixed(3)} Y=${v.y.toFixed(3)} Z=${v.z.toFixed(3)}`;
    }
};

function fmt(val) {
    if (typeof val === 'object' && val !== null && 'x' in val) 
        return `(${val.x.toFixed(1)}, ${val.y.toFixed(1)}, ${val.z.toFixed(1)})`;
    if (typeof val === 'number') return parseFloat(val.toFixed(2));
    return String(val);
}

function polyOp(a, b, op) {
    const isVector = (v) => v && typeof v === 'object' && 'x' in v;
    const isNumber = (v) => typeof v === 'number';
    if (isVector(a) && isVector(b)) return { x: op(a.x, b.x), y: op(a.y, b.y), z: op(a.z, b.z) };
    if (isNumber(a) && isNumber(b)) return op(a, b);
    if (isVector(a) && isNumber(b)) return { x: op(a.x, b), y: op(a.y, b), z: op(a.z, b) };
    if (isNumber(a) && isVector(b)) return { x: op(a, b.x), y: op(a, b.y), z: op(a, b.z) };
    if (a === undefined || b === undefined) return 0;
    const err = new Error("Operation not supported."); err.isBlueprintError = true; throw err; 
}

function deepEq(a, b) {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) return JSON.stringify(a) === JSON.stringify(b);
    return a == b;
}

function checkNum(a, b) {
    if (typeof a === 'object' || typeof b === 'object') { const err = new Error("Comparison not supported"); err.isBlueprintError = true; throw err; }
    return true;
}