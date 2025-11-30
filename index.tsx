
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Inject Google Maps script dynamically
const loadMaps = () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        document.head.appendChild(script);
    }
};
loadMaps();

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
