// Import D3 for color schemes
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Function to assign colors based on node groups
function getColorForGroup(group) {
    return colorScale(group || "default");
}

// Function to parse JSON schema and generate graph data
function generateGraphData(schema) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        const group = prop.type || "default"; // Use type to categorize nodes
        const node = {
            id: key,
            label: prop.title || key,
            group: group,
            description: prop.description || "",
            properties: prop.properties || {},
            color: getColorForGroup(group)
        };

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
            .linkColor(() => "#aaa") // Light gray for better contrast
            .linkWidth(1.5) // Make links more visible
            .backgroundColor("#1a1a1a")
            .nodeColor(node => node.color) // Apply unique colors
            .nodeThreeObject(node => {
                // Create text sprite instead of spheres
                const sprite = new THREE.Sprite();
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                canvas.width = 256;
                canvas.height = 64;
                ctx.font = "Bold 24px Arial";
                ctx.fillStyle = node.color;
                ctx.textAlign = "center";
                ctx.fillText(node.label, canvas.width / 2, canvas.height / 2);

                const texture = new THREE.CanvasTexture(canvas);
                const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
                sprite.material = material;
                sprite.scale.set(50, 25, 1); // Adjust size

                return sprite;
            })
            .onNodeHover((node, event) => {
                const tooltip = document.getElementById("tooltip");
                if (node && event) {
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

        Graph.d3Force("charge").strength(-300); // Stronger repulsion
        Graph.d3Force("link").distance(120); // Increase link distance
    })
    .catch(error => console.error("Error loading JSON:", error));
