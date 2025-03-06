// Function to parse the JSON schema and generate graph data
function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        const node = {
            id: key,
            label: prop.title || key,
            group: "entity",
            description: prop.description || "",
            properties: {}
        };

        if (prop.items && prop.items.$ref) {
            const refKey = prop.items.$ref.split("/").pop();
            if (schema.definitions && schema.definitions[refKey]) {
                node.properties = schema.definitions[refKey].properties || {};
            }
        }

        nodes.push(node);
        nodeMap.set(key, node);
    });

    nodes.forEach(node => {
        Object.entries(node.properties).forEach(([propKey, prop]) => {
            if (prop.$ref) {
                const refKey = prop.$ref.split("/").pop();
                if (nodeMap.has(refKey)) {
                    links.push({
                        source: node.id,
                        target: refKey,
                        label: propKey
                    });
                }
            }
        });
    });

    return { nodes, links };
}

// Load schema and initialize graph
fetch("schema.json")
    .then(response => response.json())
    .then(schema => {
        const graphData = generateGraphData(schema);
        const Graph = ForceGraph3D()(document.getElementById("graph"))
            .graphData(graphData)
            .nodeLabel(node => node.label) // Label nodes with text
            .linkColor(() => "#ffffff")
            .linkWidth(2)
            .backgroundColor("#1a1a1a")
            .nodeThreeObject(node => {
                // Create text sprite instead of default spheres
                const sprite = new THREE.Sprite();
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                ctx.font = "Bold 24px Arial";
                ctx.fillStyle = "#00d1b2";
                ctx.textAlign = "center";
                ctx.fillText(node.label, canvas.width / 2, canvas.height / 2);

                const texture = new THREE.CanvasTexture(canvas);
                const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
                sprite.material = material;
                sprite.scale.set(50, 25, 1); // Adjust size

                return sprite;
            })
            .onNodeHover(node => {
                const tooltip = document.getElementById("tooltip");
                if (node) {
                    tooltip.style.display = "block";
                    tooltip.style.left = `${event.clientX + 10}px`;
                    tooltip.style.top = `${event.clientY + 10}px`;
                    tooltip.innerHTML = `<strong>${node.label}</strong><br><em>${node.description}</em>`;
                    document.body.style.cursor = "pointer";
                } else {
                    tooltip.style.display = "none";
                    document.body.style.cursor = "default";
                }
            })
            .onBackgroundClick(() => {
                document.getElementById("tooltip").style.display = "none";
            });

        Graph.d3Force("charge").strength(-200);
        Graph.d3Force("link").distance(100);
    })
    .catch(error => console.error("Error loading JSON:", error));
