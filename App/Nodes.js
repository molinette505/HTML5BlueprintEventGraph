window.globalNodes = [
    {
        "name": "Event BeginPlay",
        "color": "#8b0000",
        "width": 160,
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Print String",
        "color": "#4466aa",
        "width": 180,
        "inputs": [
            {"name": "In", "type": "exec"},
            {"name": "String", "type": "string", "default": "Hello World"}
        ],
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Make Vector",
        "color": "#333",
        "inputs": [
            {"name": "X", "type": "float"},
            {"name": "Y", "type": "float"},
            {"name": "Z", "type": "float"}
        ],
        "outputs": [{"name": "Vec", "type": "vector"}]
    },
    {
        "name": "Delay",
        "inputs": [
            {"name": "In", "type": "exec"},
            {"name": "Duration", "type": "float", "default": 0.2}
        ],
        "outputs": [
            {"name": "Completed", "type": "exec"}
        ]
    },
    {
        "name": "Vector + Vector",
        "hideHeader": true,
        "centerLabel": "+",
        "inputs": [{"name": "", "type": "vector"}, {"name": "", "type": "vector"}],
        "outputs": [{"name": "", "type": "vector"}]
    },
    {
        "name": "Int + Int",
        "hideHeader": true,
        "centerLabel": "+",
        "inputs": [{"name": "", "type": "int"}, {"name": "", "type": "int"}],
        "outputs": [{"name": "", "type": "int"}]
    }
];