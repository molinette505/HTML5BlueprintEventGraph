/**
 * FunctionRegistry
 * Maps string identifiers (from JSON) to actual JavaScript functions.
 */
window.FunctionRegistry = {
    // --- FLOW CONTROL ---
    "Flow.Print": (msg) => {
        console.log("%c[Blueprint Output]:", "color: cyan", msg);
    },

    // --- MATH ---
    "Math.Add": (a, b) => a + b,
    "Math.Subtract": (a, b) => a - b,
    "Math.Multiply": (a, b) => a * b,
    
    // --- VECTORS ---
    "Vector.Make": (x, y, z) => ({ x, y, z }),
    
    "Vector.Add": (v1, v2) => {
        const a = v1 || {x:0, y:0, z:0};
        const b = v2 || {x:0, y:0, z:0};
        return {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        };
    },

    // --- MAKE LITERALS ---
    // Essentially identity functions that pass the input widget value to the output
    "Make.Float": (val) => parseFloat(val),
    "Make.Int": (val) => parseInt(val),
    "Make.String": (val) => String(val),

    // --- CONVERSIONS ---
    "Conv.IntToFloat": (val) => val, // JS numbers are floats anyway, but acts as cast
    "Conv.FloatToInt": (val) => Math.trunc(val), // Unreal Truncates
    "Conv.FloatToString": (val) => (val !== undefined ? val.toString() : "0.0"),
    "Conv.IntToString": (val) => (val !== undefined ? val.toString() : "0"),
    "Conv.VectorToString": (v) => {
        if (!v) return "X=0.000 Y=0.000 Z=0.000";
        return `X=${v.x.toFixed(3)} Y=${v.y.toFixed(3)} Z=${v.z.toFixed(3)}`;
    }
};