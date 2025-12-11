/**
 * FunctionRegistry
 * Maps string identifiers (from JSON) to actual JavaScript functions.
 * This is the "Engine" that powers your nodes.
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
    }
};