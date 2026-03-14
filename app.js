/**
 * ИС Контроля перемещения мигрантов
 * OpenLayers + heatmap + timeline + incidents + basemap switcher
 * + 5 new scenarios: GPS discrepancy, phone left, shadow employment, night deviation, crime scene
 */

// ===== State =====
const state = {
    migrants: [],
    incidents: [],
    geozones: [],
    zones: { work_zones: [], residential_zones: [] },
    stats: {},
    gpsDiscrepancies: [],
    purchases: [],
    crimeSnapshots: [],
    currentStep: 0,
    playing: false,
    playSpeed: 1,
    playTimer: null,
    selectedMigrant: null,
    filterType: 'all',
    filterSeverity: 'all',
    loadedDays: {},
    activePanel: 'incidents', // 'incidents' | 'scenarios'
};

const START_DATE = new Date('2026-03-01T00:00:00');
const DAYS = 30;
const TOTAL_STEPS = DAYS * 24;

const TYPE_LABELS = {
    route_deviation: 'Маршрут',
    cluster: 'Скопление',
    geozone_violation: 'Геозона',
    time_anomaly: 'Время',
    gps_discrepancy: 'GPS≠Оператор',
    phone_left: 'Телефон оставлен',
    shadow_employment: 'Серая занятость',
    night_deviation: 'Ночное откл.',
    crime_scene: 'Инцидент',
};

const TYPE_COLORS = {
    route_deviation: '#cc0000',
    cluster: '#e6850a',
    geozone_violation: '#7c3aed',
    time_anomaly: '#1e4d8c',
    gps_discrepancy: '#e63946',
    phone_left: '#d4a017',
    shadow_employment: '#2d6a4f',
    night_deviation: '#6c3483',
    crime_scene: '#c0392b',
};

const SEVERITY_LABELS = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function stepToDate(step) {
    const d = new Date(START_DATE);
    d.setHours(d.getHours() + step);
    return d;
}

function formatDateTime(d) {
    return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS_RU[d.getDay()]} ${String(d.getHours()).padStart(2,'0')}:00`;
}

function formatDateShort(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ===== Data Loading =====
async function loadJSON(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}`);
    return resp.json();
}

async function loadDayTracks(dateStr) {
    if (state.loadedDays[dateStr]) return state.loadedDays[dateStr];
    const data = await loadJSON(`data/tracks/day_${dateStr}.json`);
    state.loadedDays[dateStr] = data;
    return data;
}

async function loadAllData() {
    const [migrants, incidents, geozones, zones, stats, gpsDisc, purchases, crimeSnaps] = await Promise.all([
        loadJSON('data/migrants.json'),
        loadJSON('data/incidents.json'),
        loadJSON('data/geozones.json'),
        loadJSON('data/zones.json'),
        loadJSON('data/stats.json'),
        loadJSON('data/gps_discrepancies.json'),
        loadJSON('data/purchases.json'),
        loadJSON('data/crime_snapshots.json'),
    ]);
    state.migrants = migrants;
    state.incidents = incidents;
    state.geozones = geozones;
    state.zones = zones;
    state.stats = stats;
    state.gpsDiscrepancies = gpsDisc;
    state.purchases = purchases;
    state.crimeSnapshots = crimeSnaps;

    document.getElementById('stat-migrants').textContent = stats.total_migrants.toLocaleString();
    document.getElementById('stat-points').textContent = stats.total_points.toLocaleString();
    document.getElementById('stat-incidents').textContent = stats.total_incidents.toLocaleString();

    const firstDay = formatDateShort(START_DATE);
    await loadDayTracks(firstDay);
}

// ===== Basemap Layers =====
function createBasemapLayers() {
    return {
        'osm': new ol.layer.Tile({
            source: new ol.source.OSM(),
            visible: false,
        }),
        'yandex-map': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&v=24.06.19-0&x={x}&y={y}&z={z}&scale=1&lang=ru_RU',
                attributions: '&copy; <a href="https://yandex.ru/maps">Яндекс Карты</a>',
                maxZoom: 19,
            }),
            visible: false,
        }),
        'yandex-sat': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://core-sat.maps.yandex.net/tiles?l=sat&v=3.1099.0&x={x}&y={y}&z={z}&scale=1&lang=ru_RU',
                attributions: '&copy; <a href="https://yandex.ru/maps">Яндекс Спутник</a>',
                maxZoom: 19,
            }),
            visible: false,
        }),
        'esri-sat': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attributions: '&copy; <a href="https://www.esri.com">ESRI</a>',
            }),
            visible: false,
        }),
        'google-map': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://mt{0-3}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ru',
                attributions: '&copy; Google Maps',
            }),
            visible: false,
        }),
        'google-sat': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                attributions: '&copy; Google Maps',
            }),
            visible: false,
        }),
        'google-terrain': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://mt{0-3}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&hl=ru',
                attributions: '&copy; Google Maps',
            }),
            visible: false,
        }),
        'carto-dark': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                attributions: '&copy; <a href="https://carto.com/">CARTO</a>',
            }),
            visible: true,
        }),
        'carto-light': new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attributions: '&copy; <a href="https://carto.com/">CARTO</a>',
            }),
            visible: false,
        }),
    };
}

// ===== Map Setup =====
let map, heatmapLayer, pointsLayer, clusterLayer, geozoneLayer, workZoneLayer, incidentLayer;
let popupOverlay, selectedTrackLayer;
let scenarioLayer; // For scenario-specific features (GPS lines, purchase markers, crime radius)
let basemapLayers = {};

function createCirclePolygon(centerLon, centerLat, radiusKm, numPoints) {
    numPoints = numPoints || 64;
    const coords = [];
    const R = 6371;
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        const lat2 = Math.asin(
            Math.sin(centerLat * Math.PI / 180) * Math.cos(radiusKm / R) +
            Math.cos(centerLat * Math.PI / 180) * Math.sin(radiusKm / R) * Math.cos(angle)
        );
        const lon2 = (centerLon * Math.PI / 180) + Math.atan2(
            Math.sin(angle) * Math.sin(radiusKm / R) * Math.cos(centerLat * Math.PI / 180),
            Math.cos(radiusKm / R) - Math.sin(centerLat * Math.PI / 180) * Math.sin(lat2)
        );
        coords.push(ol.proj.fromLonLat([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]));
    }
    return new ol.geom.Polygon([coords]);
}

function initMap() {
    basemapLayers = createBasemapLayers();
    const basemapArray = Object.values(basemapLayers);

    heatmapLayer = new ol.layer.Heatmap({
        source: new ol.source.Vector(),
        blur: 15, radius: 8, weight: () => 0.5,
        gradient: ['#000033', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff8800', '#ff0000'],
        opacity: 0.7,
    });

    pointsLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: (feature) => {
            const isSelected = feature.get('migrantId') === state.selectedMigrant;
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: isSelected ? 6 : 3,
                    fill: new ol.style.Fill({ color: isSelected ? '#1e4d8c' : 'rgba(30, 77, 140, 0.6)' }),
                    stroke: isSelected ? new ol.style.Stroke({ color: '#fff', width: 2 }) : undefined,
                }),
            });
        },
    });

    const clusterSource = new ol.source.Cluster({ distance: 40, source: new ol.source.Vector() });
    clusterLayer = new ol.layer.Vector({
        source: clusterSource, visible: false,
        style: (feature) => {
            const size = feature.get('features').length;
            const radius = Math.min(8 + Math.sqrt(size) * 3, 40);
            let color = 'rgba(30,77,140,0.7)';
            if (size > 20) color = 'rgba(230,133,10,0.8)';
            if (size > 50) color = 'rgba(204,0,0,0.8)';
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius,
                    fill: new ol.style.Fill({ color }),
                    stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.5)', width: 1.5 }),
                }),
                text: new ol.style.Text({
                    text: size.toString(),
                    fill: new ol.style.Fill({ color: '#fff' }),
                    font: '700 12px PT Sans, sans-serif',
                }),
            });
        },
    });

    geozoneLayer = new ol.layer.Vector({
        source: new ol.source.Vector(), visible: true,
        style: (feature) => new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(124, 58, 237, 0.7)', width: 2.5, lineDash: [10, 6] }),
            fill: new ol.style.Fill({ color: 'rgba(124, 58, 237, 0.08)' }),
            text: new ol.style.Text({
                text: feature.get('name'),
                fill: new ol.style.Fill({ color: 'rgba(124, 58, 237, 0.9)' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                font: '700 13px PT Sans, sans-serif', overflow: true,
            }),
        }),
    });

    workZoneLayer = new ol.layer.Vector({
        source: new ol.source.Vector(), visible: true,
        style: (feature) => {
            const isWork = feature.get('zoneType') === 'work';
            const color = isWork ? 'rgba(230, 133, 10, 0.7)' : 'rgba(22, 128, 60, 0.7)';
            const fillColor = isWork ? 'rgba(230, 133, 10, 0.1)' : 'rgba(22, 128, 60, 0.1)';
            return new ol.style.Style({
                stroke: new ol.style.Stroke({ color, width: 2, lineDash: [6, 4] }),
                fill: new ol.style.Fill({ color: fillColor }),
                text: new ol.style.Text({
                    text: feature.get('name'),
                    fill: new ol.style.Fill({ color }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                    font: '600 11px PT Sans, sans-serif', overflow: true,
                }),
            });
        },
    });

    incidentLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: (feature) => {
            const type = feature.get('type');
            const color = TYPE_COLORS[type] || '#cc0000';
            return new ol.style.Style({
                image: new ol.style.RegularShape({
                    points: 3, radius: 10,
                    fill: new ol.style.Fill({ color }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 1.5 }),
                }),
            });
        },
    });

    selectedTrackLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#1e4d8c', width: 3 }),
        }),
    });

    // Scenario layer for GPS lines, purchase markers, crime radius etc.
    scenarioLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        visible: true,
    });

    const popupEl = document.getElementById('popup');
    popupOverlay = new ol.Overlay({
        element: popupEl,
        autoPan: { animation: { duration: 200 } },
        positioning: 'bottom-center', offset: [0, -15],
    });

    map = new ol.Map({
        target: 'map',
        layers: [
            ...basemapArray,
            heatmapLayer, geozoneLayer, workZoneLayer,
            selectedTrackLayer, scenarioLayer,
            pointsLayer, clusterLayer, incidentLayer,
        ],
        overlays: [popupOverlay],
        view: new ol.View({
            center: ol.proj.fromLonLat([37.6173, 55.7558]),
            zoom: 10,
        }),
        controls: ol.control.defaults.defaults({ attribution: true, zoom: true }),
    });

    document.getElementById('basemap-select').addEventListener('change', (e) => {
        const selected = e.target.value;
        Object.entries(basemapLayers).forEach(([key, layer]) => layer.setVisible(key === selected));
    });

    map.on('singleclick', (evt) => {
        let hit = false;
        map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
            if (hit) return;
            if (layer === incidentLayer) {
                hit = true;
                showIncidentPopup(feature.getProperties(), evt.coordinate);
            } else if (layer === scenarioLayer) {
                hit = true;
                const props = feature.getProperties();
                if (props.scenarioType) showScenarioPopup(props, evt.coordinate);
            } else if (layer === pointsLayer) {
                hit = true;
                const mid = feature.get('migrantId');
                if (mid) selectMigrant(mid);
            } else if (layer === clusterLayer) {
                hit = true;
                const features = feature.get('features');
                if (features && features.length > 1) {
                    const extent = ol.extent.createEmpty();
                    features.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
                    map.getView().fit(extent, { padding: [60,60,60,60], duration: 500 });
                } else if (features && features.length === 1) {
                    const mid = features[0].get('migrantId');
                    if (mid) selectMigrant(mid);
                }
            }
        }, { hitTolerance: 5 });
        if (!hit) hidePopup();
    });

    map.on('pointermove', (evt) => {
        map.getTargetElement().style.cursor = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 5 }) ? 'pointer' : '';
    });
}

// ===== Populate static layers =====
function populateGeozones() {
    const source = geozoneLayer.getSource();
    source.clear();
    state.geozones.forEach(gz => {
        const poly = createCirclePolygon(gz.center_lon, gz.center_lat, gz.radius_km, 64);
        source.addFeature(new ol.Feature({ geometry: poly, name: gz.name, id: gz.id }));
    });
}

function populateWorkZones() {
    const source = workZoneLayer.getSource();
    source.clear();
    state.zones.work_zones.forEach(z => {
        const radiusKm = z.radius * 111;
        const poly = createCirclePolygon(z.lon, z.lat, radiusKm, 32);
        source.addFeature(new ol.Feature({ geometry: poly, name: z.name, zoneType: 'work' }));
    });
    state.zones.residential_zones.forEach(z => {
        const radiusKm = z.radius * 111;
        const poly = createCirclePolygon(z.lon, z.lat, radiusKm, 32);
        source.addFeature(new ol.Feature({ geometry: poly, name: z.name, zoneType: 'residential' }));
    });
}

// ===== Update map for current time step =====
async function updateMapForStep(step) {
    const date = stepToDate(step);
    const dayStr = formatDateShort(date);
    const hour = date.getHours();
    const hourStr = `T${String(hour).padStart(2,'0')}:00:00`;

    let dayData;
    try { dayData = await loadDayTracks(dayStr); } catch(e) { return; }

    const features = [], heatFeatures = [], clusterFeatures = [];

    for (const [migrantId, points] of Object.entries(dayData)) {
        const pt = points.find(p => p.t.includes(hourStr));
        if (!pt) continue;
        const coord = ol.proj.fromLonLat([pt.lon, pt.lat]);
        features.push(new ol.Feature({ geometry: new ol.geom.Point(coord), migrantId }));
        heatFeatures.push(new ol.Feature({ geometry: new ol.geom.Point(coord) }));
        clusterFeatures.push(new ol.Feature({ geometry: new ol.geom.Point(coord), migrantId }));
    }

    pointsLayer.getSource().clear(); pointsLayer.getSource().addFeatures(features);
    heatmapLayer.getSource().clear(); heatmapLayer.getSource().addFeatures(heatFeatures);
    clusterLayer.getSource().getSource().clear(); clusterLayer.getSource().getSource().addFeatures(clusterFeatures);

    updateIncidentLayer(dayStr);
    updateScenarioLayer(dayStr, hour);
    document.getElementById('current-datetime').textContent = formatDateTime(date);
    document.getElementById('timeline-slider').value = step;

    if (state.selectedMigrant) updateSelectedTrack(state.selectedMigrant, dayStr);
}

function updateIncidentLayer(dayStr) {
    const source = incidentLayer.getSource();
    source.clear();
    state.incidents.filter(inc => {
        if (!inc.timestamp.startsWith(dayStr)) return false;
        if (state.filterType !== 'all' && inc.type !== state.filterType) return false;
        if (state.filterSeverity !== 'all' && inc.severity !== state.filterSeverity) return false;
        return true;
    }).forEach(inc => {
        source.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([inc.lon, inc.lat])),
            type: inc.type,
            severity: inc.severity,
            description: inc.description,
            migrant_id: inc.migrant_id,
            timestamp: inc.timestamp,
            count: inc.count,
            operator_lon: inc.operator_lon,
            operator_lat: inc.operator_lat,
            distance_m: inc.distance_m,
            distance_km: inc.distance_km,
            purchase_lon: inc.purchase_lon,
            purchase_lat: inc.purchase_lat,
            store_name: inc.store_name,
            home_lon: inc.home_lon,
            home_lat: inc.home_lat,
            crime_id: inc.crime_id,
        }));
    });
}

// ===== Scenario Layer — GPS lines, purchase dots, crime radius =====
function updateScenarioLayer(dayStr, hour) {
    const source = scenarioLayer.getSource();
    source.clear();

    const ts = `${dayStr}T${String(hour).padStart(2,'0')}:00:00`;

    // GPS Discrepancy lines for this hour
    state.gpsDiscrepancies.filter(d => d.timestamp === ts).forEach(d => {
        const appCoord = ol.proj.fromLonLat([d.app_lon, d.app_lat]);
        const opCoord = ol.proj.fromLonLat([d.operator_lon, d.operator_lat]);
        // Dashed line between app and operator position
        const lineF = new ol.Feature({
            geometry: new ol.geom.LineString([appCoord, opCoord]),
            scenarioType: 'gps_line',
        });
        lineF.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(230, 57, 70, 0.7)', width: 2, lineDash: [8, 4] }),
        }));
        source.addFeature(lineF);

        // Operator position marker (red hollow circle)
        const opF = new ol.Feature({
            geometry: new ol.geom.Point(opCoord),
            scenarioType: 'gps_operator',
            migrant_id: d.migrant_id,
            distance_m: d.distance_m,
            cell_tower: d.cell_tower,
            timestamp: d.timestamp,
        });
        opF.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: 'rgba(230, 57, 70, 0.3)' }),
                stroke: new ol.style.Stroke({ color: '#e63946', width: 2 }),
            }),
            text: new ol.style.Text({
                text: '📡',
                font: '14px sans-serif',
                offsetY: -16,
            }),
        }));
        source.addFeature(opF);
    });

    // Purchase markers for this hour
    state.purchases.filter(p => p.timestamp === ts).forEach(p => {
        const pCoord = ol.proj.fromLonLat([p.purchase_lon, p.purchase_lat]);
        const color = p.anomaly ? '#d4a017' : '#2d6a4f';
        const pF = new ol.Feature({
            geometry: new ol.geom.Point(pCoord),
            scenarioType: 'purchase',
            migrant_id: p.migrant_id,
            store_name: p.store_name,
            amount: p.amount,
            anomaly: p.anomaly,
            description: p.description,
        });
        pF.setStyle(new ol.style.Style({
            image: new ol.style.RegularShape({
                points: 4, radius: 7, angle: Math.PI / 4,
                fill: new ol.style.Fill({ color }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 1.5 }),
            }),
        }));
        source.addFeature(pF);
    });

    // Crime scene radius for this hour
    state.crimeSnapshots.filter(c => c.timestamp === ts).forEach(c => {
        const poly = createCirclePolygon(c.crime_lon, c.crime_lat, 0.5, 64);
        const radiusF = new ol.Feature({
            geometry: poly,
            scenarioType: 'crime_radius',
            crime_name: c.crime_name,
            total_nearby: c.total_nearby,
            crime_id: c.crime_id,
        });
        radiusF.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(192, 57, 43, 0.9)', width: 3, lineDash: [4, 4] }),
            fill: new ol.style.Fill({ color: 'rgba(192, 57, 43, 0.12)' }),
            text: new ol.style.Text({
                text: `🔴 ${c.crime_name}`,
                fill: new ol.style.Fill({ color: '#c0392b' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                font: '700 12px PT Sans, sans-serif',
                overflow: true,
            }),
        }));
        source.addFeature(radiusF);

        // Highlight migrants nearby
        c.migrants_nearby.forEach(mn => {
            const mCoord = ol.proj.fromLonLat([mn.lon, mn.lat]);
            const mF = new ol.Feature({
                geometry: new ol.geom.Point(mCoord),
                scenarioType: 'crime_nearby_migrant',
                migrant_id: mn.migrant_id,
                distance_m: mn.distance_m,
            });
            mF.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({ color: 'rgba(192, 57, 43, 0.6)' }),
                    stroke: new ol.style.Stroke({ color: '#c0392b', width: 2 }),
                }),
            }));
            source.addFeature(mF);
        });
    });

    // Night deviation markers (show home + actual position for selected migrant or all at night)
    if (hour >= 23 || hour <= 5) {
        const nightIncs = state.incidents.filter(i =>
            i.type === 'night_deviation' && i.timestamp.startsWith(dayStr)
        );
        nightIncs.forEach(ni => {
            // Line from home to actual night position
            const homeCoord = ol.proj.fromLonLat([ni.home_lon, ni.home_lat]);
            const actualCoord = ol.proj.fromLonLat([ni.lon, ni.lat]);
            const lineF = new ol.Feature({
                geometry: new ol.geom.LineString([homeCoord, actualCoord]),
                scenarioType: 'night_line',
            });
            lineF.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: 'rgba(108, 52, 131, 0.5)', width: 1.5, lineDash: [6, 4] }),
            }));
            source.addFeature(lineF);

            // Home marker (where they should be)
            const homeF = new ol.Feature({
                geometry: new ol.geom.Point(homeCoord),
                scenarioType: 'night_home',
                migrant_id: ni.migrant_id,
            });
            homeF.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 4,
                    fill: new ol.style.Fill({ color: 'rgba(108, 52, 131, 0.2)' }),
                    stroke: new ol.style.Stroke({ color: '#6c3483', width: 1.5, lineDash: [3,3] }),
                }),
            }));
            source.addFeature(homeF);
        });
    }
}

// ===== Scenario Popup =====
function showScenarioPopup(props, coordinate) {
    const content = document.getElementById('popup-content');
    let html = '';

    if (props.scenarioType === 'gps_operator') {
        html = `<div class="popup-title" style="color:#e63946">📡 Позиция оператора</div>`;
        html += `<div class="popup-row"><span>Мигрант</span><strong>${props.migrant_id}</strong></div>`;
        html += `<div class="popup-row"><span>Расхождение</span><strong>${props.distance_m} м</strong></div>`;
        html += `<div class="popup-row"><span>Базовая станция</span><strong>${props.cell_tower}</strong></div>`;
        html += `<div style="font-size:11px;color:#e63946;margin-top:6px">Данные оператора не совпадают с GPS приложения</div>`;
    } else if (props.scenarioType === 'purchase') {
        const anomLabel = props.anomaly ? '⚠️ АНОМАЛИЯ' : '';
        html = `<div class="popup-title" style="color:${props.anomaly ? '#d4a017' : '#2d6a4f'}">🛒 Покупка ${anomLabel}</div>`;
        html += `<div class="popup-row"><span>Мигрант</span><strong>${props.migrant_id}</strong></div>`;
        html += `<div class="popup-row"><span>Магазин</span><strong>${props.store_name}</strong></div>`;
        html += `<div class="popup-row"><span>Сумма</span><strong>${props.amount} ₽</strong></div>`;
        html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${props.description}</div>`;
    } else if (props.scenarioType === 'crime_radius') {
        html = `<div class="popup-title" style="color:#c0392b">🔴 ${props.crime_name}</div>`;
        html += `<div class="popup-row"><span>Мигрантов в зоне</span><strong>${props.total_nearby} чел.</strong></div>`;
        html += `<div class="popup-row"><span>Радиус</span><strong>500 м</strong></div>`;
    } else if (props.scenarioType === 'crime_nearby_migrant') {
        html = `<div class="popup-title" style="color:#c0392b">Мигрант у инцидента</div>`;
        html += `<div class="popup-row"><span>ID</span><strong>${props.migrant_id}</strong></div>`;
        html += `<div class="popup-row"><span>Расстояние</span><strong>${props.distance_m} м</strong></div>`;
        html += `<button class="detail-btn primary" style="margin-top:6px;width:100%" onclick="selectMigrant('${props.migrant_id}')">Открыть карточку</button>`;
    }

    if (!html) return;
    content.innerHTML = html;
    popupOverlay.setPosition(coordinate);
    document.getElementById('popup').classList.add('visible');
}

// ===== Selected migrant track =====
async function updateSelectedTrack(migrantId, dayStr) {
    const source = selectedTrackLayer.getSource();
    source.clear();
    let dayData;
    try { dayData = await loadDayTracks(dayStr); } catch(e) { return; }

    const points = dayData[migrantId];
    if (!points || points.length < 2) return;

    const coords = points.map(p => ol.proj.fromLonLat([p.lon, p.lat]));
    source.addFeature(new ol.Feature({ geometry: new ol.geom.LineString(coords) }));

    const migrant = state.migrants.find(m => m.id === migrantId);
    if (migrant) {
        const homeF = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(migrant.home)) });
        homeF.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({ color: '#16803c' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
            }),
            text: new ol.style.Text({ text: 'Д', fill: new ol.style.Fill({ color: '#fff' }), font: '700 10px PT Sans' }),
        }));
        source.addFeature(homeF);

        const workF = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(migrant.work)) });
        workF.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({ color: '#e6850a' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
            }),
            text: new ol.style.Text({ text: 'Р', fill: new ol.style.Fill({ color: '#fff' }), font: '700 10px PT Sans' }),
        }));
        source.addFeature(workF);
    }
}

// ===== Popup =====
function showIncidentPopup(props, coordinate) {
    const content = document.getElementById('popup-content');
    const ts = new Date(props.timestamp);

    let html = `<div class="popup-title">${TYPE_LABELS[props.type] || props.type} — ${SEVERITY_LABELS[props.severity]}</div>`;
    html += `<div style="font-size:12px;color:#4a5568;margin-bottom:8px">${props.description}</div>`;
    html += `<div class="popup-row"><span>Время</span><strong>${formatDateTime(ts)}</strong></div>`;
    if (props.migrant_id) html += `<div class="popup-row"><span>Мигрант</span><strong>${props.migrant_id}</strong></div>`;
    if (props.count) html += `<div class="popup-row"><span>Количество</span><strong>${props.count} чел.</strong></div>`;

    // Type-specific details
    if (props.type === 'gps_discrepancy' && props.operator_lon) {
        html += `<div class="popup-row"><span>Расхождение</span><strong>${props.distance_m} м</strong></div>`;
        html += `<div style="font-size:11px;color:#e63946;margin-top:4px">📡 Красный маркер — позиция оператора</div>`;
    }
    if (props.type === 'phone_left' && props.store_name) {
        html += `<div class="popup-row"><span>Магазин</span><strong>${props.store_name}</strong></div>`;
        html += `<div class="popup-row"><span>Расстояние</span><strong>${props.distance_km} км</strong></div>`;
    }
    if (props.type === 'night_deviation' && props.distance_km) {
        html += `<div class="popup-row"><span>Расстояние от дома</span><strong>${props.distance_km} км</strong></div>`;
    }
    if (props.type === 'crime_scene' && props.crime_id) {
        html += `<div style="font-size:11px;color:#c0392b;margin-top:4px">🔴 Зона инцидента 500м показана на карте</div>`;
    }

    if (props.migrant_id) {
        html += `<button class="detail-btn primary" style="margin-top:8px;width:100%" onclick="selectMigrant('${props.migrant_id}')">Карточка мигранта</button>`;
    }

    content.innerHTML = html;
    popupOverlay.setPosition(coordinate);
    document.getElementById('popup').classList.add('visible');
}

function hidePopup() {
    document.getElementById('popup').classList.remove('visible');
    popupOverlay.setPosition(undefined);
}

document.getElementById('popup-closer').addEventListener('click', (e) => {
    e.preventDefault();
    hidePopup();
});

// ===== Migrant selection =====
function selectMigrant(migrantId) {
    state.selectedMigrant = migrantId;
    const migrant = state.migrants.find(m => m.id === migrantId);
    if (!migrant) return;

    const migrantIncidents = state.incidents.filter(i => i.migrant_id === migrantId);
    const migrantPurchases = state.purchases.filter(p => p.migrant_id === migrantId);
    const migrantGPS = state.gpsDiscrepancies.filter(g => g.migrant_id === migrantId);

    // Count by type
    const incByType = {};
    migrantIncidents.forEach(i => { incByType[i.type] = (incByType[i.type] || 0) + 1; });

    const panel = document.getElementById('migrant-detail');
    let incSummary = Object.entries(incByType).map(([t, c]) => 
        `<span class="incident-type-badge ${t}" style="margin:1px">${TYPE_LABELS[t]}: ${c}</span>`
    ).join(' ');

    document.getElementById('migrant-info').innerHTML = `
        <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">${migrant.id}</span></div>
        <div class="detail-row"><span class="detail-label">Имя</span><span class="detail-value">${migrant.name}</span></div>
        <div class="detail-row"><span class="detail-label">Гражданство</span><span class="detail-value">${migrant.nationality}</span></div>
        <div class="detail-row"><span class="detail-label">Занятость</span><span class="detail-value">${migrant.occupation}</span></div>
        <div class="detail-row"><span class="detail-label">Рабочая зона</span><span class="detail-value">${migrant.work_zone}</span></div>
        <div class="detail-row"><span class="detail-label">Проживание</span><span class="detail-value">${migrant.home_zone}</span></div>
        <div class="detail-row"><span class="detail-label">График</span><span class="detail-value">${migrant.work_start}:00 — ${migrant.work_end}:00</span></div>
        <div class="detail-row"><span class="detail-label">Телефон</span><span class="detail-value">${migrant.phone}</span></div>
        <div class="detail-row"><span class="detail-label">IMEI</span><span class="detail-value" style="font-size:10px">${migrant.imei}</span></div>
        <div class="detail-row"><span class="detail-label">Геозона</span><span class="detail-value">${migrant.geozone_name}</span></div>
        <div class="detail-row"><span class="detail-label">Регистрация</span><span class="detail-value">${migrant.registration_date}</span></div>
        <div class="detail-row"><span class="detail-label">Разрешение до</span><span class="detail-value">${migrant.permit_expires}</span></div>
        <div class="detail-row"><span class="detail-label">Покупок</span><span class="detail-value">${migrantPurchases.length}</span></div>
        <div class="detail-row"><span class="detail-label">GPS расхождений</span><span class="detail-value" style="color:${migrantGPS.length > 0 ? '#e63946' : '#16803c'}">${migrantGPS.length}</span></div>
        <div class="detail-row"><span class="detail-label">Инциденты</span><span class="detail-value" style="color:${migrantIncidents.length > 0 ? '#cc0000' : '#16803c'}">${migrantIncidents.length}</span></div>
        ${incSummary ? `<div style="margin-top:6px;line-height:1.8">${incSummary}</div>` : ''}
        <div class="detail-actions">
            <button class="detail-btn primary" onclick="zoomToMigrant('${migrantId}')">На карте</button>
            <button class="detail-btn" onclick="showMigrantIncidents('${migrantId}')">Инциденты</button>
        </div>`;
    panel.style.display = 'block';

    const date = stepToDate(state.currentStep);
    updateSelectedTrack(migrantId, formatDateShort(date));
    pointsLayer.changed();
}

function deselectMigrant() {
    state.selectedMigrant = null;
    document.getElementById('migrant-detail').style.display = 'none';
    selectedTrackLayer.getSource().clear();
    pointsLayer.changed();
}

document.getElementById('close-detail').addEventListener('click', deselectMigrant);

window.zoomToMigrant = async function(migrantId) {
    const date = stepToDate(state.currentStep);
    const dayStr = formatDateShort(date);
    const hourStr = `T${String(date.getHours()).padStart(2,'0')}:00:00`;
    let dayData;
    try { dayData = await loadDayTracks(dayStr); } catch(e) { return; }
    const points = dayData[migrantId];
    if (!points) return;
    const pt = points.find(p => p.t.includes(hourStr));
    if (!pt) return;
    map.getView().animate({ center: ol.proj.fromLonLat([pt.lon, pt.lat]), zoom: 14, duration: 500 });
};

window.showMigrantIncidents = function(migrantId) {
    state.filterType = 'all';
    state.filterSeverity = 'all';
    updateFilterChips();
    renderIncidentList(state.incidents.filter(i => i.migrant_id === migrantId));
};

// ===== Navigate to crime scene =====
window.showCrimeScene = function(crimeId) {
    const crime = state.crimeSnapshots.find(c => c.crime_id === crimeId);
    if (!crime) return;
    const crimeDate = new Date(crime.timestamp);
    const dayDiff = Math.floor((crimeDate - START_DATE) / (1000*60*60*24));
    const step = dayDiff * 24 + crimeDate.getHours();
    if (step >= 0 && step < TOTAL_STEPS) {
        state.currentStep = step;
        updateMapForStep(step);
    }
    map.getView().animate({ center: ol.proj.fromLonLat([crime.crime_lon, crime.crime_lat]), zoom: 15, duration: 500 });
};

// ===== Incident list =====
function renderIncidentList(incidents) {
    const list = document.getElementById('incident-list');
    const count = document.getElementById('incident-count');

    if (!incidents) {
        incidents = state.incidents.filter(inc => {
            if (state.filterType !== 'all' && inc.type !== state.filterType) return false;
            if (state.filterSeverity !== 'all' && inc.severity !== state.filterSeverity) return false;
            return true;
        });
    }

    count.textContent = incidents.length;
    const display = incidents.slice(0, 100);

    list.innerHTML = display.map((inc) => {
        const ts = new Date(inc.timestamp);
        const dateStr = `${ts.getDate()} ${MONTHS_RU[ts.getMonth()].slice(0,3)}`;
        const timeStr = `${String(ts.getHours()).padStart(2,'0')}:00`;
        return `
            <div class="incident-card" data-lon="${inc.lon}" data-lat="${inc.lat}" data-ts="${inc.timestamp}">
                <div class="incident-card-header">
                    <span class="incident-type-badge ${inc.type}">${TYPE_LABELS[inc.type] || inc.type}</span>
                    <span class="severity-indicator ${inc.severity}">${SEVERITY_LABELS[inc.severity]}</span>
                </div>
                <div class="incident-desc">${inc.description}</div>
                <div class="incident-meta">
                    <span>${dateStr}, ${timeStr}</span>
                    ${inc.migrant_id ? `<span>${inc.migrant_id}</span>` : ''}
                </div>
            </div>`;
    }).join('');

    list.querySelectorAll('.incident-card').forEach(card => {
        card.addEventListener('click', () => {
            const lon = parseFloat(card.dataset.lon);
            const lat = parseFloat(card.dataset.lat);
            const incDate = new Date(card.dataset.ts);
            const dayDiff = Math.floor((incDate - START_DATE) / (1000*60*60*24));
            const step = dayDiff * 24 + incDate.getHours();
            if (step >= 0 && step < TOTAL_STEPS) {
                state.currentStep = step;
                updateMapForStep(step);
            }
            map.getView().animate({ center: ol.proj.fromLonLat([lon, lat]), zoom: 14, duration: 500 });
            list.querySelectorAll('.incident-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });
}

// ===== Crime Snapshots Panel =====
function renderCrimeSnapshotsPanel() {
    const container = document.getElementById('crime-list');
    if (!container) return;

    container.innerHTML = state.crimeSnapshots.map(c => {
        const ts = new Date(c.timestamp);
        const dateStr = `${ts.getDate()} ${MONTHS_RU[ts.getMonth()].slice(0,3)}`;
        const timeStr = `${String(ts.getHours()).padStart(2,'0')}:00`;
        return `
            <div class="incident-card crime-card" onclick="showCrimeScene('${c.crime_id}')">
                <div class="incident-card-header">
                    <span class="incident-type-badge crime_scene">Инцидент</span>
                    <span class="severity-indicator high">${c.total_nearby} чел.</span>
                </div>
                <div class="incident-desc">${c.crime_name}</div>
                <div class="incident-meta">
                    <span>${dateStr}, ${timeStr}</span>
                    <span>R = 500м</span>
                </div>
            </div>`;
    }).join('');
}

// ===== Filters =====
function updateFilterChips() {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.type === state.filterType));
    document.querySelectorAll('.severity-chip').forEach(c => c.classList.toggle('active', c.dataset.severity === state.filterSeverity));
}

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        state.filterType = chip.dataset.type;
        updateFilterChips();
        renderIncidentList();
        updateIncidentLayer(formatDateShort(stepToDate(state.currentStep)));
    });
});

document.querySelectorAll('.severity-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        state.filterSeverity = chip.dataset.severity;
        updateFilterChips();
        renderIncidentList();
        updateIncidentLayer(formatDateShort(stepToDate(state.currentStep)));
    });
});

// ===== Layer toggles =====
const layerMap = {
    'layer-heatmap': () => heatmapLayer,
    'layer-points': () => pointsLayer,
    'layer-clusters': () => clusterLayer,
    'layer-geozones': () => geozoneLayer,
    'layer-work-zones': () => workZoneLayer,
    'layer-incidents': () => incidentLayer,
    'layer-scenarios': () => scenarioLayer,
};

Object.entries(layerMap).forEach(([id, getLayer]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => getLayer().setVisible(e.target.checked));
});

// ===== Timeline =====
const slider = document.getElementById('timeline-slider');
slider.addEventListener('input', () => {
    state.currentStep = parseInt(slider.value);
    updateMapForStep(state.currentStep);
});

document.getElementById('btn-prev').addEventListener('click', () => {
    if (state.currentStep > 0) { state.currentStep--; updateMapForStep(state.currentStep); }
});
document.getElementById('btn-next').addEventListener('click', () => {
    if (state.currentStep < TOTAL_STEPS - 1) { state.currentStep++; updateMapForStep(state.currentStep); }
});
document.getElementById('btn-prev-day').addEventListener('click', () => {
    state.currentStep = Math.max(0, state.currentStep - 24);
    updateMapForStep(state.currentStep);
});
document.getElementById('btn-next-day').addEventListener('click', () => {
    state.currentStep = Math.min(TOTAL_STEPS - 1, state.currentStep + 24);
    updateMapForStep(state.currentStep);
});

const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', togglePlay);

function togglePlay() {
    state.playing = !state.playing;
    playBtn.classList.toggle('active', state.playing);
    playBtn.textContent = state.playing ? '\u23F8' : '\u25B6';
    if (state.playing) startPlayback(); else stopPlayback();
}

function startPlayback() {
    state.playTimer = setInterval(() => {
        state.currentStep = state.currentStep < TOTAL_STEPS - 1 ? state.currentStep + 1 : 0;
        updateMapForStep(state.currentStep);
    }, Math.max(100, 500 / state.playSpeed));
}

function stopPlayback() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
}

const speeds = [0.5, 1, 2, 4, 8, 16];
let speedIdx = 1;

document.getElementById('speed-down').addEventListener('click', () => {
    speedIdx = Math.max(0, speedIdx - 1);
    state.playSpeed = speeds[speedIdx];
    document.getElementById('speed-label').textContent = state.playSpeed + 'x';
    if (state.playing) { stopPlayback(); startPlayback(); }
});

document.getElementById('speed-up').addEventListener('click', () => {
    speedIdx = Math.min(speeds.length - 1, speedIdx + 1);
    state.playSpeed = speeds[speedIdx];
    document.getElementById('speed-label').textContent = state.playSpeed + 'x';
    if (state.playing) { stopPlayback(); startPlayback(); }
});

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch(e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft':
            e.preventDefault();
            state.currentStep = Math.max(0, state.currentStep - (e.shiftKey ? 24 : 1));
            updateMapForStep(state.currentStep);
            break;
        case 'ArrowRight':
            e.preventDefault();
            state.currentStep = Math.min(TOTAL_STEPS - 1, state.currentStep + (e.shiftKey ? 24 : 1));
            updateMapForStep(state.currentStep);
            break;
        case 'Escape': deselectMigrant(); hidePopup(); break;
    }
});

// ===== Search =====
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) { searchResults.classList.remove('visible'); return; }
    const matches = state.migrants.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 10);
    if (matches.length === 0) { searchResults.classList.remove('visible'); return; }

    searchResults.innerHTML = matches.map(m => `
        <div class="search-result-item" data-id="${m.id}">
            <span class="search-result-id">${m.id}</span>
            <span class="search-result-name">${m.name}</span>
        </div>`).join('');
    searchResults.classList.add('visible');

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            selectMigrant(item.dataset.id);
            searchInput.value = '';
            searchResults.classList.remove('visible');
            zoomToMigrant(item.dataset.id);
        });
    });
});

searchInput.addEventListener('blur', () => { setTimeout(() => searchResults.classList.remove('visible'), 200); });

// ===== Tab switching (Incidents / Scenarios) =====
function initTabs() {
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('incidents-panel').style.display = target === 'incidents' ? 'flex' : 'none';
            document.getElementById('scenarios-panel').style.display = target === 'scenarios' ? 'flex' : 'none';
        });
    });
}

// ===== Init =====
async function init() {
    const loadingEl = document.createElement('div');
    loadingEl.id = 'loading-overlay';
    loadingEl.innerHTML = '<div class="spinner"></div><div class="loading-text">Загрузка данных...</div>';
    document.body.appendChild(loadingEl);

    try {
        await loadAllData();
        initMap();
        populateGeozones();
        populateWorkZones();
        await updateMapForStep(0);
        renderIncidentList();
        renderCrimeSnapshotsPanel();
        initTabs();

        loadingEl.style.opacity = '0';
        loadingEl.style.transition = 'opacity 0.3s';
        setTimeout(() => loadingEl.remove(), 300);
    } catch(err) {
        console.error('Init failed:', err);
        loadingEl.innerHTML = `<div style="color:#cc0000;font-size:14px">Ошибка загрузки: ${err.message}</div>`;
    }
}

init();
