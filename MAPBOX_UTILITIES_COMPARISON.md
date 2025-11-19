# MapBox Utilities Quick Reference

## 🎯 Super Easy Map Creation

### Before (Direct MapBox API - Complex)
```javascript
mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-122.4194, 37.7749],
    zoom: 12,
    pitch: 45,
    attributionControl: false,
    antialias: true
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

map.on('load', () => {
    map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
    });
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    
    // Add 3D buildings layer...
    const layers = map.getStyle().layers;
    const labelLayerId = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout['text-field']
    )?.id;
    
    map.addLayer({
        id: 'add-3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
            'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
            'fill-extrusion-opacity': 0.6
        }
    }, labelLayerId);
});
```

### After (Dream X Utilities - Simple!)
```javascript
const mapUtils = new DreamXMapUtils(token);
const map = mapUtils.createMap({
    containerId: 'map',
    center: [-122.4194, 37.7749],
    zoom: 12,
    enable3D: true  // ✨ That's it! 3D terrain + buildings enabled
});
```

## 🚀 Common Tasks Made Easy

### Add User Markers (Before vs After)

**Before:**
```javascript
users.forEach(user => {
    const el = document.createElement('div');
    el.className = 'custom-marker';
    el.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; ...';
    
    if (user.profile_picture) {
        const img = document.createElement('img');
        img.src = '/uploads/' + user.profile_picture;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        el.appendChild(img);
    } else {
        el.textContent = user.full_name.charAt(0).toUpperCase();
    }
    
    el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
    });
    
    el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
    });
    
    const marker = new mapboxgl.Marker(el)
        .setLngLat([user.longitude, user.latitude])
        .addTo(map);
    
    el.addEventListener('click', () => {
        showUserModal(user);
    });
});
```

**After:**
```javascript
mapUtils.addUserMarkers(map, users, showUserModal);
```

### Geocoding (Before vs After)

**Before:**
```javascript
const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?access_token=${token}`
);
const data = await response.json();
if (data.features && data.features.length > 0) {
    const [lon, lat] = data.features[0].center;
    // Use coordinates...
}
```

**After:**
```javascript
const result = await mapUtils.geocode(city);
const [lon, lat] = result.coordinates;
```

### Get User Location (Before vs After)

**Before:**
```javascript
if (!navigator.geolocation) {
    alert('Geolocation not supported');
    return;
}

navigator.geolocation.getCurrentPosition(
    (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        // Use location...
    },
    (error) => {
        console.error('Error:', error);
    }
);
```

**After:**
```javascript
const location = await mapUtils.getCurrentLocation();
const { latitude, longitude } = location;
```

## 📊 Lines of Code Comparison

| Task | Without Utilities | With Utilities | Savings |
|------|-------------------|----------------|---------|
| Create 3D map | ~45 lines | 4 lines | 91% less code |
| Add user markers | ~30 lines | 1 line | 97% less code |
| Geocode address | ~10 lines | 1 line | 90% less code |
| Get location | ~15 lines | 1 line | 93% less code |
| **Total** | **~100 lines** | **~7 lines** | **93% reduction** |

## 🎨 What You Get Automatically

When using `createMap()`:
- ✅ Navigation controls (zoom, rotate)
- ✅ Fullscreen button
- ✅ Optional geolocation button
- ✅ 3D terrain (when enabled)
- ✅ 3D buildings (when enabled)
- ✅ Proper styling and theming
- ✅ Mobile responsiveness
- ✅ Error handling

When using `addUserMarkers()`:
- ✅ Custom styled markers
- ✅ Profile picture support
- ✅ Fallback to initials
- ✅ Hover animations
- ✅ Click handling
- ✅ Automatic cleanup

## 🔥 Real World Example

Add an interactive location map to your service page in under 10 lines:

```html
<!-- HTML -->
<div id="service-map" style="height: 500px;"></div>

<!-- JavaScript -->
<script>
const mapUtils = new DreamXMapUtils(token);
const map = mapUtils.createMap({
    containerId: 'service-map',
    enable3D: true
});

map.on('load', () => {
    const offices = [
        { coords: [-122.4194, 37.7749], name: 'SF Office' },
        { coords: [-73.9857, 40.7484], name: 'NY Office' }
    ];
    
    offices.forEach(office => {
        mapUtils.addMarker(map, {
            coordinates: office.coords,
            popup: { title: office.name }
        });
    });
    
    mapUtils.fitBounds(map, offices.map(o => o.coords));
});
</script>
```

## 💡 Pro Tips

1. **Always wait for map load**: Wrap operations in `map.on('load', ...)`
2. **Use 3D strategically**: Great for city views, not needed for country-level
3. **Cache geocoding results**: API has rate limits
4. **Fit bounds for multiple markers**: Better UX than fixed center/zoom
5. **Use geolocateControl**: Let users find themselves quickly

## 📖 Full Documentation

See `MAPBOX_GUIDE.md` for complete API reference and examples.
