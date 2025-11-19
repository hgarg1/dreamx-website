/**
 * MapBox Utilities for Dream X
 * 
 * Reusable utilities to easily integrate MapBox maps across the application.
 * Provides common functionality with sensible defaults to get maps up quickly.
 * 
 * @requires mapbox-gl.js
 */

class DreamXMapUtils {
    constructor(accessToken) {
        if (!accessToken) {
            throw new Error('MapBox access token is required');
        }
        mapboxgl.accessToken = accessToken;
        this.maps = new Map(); // Store multiple map instances
    }

    /**
     * Create a basic map with default settings
     * @param {Object} options - Map configuration options
     * @param {string} options.containerId - DOM element ID to render the map
     * @param {Array} options.center - [longitude, latitude] center coordinates
     * @param {number} options.zoom - Initial zoom level (default: 10)
     * @param {string} options.style - MapBox style URL (default: light-v11)
     * @param {boolean} options.enable3D - Enable 3D terrain and buildings (default: false)
     * @param {boolean} options.navigationControl - Show zoom/rotation controls (default: true)
     * @param {boolean} options.fullscreenControl - Show fullscreen button (default: true)
     * @param {boolean} options.geolocateControl - Show user location button (default: false)
     * @returns {mapboxgl.Map} The created map instance
     */
    createMap(options = {}) {
        const {
            containerId,
            center = [-98.5795, 39.8283], // Center of USA
            zoom = 10,
            style = 'mapbox://styles/mapbox/light-v11',
            enable3D = false,
            navigationControl = true,
            fullscreenControl = true,
            geolocateControl = false,
            pitch = enable3D ? 45 : 0,
            bearing = 0,
            attributionControl = false
        } = options;

        if (!containerId) {
            throw new Error('Container ID is required');
        }

        // Create the map
        const map = new mapboxgl.Map({
            container: containerId,
            style: style,
            center: center,
            zoom: zoom,
            pitch: pitch,
            bearing: bearing,
            attributionControl: attributionControl,
            antialias: enable3D // Enable antialiasing for 3D
        });

        // Add controls
        if (navigationControl) {
            map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        }

        if (fullscreenControl) {
            map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        }

        if (geolocateControl) {
            map.addControl(
                new mapboxgl.GeolocateControl({
                    positionOptions: { enableHighAccuracy: true },
                    trackUserLocation: true,
                    showUserHeading: true
                }),
                'top-right'
            );
        }

        // Enable 3D terrain and buildings if requested
        if (enable3D) {
            map.on('load', () => {
                // Add 3D terrain
                map.addSource('mapbox-dem', {
                    type: 'raster-dem',
                    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                    tileSize: 512,
                    maxzoom: 14
                });
                map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

                // Add 3D buildings layer
                const layers = map.getStyle().layers;
                const labelLayerId = layers.find(
                    (layer) => layer.type === 'symbol' && layer.layout['text-field']
                )?.id;

                map.addLayer(
                    {
                        id: 'add-3d-buildings',
                        source: 'composite',
                        'source-layer': 'building',
                        filter: ['==', 'extrude', 'true'],
                        type: 'fill-extrusion',
                        minzoom: 15,
                        paint: {
                            'fill-extrusion-color': '#aaa',
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'height']
                            ],
                            'fill-extrusion-base': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                15.05,
                                ['get', 'min_height']
                            ],
                            'fill-extrusion-opacity': 0.6
                        }
                    },
                    labelLayerId
                );
            });
        }

        // Store the map instance
        this.maps.set(containerId, map);

        return map;
    }

    /**
     * Add a custom marker to a map
     * @param {mapboxgl.Map} map - The map instance
     * @param {Object} options - Marker options
     * @param {Array} options.coordinates - [longitude, latitude]
     * @param {string} options.color - Marker color (default: '#667eea')
     * @param {HTMLElement} options.element - Custom HTML element for marker
     * @param {Function} options.onClick - Click handler
     * @param {Object} options.popup - Popup configuration {title, content}
     * @returns {mapboxgl.Marker} The created marker
     */
    addMarker(map, options = {}) {
        const {
            coordinates,
            color = '#667eea',
            element,
            onClick,
            popup
        } = options;

        if (!coordinates || coordinates.length !== 2) {
            throw new Error('Valid coordinates [lng, lat] are required');
        }

        const markerOptions = {};
        if (element) {
            markerOptions.element = element;
        } else if (color) {
            markerOptions.color = color;
        }

        const marker = new mapboxgl.Marker(markerOptions)
            .setLngLat(coordinates);

        // Add popup if provided
        if (popup) {
            const popupContent = `
                ${popup.title ? `<h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${popup.title}</h3>` : ''}
                ${popup.content ? `<p style="margin: 0; font-size: 14px;">${popup.content}</p>` : ''}
            `;
            const mapboxPopup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(popupContent);
            marker.setPopup(mapboxPopup);
        }

        // Add click handler
        if (onClick && element) {
            element.addEventListener('click', onClick);
        }

        marker.addTo(map);
        return marker;
    }

    /**
     * Add multiple user markers to a map
     * @param {mapboxgl.Map} map - The map instance
     * @param {Array} users - Array of user objects with {id, full_name, profile_picture, latitude, longitude}
     * @param {Function} onMarkerClick - Click handler receiving user object
     * @returns {Array} Array of created markers
     */
    addUserMarkers(map, users, onMarkerClick) {
        if (!Array.isArray(users)) {
            console.warn('Users must be an array');
            return [];
        }

        const markers = [];

        users.forEach(user => {
            if (!user.latitude || !user.longitude) {
                return;
            }

            // Create custom marker element
            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                cursor: pointer;
                transition: all 0.3s ease;
                overflow: hidden;
                background: #667eea;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 1.2rem;
            `;

            if (user.profile_picture) {
                const img = document.createElement('img');
                img.src = user.profile_picture.startsWith('/') ? user.profile_picture : '/uploads/' + user.profile_picture;
                img.alt = user.full_name;
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                el.appendChild(img);
            } else {
                el.textContent = (user.full_name || 'U').charAt(0).toUpperCase();
            }

            // Add hover effect
            el.addEventListener('mouseenter', () => {
                el.style.transform = 'scale(1.2)';
                el.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
                el.style.zIndex = '1000';
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'scale(1)';
                el.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
                el.style.zIndex = '1';
            });

            const marker = this.addMarker(map, {
                coordinates: [user.longitude, user.latitude],
                element: el,
                onClick: onMarkerClick ? () => onMarkerClick(user) : null
            });

            markers.push(marker);
        });

        return markers;
    }

    /**
     * Fly to a specific location with animation
     * @param {mapboxgl.Map} map - The map instance
     * @param {Array} coordinates - [longitude, latitude]
     * @param {number} zoom - Target zoom level (default: 14)
     * @param {number} pitch - Pitch angle for 3D view (default: 45)
     */
    flyTo(map, coordinates, zoom = 14, pitch = 45) {
        map.flyTo({
            center: coordinates,
            zoom: zoom,
            pitch: pitch,
            bearing: 0,
            essential: true,
            duration: 2000
        });
    }

    /**
     * Fit map bounds to show all markers
     * @param {mapboxgl.Map} map - The map instance
     * @param {Array} coordinates - Array of [longitude, latitude] pairs
     * @param {Object} options - Padding and other fit options
     */
    fitBounds(map, coordinates, options = {}) {
        if (!coordinates || coordinates.length === 0) {
            return;
        }

        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach(coord => bounds.extend(coord));

        map.fitBounds(bounds, {
            padding: options.padding || 50,
            maxZoom: options.maxZoom || 15,
            duration: options.duration || 1000
        });
    }

    /**
     * Geocode an address to coordinates using MapBox Geocoding API
     * @param {string} query - Address or place name
     * @returns {Promise<Object>} Geocoding result with coordinates and place name
     */
    async geocode(query) {
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const feature = data.features[0];
                return {
                    coordinates: feature.center,
                    placeName: feature.place_name,
                    text: feature.text,
                    context: feature.context
                };
            }

            throw new Error('No results found');
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    }

    /**
     * Reverse geocode coordinates to an address
     * @param {Array} coordinates - [longitude, latitude]
     * @returns {Promise<Object>} Reverse geocoding result with place information
     */
    async reverseGeocode(coordinates) {
        const [lon, lat] = coordinates;
        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxgl.accessToken}`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const feature = data.features.find(f => f.place_type.includes('place')) || data.features[0];
                return {
                    city: feature.text,
                    placeName: feature.place_name,
                    context: feature.context
                };
            }

            throw new Error('No results found');
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            throw error;
        }
    }

    /**
     * Get user's current location using HTML5 Geolocation API
     * @returns {Promise<Object>} Location with {latitude, longitude, accuracy}
     */
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    reject(error);
                }
            );
        });
    }

    /**
     * Get a map instance by container ID
     * @param {string} containerId - The container ID
     * @returns {mapboxgl.Map|null} The map instance or null
     */
    getMap(containerId) {
        return this.maps.get(containerId) || null;
    }

    /**
     * Remove a map instance
     * @param {string} containerId - The container ID
     */
    removeMap(containerId) {
        const map = this.maps.get(containerId);
        if (map) {
            map.remove();
            this.maps.delete(containerId);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DreamXMapUtils;
}
