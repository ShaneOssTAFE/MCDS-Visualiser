MCDS Student Lifecycle Visualisation

![image](https://github.com/user-attachments/assets/33790786-85c8-4830-8149-8890e0363b48)

Overview

The MCDS Student Lifecycle Visualisation is an interactive 3D force-directed graph that visualises the relationships and data quality of entities and definitions within a schema, specifically tailored for MCDS. Built using 3D Force Graph and Three.js, this tool provides a dynamic way to explore schema structures, identify data quality issues, and interact with complex relationships.

The visualisation highlights entities (e.g., student-related data) and their definitions, with nodes color-coded based on data completeness and links representing references between them. It includes interactive features like filtering, searching, zooming, and saving/restoring views, making it a powerful tool for schema analysis and data quality assessment.

Features:

- 3D Force-Directed Graph: Visualise entities and definitions as nodes, with directional links showing relationships.
  - Data Quality Indicators:
    
      Nodes are color-coded based on completeness:
    
      - Green (entities) or magenta (definitions) for 100% complete.
      - Yellow for 50%–99% complete.
      - Red for less than 50% complete.
        
      Hover over nodes to see detailed tooltips with data quality issues (e.g., missing title, description, properties, or enum).
  - Interactive Controls:
      - Search: Filter nodes by name.
      - Filter Entities/Definitions: Toggle visibility of entities or definitions.
      - Min Completeness Slider: Filter nodes by their completeness percentage.
      - Reset View: Reset the graph to its initial view.
      - Save/Restore View: Save the current camera position and restore it later.
  - Clustering: Nodes are grouped by clusters based on their relationships, improving readability.
  - Tooltip Information: Displays node details such as type, description, completeness, properties/enum, and data quality issues.
  - Data Quality Summary: A panel showing average completeness and the number of broken references.
  - Responsive Design: Adapts to window resizing and supports mouse interactions (drag to pan, scroll to zoom).

Technologies Used:

  - JavaScript: Core logic for processing the schema and rendering the graph.
  - 3D Force Graph: Library for creating the 3D force-directed graph.
  - Three.js: Used by 3D Force Graph for WebGL rendering.
  - HTML/CSS: For the UI layout, controls, and styling.
