<style>
  /* Existing styles */
  body { margin: 0; background: #1a1a1a; color: #fff; font-family: 'Arial', sans-serif; overflow: hidden; }
  #graph { width: 100vw; height: 100vh; }
  #tooltip { 
    position: absolute; 
    background: rgba(0, 0, 0, 0.9); 
    padding: 10px 15px; 
    border-radius: 5px; 
    display: none; 
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.5); 
    z-index: 10; 
    color: #fff; 
    font-size: 16px; 
  }
  #controls { 
    position: absolute; 
    top: 10px; 
    left: 10px; 
    z-index: 10; 
    background: rgba(0, 0, 0, 0.8); 
    padding: 15px; 
    border-radius: 8px; 
    box-shadow: 0 0 5px rgba(255, 255, 255, 0.2); 
    display: flex; /* Ensure flex layout */
    flex-direction: row; /* Ensure horizontal layout */
    align-items: center; /* Align items vertically */
    gap: 5px; /* Space between elements */
    padding: 5px; /* Inner padding */
    opacity: 1; /* Ensure not hidden by opacity */
    visibility: visible; /* Ensure not hidden by visibility */
  }
  #controls input, #controls button, #controls span { 
    margin: 5px; 
    padding: 8px 12px; 
    background: #333; 
    color: #fff; 
    border: 2px solid #fff; 
    border-radius: 4px; 
    font-size: 16px; 
    cursor: pointer; 
    display: inline-block; /* Ensure elements are displayed */
  }
  #controls input:focus, #controls button:focus { 
    outline: 3px solid #00FFFF; 
    outline-offset: 2px; 
  }
  #controls input { 
    background: #222; 
    width: 200px; 
  }
  .scene-tooltip { display: none !important; }

  /* New styles for hover/focus */
  #controls button:hover, #controls button:focus, #exportBtn:hover, #exportBtn:focus {
    background: #00FFFF;
    color: #000;
  }
  #legend-entities:hover, #legend-defs:hover {
    background: #555;
  }
</style>
