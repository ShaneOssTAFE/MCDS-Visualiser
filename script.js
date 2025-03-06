function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Process top-level properties
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

    // Process relationships from definitions
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

// Load schema from schema.json and initialize the graph
fetch("schema.json")
    .then(response => response.json())
    .then(schema => {
        const graphData = generateGraphData(schema);
        const Graph = ForceGraph3D()(document.getElementById("graph"))
            .graphData(graphData)
            .nodeLabel(node => node.label)
            .nodeColor(() => "#00d1b2")
            .linkColor(() => "#ffffff")
            .linkWidth(2)
            .backgroundColor("#1a1a1a")
            .nodeThreeObject(node => {
                const spriteMaterial = new THREE.SpriteMaterial({
                    color: "#00d1b2",
                    transparent: true,
                    opacity: 0.8
                });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.scale.set(20, 20, 20);
                return sprite;
            })
            .onNodeClick(node => {
                const tooltip = document.getElementById("tooltip");
                tooltip.style.display = "block";
                tooltip.style.left = `${event.clientX + 10}px`;
                tooltip.style.top = `${event.clientY + 10}px`;
                tooltip.innerHTML = `
                    <strong>${node.label}</strong><br>
                    <em>${node.description}</em><br>
                    ${Object.entries(node.properties).map(([key, value]) => `${key}: ${value.type || value}`).join("<br>")}
                `;
                Graph.cameraPosition({ z: 300 }, node, 1000);
            })
            .onNodeHover(node => {
                document.body.style.cursor = node ? "pointer" : "default";
            })
            .onBackgroundClick(() => {
                document.getElementById("tooltip").style.display = "none";
            });

        Graph.d3Force("charge").strength(-200);
        Graph.d3Force("link").distance(100);
    })
    .catch(error => console.error("Error loading JSON:", error));
