# MapBox Integration Guide for Dream X

This guide shows developers how to quickly integrate MapBox maps into any page using the Dream X MapBox Utilities.

## Quick Start

### 1. Include Required Resources

Add these to your EJS template's `<head>` or before `</body>`:

```html
<!-- MapBox GL JS -->
<link href='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css' rel='stylesheet' />
<script src='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js'></script>

<!-- Dream X MapBox Utilities -->
<script src='/js/mapbox-utils.js'></script>
```

### 2. Add a Map Container

Add a container element where you want the map to appear:

```html
<div id="my-map" style="width: 100%; height: 500px;"></div>
```

### 3. Initialize the Map

```javascript
// Initialize utilities with your MapBox token
const mapUtils = new DreamXMapUtils('<%= mapboxToken %>');

// Create a basic map
const map = mapUtils.createMap({
    containerId: 'my-map',
    center: [-122.4194, 37.7749], // San Francisco
    zoom: 12
});
```

That's it! You now have a fully functional map with navigation controls.

## Common Use Cases

### Basic Map with Default Settings

```javascript
const mapUtils = new DreamXMapUtils(mapboxToken);
const map = mapUtils.createMap({
    containerId: 'my-map',
    center: [-98.5795, 39.8283], // Center of USA
    zoom: 4
});
```

### 3D Map with Terrain and Buildings

```javascript
const map = mapUtils.createMap({
    containerId: 'my-map',
    center: [-73.9857, 40.7484], // New York
    zoom: 14,
    enable3D: true, // Enables 3D terrain and buildings
    navigationControl: true,
    fullscreenControl: true,
    geolocateControl: true // Shows user location button
});
```

### Map with User Markers

```javascript
// Initialize map
const map = mapUtils.createMap({
    containerId: 'user-map',
    center: [-98.5795, 39.8283],
    zoom: 4
});

// Sample user data
const users = [
    {
        id: 1,
        full_name: 'John Doe',
        profile_picture: 'john.jpg',
        latitude: 37.7749,
        longitude: -122.4194
    },
    {
        id: 2,
        full_name: 'Jane Smith',
        profile_picture: null,
        latitude: 40.7128,
        longitude: -74.0060
    }
];

// Add user markers when map loads
map.on('load', function() {
    mapUtils.addUserMarkers(map, users, (user) => {
        console.log('Clicked on:', user.full_name);
        // Show modal, navigate to profile, etc.
    });
});
```

### Add a Single Custom Marker

```javascript
// Add a simple colored marker
mapUtils.addMarker(map, {
    coordinates: [-122.4194, 37.7749],
    color: '#667eea'
});

// Add a marker with popup
mapUtils.addMarker(map, {
    coordinates: [-122.4194, 37.7749],
    popup: {
        title: 'San Francisco',
        content: 'Beautiful city by the bay'
    }
});

// Add a marker with custom element
const customElement = document.createElement('div');
customElement.innerHTML = '📍';
customElement.style.fontSize = '30px';

mapUtils.addMarker(map, {
    coordinates: [-122.4194, 37.7749],
    element: customElement,
    onClick: () => {
        alert('Marker clicked!');
    }
});
```

### Geocoding (Address to Coordinates)

```javascript
// Find coordinates for an address
const result = await mapUtils.geocode('San Francisco, CA');
console.log(result.coordinates); // [-122.4194, 37.7749]
console.log(result.placeName);   // "San Francisco, California, United States"

// Use the result to fly to location
mapUtils.flyTo(map, result.coordinates);
```

### Reverse Geocoding (Coordinates to Address)

```javascript
const result = await mapUtils.reverseGeocode([-122.4194, 37.7749]);
console.log(result.city);       // "San Francisco"
console.log(result.placeName);  // "San Francisco, California, United States"
```

### Get User's Current Location

```javascript
try {
    const location = await mapUtils.getCurrentLocation();
    console.log(location.latitude, location.longitude);
    
    // Fly to user's location
    mapUtils.flyTo(map, [location.longitude, location.latitude]);
} catch (error) {
    console.error('Could not get location:', error);
}
```

### Fit Map to Show All Markers

```javascript
const coordinates = [
    [-122.4194, 37.7749], // SF
    [-118.2437, 34.0522], // LA
    [-87.6298, 41.8781]   // Chicago
];

// Show all locations on the map
mapUtils.fitBounds(map, coordinates, {
    padding: 100,
    maxZoom: 10
});
```

### Fly to Location with Animation

```javascript
// Fly to New York with 3D view
mapUtils.flyTo(
    map,
    [-73.9857, 40.7484], // coordinates
    14,                   // zoom level
    45                    // pitch (3D angle)
);
```

## API Reference

### DreamXMapUtils Constructor

```javascript
new DreamXMapUtils(accessToken)
```

- **accessToken** (string): Your MapBox access token

### createMap(options)

Creates a new map instance with the specified options.

**Parameters:**
- `containerId` (string, required): DOM element ID
- `center` (array): [longitude, latitude] (default: center of USA)
- `zoom` (number): Initial zoom level (default: 10)
- `style` (string): MapBox style URL (default: 'mapbox://styles/mapbox/light-v11')
- `enable3D` (boolean): Enable 3D terrain and buildings (default: false)
- `navigationControl` (boolean): Show zoom/rotation controls (default: true)
- `fullscreenControl` (boolean): Show fullscreen button (default: true)
- `geolocateControl` (boolean): Show user location button (default: false)
- `pitch` (number): Camera pitch angle (default: 45 if 3D enabled, else 0)
- `bearing` (number): Camera bearing angle (default: 0)

**Returns:** mapboxgl.Map instance

### addMarker(map, options)

Adds a marker to the map.

**Parameters:**
- `map` (mapboxgl.Map): The map instance
- `coordinates` (array, required): [longitude, latitude]
- `color` (string): Marker color (default: '#667eea')
- `element` (HTMLElement): Custom HTML element for marker
- `onClick` (function): Click handler
- `popup` (object): Popup configuration {title, content}

**Returns:** mapboxgl.Marker instance

### addUserMarkers(map, users, onMarkerClick)

Adds multiple user markers with profile pictures.

**Parameters:**
- `map` (mapboxgl.Map): The map instance
- `users` (array): Array of user objects with {id, full_name, profile_picture, latitude, longitude}
- `onMarkerClick` (function): Click handler receiving user object

**Returns:** Array of marker instances

### geocode(query)

Convert an address to coordinates.

**Parameters:**
- `query` (string): Address or place name

**Returns:** Promise resolving to {coordinates, placeName, text, context}

### reverseGeocode(coordinates)

Convert coordinates to an address.

**Parameters:**
- `coordinates` (array): [longitude, latitude]

**Returns:** Promise resolving to {city, placeName, context}

### getCurrentLocation()

Get user's current location using HTML5 Geolocation API.

**Returns:** Promise resolving to {latitude, longitude, accuracy}

### flyTo(map, coordinates, zoom, pitch)

Animate camera to a location.

**Parameters:**
- `map` (mapboxgl.Map): The map instance
- `coordinates` (array): [longitude, latitude]
- `zoom` (number): Target zoom level (default: 14)
- `pitch` (number): Pitch angle for 3D view (default: 45)

### fitBounds(map, coordinates, options)

Fit map bounds to show all markers.

**Parameters:**
- `map` (mapboxgl.Map): The map instance
- `coordinates` (array): Array of [longitude, latitude] pairs
- `options` (object): {padding, maxZoom, duration}

### getMap(containerId)

Get a map instance by container ID.

**Parameters:**
- `containerId` (string): The container ID

**Returns:** mapboxgl.Map instance or null

### removeMap(containerId)

Remove and cleanup a map instance.

**Parameters:**
- `containerId` (string): The container ID

## Available Map Styles

You can customize the map appearance using different MapBox styles:

```javascript
// Light theme (default)
style: 'mapbox://styles/mapbox/light-v11'

// Dark theme
style: 'mapbox://styles/mapbox/dark-v11'

// Streets
style: 'mapbox://styles/mapbox/streets-v12'

// Outdoors (great for hiking/nature)
style: 'mapbox://styles/mapbox/outdoors-v12'

// Satellite
style: 'mapbox://styles/mapbox/satellite-v9'

// Satellite with streets overlay
style: 'mapbox://styles/mapbox/satellite-streets-v12'
```

## Complete Example: Service Locations Page

```html
<!--- In your EJS file --->
<%- include('partials/header') %>

<div class="container">
    <h1>Our Service Locations</h1>
    <div id="service-map" style="width: 100%; height: 600px; border-radius: 20px; overflow: hidden;"></div>
</div>

<!-- MapBox Resources -->
<link href='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css' rel='stylesheet' />
<script src='https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js'></script>
<script src='/js/mapbox-utils.js'></script>

<script>
    // Initialize utilities
    const mapUtils = new DreamXMapUtils('<%= mapboxToken %>');
    
    // Create 3D map
    const map = mapUtils.createMap({
        containerId: 'service-map',
        center: [-98.5795, 39.8283],
        zoom: 4,
        enable3D: true,
        navigationControl: true,
        fullscreenControl: true
    });
    
    // Service locations data
    const locations = [
        { name: 'San Francisco Office', lat: 37.7749, lon: -122.4194 },
        { name: 'New York Office', lat: 40.7128, lon: -74.0060 },
        { name: 'Chicago Office', lat: 41.8781, lon: -87.6298 }
    ];
    
    // Add markers when map loads
    map.on('load', function() {
        locations.forEach(loc => {
            mapUtils.addMarker(map, {
                coordinates: [loc.lon, loc.lat],
                color: '#667eea',
                popup: {
                    title: loc.name,
                    content: 'Visit us here!'
                }
            });
        });
        
        // Fit map to show all locations
        const coords = locations.map(l => [l.lon, l.lat]);
        mapUtils.fitBounds(map, coords, { padding: 100 });
    });
</script>

<%- include('partials/footer') %>
```

## Tips and Best Practices

1. **Always wait for map load**: Perform map operations inside `map.on('load', ...)` callback
2. **Use 3D sparingly**: 3D terrain adds visual appeal but increases resource usage
3. **Geocoding limits**: MapBox has rate limits on geocoding - cache results when possible
4. **Responsive design**: Set map container height explicitly (%, vh, or px)
5. **Clean up**: Use `mapUtils.removeMap()` when done to free resources
6. **Error handling**: Always wrap async operations (geocode, getCurrentLocation) in try-catch

## Configuration

Ensure `MAPBOX_ACCESS_TOKEN` is set in your `.env` file:

```
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

Get your token from: https://account.mapbox.com/access-tokens/

## Support

For issues or questions about MapBox integration, please check:
- [MapBox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- Dream X internal documentation
- Ask the development team
