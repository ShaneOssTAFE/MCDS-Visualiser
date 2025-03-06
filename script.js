// Function to parse your JSON schema and generate graph data
function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // D3 color scale for distinct colors
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

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
                : prop.properties || {},
            color: "#00d1b2" // Teal for entities
        };
        nodes.push(node);
        nodeMap.set(key, node);
    });

    // Step 2: Create nodes from "definitions" (optional, for referenced types)
    Object.keys(schema.definitions).forEach(defKey => {
        if (!nodeMap.has(defKey + "s") && !defKey.endsWith("ID") && !["partyType", "gender"].includes(defKey)) { // Avoid duplicates and simple types
            const def = schema.definitions[defKey];
            const node = {
                id: defKey,
                label: def.title || defKey,
                group: "definition",
                description: def.description || "",
                properties: def.properties || {},
                color: "#ff6b6b" // Red for definitions
            };
            nodes.push(node);
            nodeMap.set(defKey, node);
        }
    });

    // Step 3: Extract relationships (links)
    nodes.forEach(node => {
        const props = node.properties;
        if (props) {
            Object.keys(props).forEach(propKey => {
                const prop = props[propKey];
                // Handle $ref in properties
                if (prop["$ref"]) {
                    const refPath = prop["$ref"].split("/").pop();
                    let targetNodeId = refPath;
                    if (refPath.endsWith("ID")) {
                        targetNodeId = refPath.replace("ID", "s"); // e.g., "personID" -> "persons"
                    } else if (nodeMap.has(refPath + "s")) {
                        targetNodeId = refPath + "s"; // Pluralize if exists
                    }
                    if (nodeMap.has(targetNodeId)) {
                        links.push({
                            source: node.id,
                            target: targetNodeId,
                            label: propKey
                        });
                    }
                }
                // Handle arrays with $ref in items
                if (prop.type === "array" && prop.items && prop.items["$ref"]) {
                    const refPath = prop.items["$ref"].split("/").pop();
                    let targetNodeId = refPath;
                    if (refPath.endsWith("ID")) {
                        targetNodeId = refPath.replace("ID", "s");
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

// Load your JSON schema and initialize the graph
fetch("schema.json") // Adjust the path to your JSON file
    .then(response => response.json())
    .then(schema => {
        const graphData = generateGraphData(schema);

        // Initialize the 3D force-directed graph
        const Graph = ForceGraph3D()(document.getElementById("graph"))
            .graphData(graphData)
            .nodeLabel(node => node.label)
            .nodeColor(node => node.color) // Assign correct color to nodes
            .linkColor(() => "#ffffff") // White edges
            .linkWidth(2)
            .backgroundColor("#1a1a1a") // Dark background
            .nodeThreeObject(node => {
                // Create glowing sphere instead of squares
                const geometry = new THREE.SphereGeometry(6); // Adjust size
                const material = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.9 });
                const sphere = new THREE.Mesh(geometry, material);
                return sphere;
            })
            .onNodeClick((node, event) => { // Explicitly capture 'event'
                if (!event) return; // Prevent errors if event is undefined
            
                // Show properties in tooltip
                const tooltip = document.getElementById("tooltip");
                tooltip.style.display = "block";
                tooltip.style.left = `${event.clientX + 10}px`;
                tooltip.style.top = `${event.clientY + 10}px`;
                tooltip.innerHTML = `
                    <strong>${node.label}</strong><br>
                    <em>${node.description}</em><br>
                    ${Object.entries(node.properties).map(([key, value]) => `${key}: ${value.type || value}`).join("<br>")}
                `;
            
                // Zoom to the clicked node
                Graph.cameraPosition({ z: 300 }, node, 1000);
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
    })
    .catch(error => console.error("Error loading JSON:", error));
