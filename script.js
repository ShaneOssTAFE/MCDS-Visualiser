// Function to parse the JSON schema and generate graph data
function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Step 1: Create nodes from "properties"
    Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        const node = {
            id: key,
            label: prop.title || key,
            group: "entity",
            description: prop.description || "",
            properties: prop.type === "array" && prop.items && prop.items["$ref"]
                ? schema.definitions[prop.items["$ref"].split("/").pop()].properties || {}
                : prop.properties || {}
        };
        nodes.push(node);
        nodeMap.set(key, node);
    });

    // Step 2: Extract relationships (links)
    nodes.forEach(node => {
        const props = node.properties;
        if (props) {
            Object.keys(props).forEach(propKey => {
                const prop = props[propKey];
                if (prop["$ref"]) {
                    const refPath = prop["$ref"].split("/").pop();
                    let targetNodeId = refPath;
                    if (refPath.endsWith("ID")) {
                        targetNodeId = refPath.replace("ID", "s"); // e.g., "personID" -> "persons"
                    } else if (nodeMap.has(refPath + "s")) {
                        targetNodeId = refPath + "s";
                    }
                    if (nodeMap.has(targetNodeId)) {
                        links.push({
                            source: node.id,
                            target: targetNodeId,
                            label: propKey
                        });
                    }
                }
            });
        }
    });

    return { nodes, links };
}

// Generate graph data and initialize the graph
const graphData = generateGraphData(schema);
const Graph = ForceGraph3D()(document.getElementById("graph"))
    .graphData(graphData)
    .nodeLabel(node => node.label)
    .nodeColor(() => "#00d1b2") // Teal color for all nodes
    .linkColor(() => "#ffffff") // White edges
    .linkWidth(2)
    .backgroundColor("#1a1a1a") // Dark background
    .nodeThreeObject(node => {
        // Explicitly set the color to avoid undefined error
        const spriteMaterial = new THREE.SpriteMaterial({
            color: "#00d1b2", // Match the nodeColor value
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
        Graph.cameraPosition({ z: 300 }, node, 1000); // Zoom to node
    })
    .onNodeHover(node => {
        document.body.style.cursor = node ? "pointer" : "default";
    })
    .onBackgroundClick(() => {
        document.getElementById("tooltip").style.display = "none";
    });

// Adjust forces for better layout
Graph.d3Force("charge").strength(-200); // Repulsion
Graph.d3Force("link").distance(100); // Edge length
