window.globalNodes = [
    {
        "name": "Event BeginPlay",
        "color": "var(--n-event)",
        "width": 160,
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Print String",
        "color": "var(--n-func)",
        "width": 180,
        "inputs": [
            {"name": "In", "type": "exec"},
            {"name": "String", "type": "string", "default": "Hello World"}
        ],
        "outputs": [{"name": "Out", "type": "exec"}]
    },
    {
        "name": "Make Vector",
        "color": "var(--n-pure)",
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