/**
 * FunctionRegistry
 * Maps string identifiers (from JSON) to actual JavaScript functions.
 */
window.FunctionRegistry = {
    // --- HELPERS FOR VISUALIZATION ---
    getVisualDebug: (node, inputs, result) => {
        const visualizer = window.FunctionRegistry.Visualizers[node.name];
        if (visualizer) {
            try { return visualizer(inputs, result); } 
            catch(e) { console.error("Visualizer Error", e); }
        }
        if (typeof result === 'object' && result !== null) {
            if ('x' in result && 'y' in result && 'z' in result) {
                return `(${result.x.toFixed(1)}, ${result.y.toFixed(1)}, ${result.z.toFixed(1)})`;
            }
            return '{Obj}';
        }
        return String(result);
    },

    Visualizers: {
        "Add": (inps, res) => `${fmt(inps[0])} + ${fmt(inps[1])} = ${fmt(res)}`,
        "Subtract": (inps, res) => `${fmt(inps[0])} - ${fmt(inps[1])} = ${fmt(res)}`,
        "Multiply": (inps, res) => `${fmt(inps[0])} × ${fmt(inps[1])} = ${fmt(res)}`,
        "Divide": (inps, res) => `${fmt(inps[0])} ÷ ${fmt(inps[1])} = ${fmt(res)}`,
        "Greater (>)": (inps, res) => `${fmt(inps[0])} > ${fmt(inps[1])} is ${res}`,
        "Less (<)": (inps, res) => `${fmt(inps[0])} < ${fmt(inps[1])} is ${res}`,
        "Equal (==)": (inps, res) => `${fmt(inps[0])} == ${fmt(inps[1])} is ${res}`,
        "Not Equal (!=)": (inps, res) => `${fmt(inps[0])} != ${fmt(inps[1])} is ${res}`,
        "Make Vector": (inps, res) => `Vec(${inps[0]}, ${inps[1]}, ${inps[2]})`,
        "Vector to String": (inps, res) => `"${res}"`
    },

    // --- FLOW CONTROL ---
    "Flow.Print": (msg) => { console.log("%c[Blueprint Output]:", "color: cyan", msg); return msg; },
    "Flow.Branch": (condition) => !!condition,

    // --- MATH ---
    "Math.AddGeneric": (a, b) => polyOp(a, b, (x,y)=>x+y),
    "Math.SubtractGeneric": (a, b) => polyOp(a, b, (x,y)=>x-y),
    "Math.MultiplyGeneric": (a, b) => polyOp(a, b, (x,y)=>x*y),
    "Math.DivideGeneric": (a, b) => {
        if (typeof b === 'number' && b === 0) { throw new Error("Division by zero."); }
        return polyOp(a, b, (x,y)=>x/y);
    },

    // --- LOGIC ---
    "Logic.Equal": (a, b) => deepEq(a, b),
    "Logic.NotEqual": (a, b) => !deepEq(a, b),
    "Logic.Greater": (a, b) => checkNum(a,b) && a > b,
    "Logic.GreaterEqual": (a, b) => checkNum(a,b) && a >= b,
    "Logic.Less": (a, b) => checkNum(a,b) && a < b,
    "Logic.LessEqual": (a, b) => checkNum(a,b) && a <= b,

    // --- VECTORS ---
    "Vector.Make": (x, y, z) => ({ x: x||0, y: y||0, z: z||0 }),
    "Vector.Add": (v1, v2) => {
        const a = v1 || {x:0, y:0, z:0};
        const b = v2 || {x:0, y:0, z:0};
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },

    // --- LITERALS ---
    "Make.Bool": (val) => val === true,
    "Make.Float": (val) => parseFloat(val),
    "Make.Int": (val) => parseInt(val),
    "Make.String": (val) => String(val),

    // --- CONVERSIONS ---
    "Conv.IntToFloat": (val) => val, 
    "Conv.FloatToInt": (val) => Math.trunc(val), 
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
    return String(val);
}

function polyOp(a, b, op) {
    const isVector = (v) => v && typeof v === 'object' && 'x' in v;
    const isNumber = (v) => typeof v === 'number';
    if (isVector(a) && isVector(b)) return { x: op(a.x, b.x), y: op(a.y, b.y), z: op(a.z, b.z) };
    if (isNumber(a) && isNumber(b)) return op(a, b);
    if (isVector(a) && isNumber(b)) return { x: op(a.x, b), y: op(a.y, b), z: op(a.z, b) };
    if (isNumber(a) && isVector(b)) return { x: op(a, b.x), y: op(a, b.y), z: op(a, b.z) };
    const err = new Error("Operation not supported between these types.");
    err.isBlueprintError = true; throw err; 
}

function deepEq(a, b) {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return a == b;
}

function checkNum(a, b) {
    if (typeof a === 'object' || typeof b === 'object') {
        const err = new Error("Comparison not supported for Objects/Vectors");
        err.isBlueprintError = true; throw err;
    }
    return true;
}