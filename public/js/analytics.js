// Vercel Web Analytics initialization
// Using the inject method for vanilla JavaScript projects

(function() {
  'use strict';
  
  // Initialize Vercel Analytics queue
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Dynamically load the Vercel Analytics script
  var script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Fallback to CDN if local script is not available
  script.onerror = function() {
    var fallbackScript = document.createElement('script');
    fallbackScript.defer = true;
    fallbackScript.src = 'https://va.vercel-scripts.com/v1/script.debug.js';
    document.head.appendChild(fallbackScript);
  };
  
  document.head.appendChild(script);
})();
