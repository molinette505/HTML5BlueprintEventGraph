export const globalDataTypes = [
    { "name": "exec",      "color": "var(--c-exec)",      "widget": "none" },
    { "name": "boolean",   "color": "var(--c-boolean)",   "widget": "checkbox" },
    { "name": "float",     "color": "var(--c-float)",     "widget": "number" },
    { "name": "string",    "color": "var(--c-string)",    "widget": "text" },
    { "name": "vector",    "color": "var(--c-vector)",    "widget": "vector3" },
    { "name": "rotator",   "color": "var(--c-rotator)",   "widget": "rotator" },
    { "name": "transform", "color": "var(--c-transform)", "widget": "none" },
    { "name": "color",     "color": "var(--c-color)",     "widget": "color" },
    { "name": "int",       "color": "var(--c-int)",       "widget": "number" },
    { "name": "class",     "color": "var(--c-class)",     "widget": "dropdown" },
    { "name": "object",    "color": "var(--c-object)",    "widget": "dropdown" },
    { "name": "wildcard",  "color": "var(--c-wildcard)",  "widget": "none" },

    // Array data types (same color as element type, no direct widget)
    { "name": "boolean[]",   "color": "var(--c-boolean)",   "widget": "none" },
    { "name": "float[]",     "color": "var(--c-float)",     "widget": "none" },
    { "name": "string[]",    "color": "var(--c-string)",    "widget": "none" },
    { "name": "vector[]",    "color": "var(--c-vector)",    "widget": "none" },
    { "name": "rotator[]",   "color": "var(--c-rotator)",   "widget": "none" },
    { "name": "transform[]", "color": "var(--c-transform)", "widget": "none" },
    { "name": "color[]",     "color": "var(--c-color)",     "widget": "none" },
    { "name": "int[]",       "color": "var(--c-int)",       "widget": "none" },
    { "name": "class[]",     "color": "var(--c-class)",     "widget": "none" },
    { "name": "object[]",    "color": "var(--c-object)",    "widget": "none" },
    { "name": "wildcard[]",  "color": "var(--c-wildcard)",  "widget": "none" }
];

window.globalDataTypes = globalDataTypes;
