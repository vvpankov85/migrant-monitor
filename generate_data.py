#!/usr/bin/env python3
"""
Generate realistic migrant geolocation data for Moscow.
1000+ migrants, 30 days, hourly positions.
Includes normal patterns + anomalies for 9 use cases:
  1. Route deviation (not at work during work hours)
  2. Crowd clustering (unusual gatherings)
  3. Geozone violation (leaving allowed area)
  4. Time anomalies (night movement, daytime inactivity)
  --- NEW SCENARIOS ---
  5. GPS vs Operator discrepancy (app GPS ≠ cell tower location)
  6. Phone left behind (device stationary but activity elsewhere)
  7. Shadow employment (lunch purchases near undeclared worksite)
  8. Night deviation (sleeping not at registration address)
  9. Incident crowd snapshot (who was near a crime scene)
"""

import json
import random
import math
from datetime import datetime, timedelta

random.seed(42)

# Moscow bounds (central + suburbs)
MOSCOW_CENTER = [37.6173, 55.7558]
MOSCOW_BOUNDS = {
    "min_lon": 37.35,
    "max_lon": 37.85,
    "min_lat": 55.60,
    "max_lat": 55.90
}

# Key Moscow locations for realistic placement
WORK_ZONES = [
    {"name": "Москва-Сити", "lon": 37.5374, "lat": 55.7494, "radius": 0.01},
    {"name": "Промзона Очаково", "lon": 37.4505, "lat": 55.6862, "radius": 0.015},
    {"name": "Промзона Бирюлёво", "lon": 37.6509, "lat": 55.5912, "radius": 0.012},
    {"name": "ТЦ Мега Тёплый Стан", "lon": 37.4730, "lat": 55.6193, "radius": 0.008},
    {"name": "Стройка Коммунарка", "lon": 37.4890, "lat": 55.5610, "radius": 0.015},
    {"name": "Рынок Садовод", "lon": 37.8250, "lat": 55.6280, "radius": 0.012},
    {"name": "Рынок Фуд-Сити", "lon": 37.4310, "lat": 55.5752, "radius": 0.010},
    {"name": "Промзона Чертаново", "lon": 37.6050, "lat": 55.6220, "radius": 0.012},
    {"name": "Строительство ЗИЛ", "lon": 37.6350, "lat": 55.7010, "radius": 0.010},
    {"name": "Промзона Люблино", "lon": 37.7440, "lat": 55.6750, "radius": 0.012},
    {"name": "Логистика Подольск", "lon": 37.5450, "lat": 55.4310, "radius": 0.015},
    {"name": "Стройка Мытищи", "lon": 37.7380, "lat": 55.9120, "radius": 0.012},
]

RESIDENTIAL_ZONES = [
    {"name": "Общежития Бирюлёво", "lon": 37.6400, "lat": 55.5850, "radius": 0.012},
    {"name": "Общежития Люблино", "lon": 37.7500, "lat": 55.6800, "radius": 0.010},
    {"name": "Общежития Кузьминки", "lon": 37.7800, "lat": 55.7000, "radius": 0.008},
    {"name": "Общежития Текстильщики", "lon": 37.7300, "lat": 55.7080, "radius": 0.008},
    {"name": "Общежития Марьино", "lon": 37.7400, "lat": 55.6500, "radius": 0.010},
    {"name": "Общежития Котельники", "lon": 37.8600, "lat": 55.6600, "radius": 0.010},
    {"name": "Общежития Некрасовка", "lon": 37.9100, "lat": 55.7000, "radius": 0.008},
    {"name": "Общежития Царицыно", "lon": 37.6700, "lat": 55.6200, "radius": 0.008},
    {"name": "Общежития Чертаново", "lon": 37.5900, "lat": 55.6100, "radius": 0.010},
    {"name": "Общежития Вешняки", "lon": 37.8200, "lat": 55.7200, "radius": 0.008},
]

# Geozones (allowed areas for specific migrant groups)
GEOZONES = [
    {"id": "gz1", "name": "Южный округ", "center_lon": 37.63, "center_lat": 55.61, "radius_km": 8},
    {"id": "gz2", "name": "Юго-Восточный округ", "center_lon": 37.76, "center_lat": 55.68, "radius_km": 7},
    {"id": "gz3", "name": "Западный округ", "center_lon": 37.45, "center_lat": 55.70, "radius_km": 7},
    {"id": "gz4", "name": "Центральный округ", "center_lon": 37.62, "center_lat": 55.75, "radius_km": 5},
    {"id": "gz5", "name": "Северо-Восточный округ", "center_lon": 37.68, "center_lat": 55.84, "radius_km": 6},
]

NATIONALITIES = ["Узбекистан", "Таджикистан", "Кыргызстан", "Молдова", "Армения", "Азербайджан"]
NAT_WEIGHTS = [35, 25, 20, 8, 7, 5]

OCCUPATIONS = ["Строительство", "Торговля", "Логистика", "Клининг", "Общепит", "Доставка"]
OCC_WEIGHTS = [30, 20, 15, 12, 13, 10]

FIRST_NAMES = ["Абдулло", "Азиз", "Алишер", "Бахтиёр", "Дильшод", "Жамшид", "Зафар", "Ибрагим",
               "Камол", "Лазиз", "Мансур", "Навруз", "Олим", "Рустам", "Сардор", "Тимур",
               "Улугбек", "Фарход", "Хасан", "Шерзод", "Ахмад", "Бобур", "Джасур",
               "Ёдгор", "Файзулло", "Хуршед", "Ислом", "Нурали", "Саид", "Мирзо"]

LAST_NAMES = ["Ахмедов", "Бакиров", "Валиев", "Гафуров", "Давлатов", "Ёкубов", "Жураев",
              "Закиров", "Исмоилов", "Каримов", "Латипов", "Мирзоев", "Назаров", "Облоқулов",
              "Пулатов", "Рахимов", "Сулейманов", "Турдиев", "Усманов", "Файзиев",
              "Хамидов", "Шарипов", "Эргашев", "Юсупов", "Абдуллаев", "Норматов"]

# ---- Purchase locations (stores, markets, ATMs in Moscow) ----
PURCHASE_LOCATIONS = [
    {"name": "Пятёрочка Бирюлёво", "lon": 37.6420, "lat": 55.5870, "type": "grocery"},
    {"name": "Магнит Люблино", "lon": 37.7520, "lat": 55.6780, "type": "grocery"},
    {"name": "Дикси Кузьминки", "lon": 37.7830, "lat": 55.7020, "type": "grocery"},
    {"name": "Перекрёсток Марьино", "lon": 37.7380, "lat": 55.6480, "type": "grocery"},
    {"name": "Фикс Прайс Чертаново", "lon": 37.6000, "lat": 55.6150, "type": "discount"},
    {"name": "Рынок Садовод", "lon": 37.8250, "lat": 55.6280, "type": "market"},
    {"name": "Рынок Фуд-Сити", "lon": 37.4310, "lat": 55.5752, "type": "market"},
    {"name": "Столовая у стройки ЗИЛ", "lon": 37.6380, "lat": 55.7020, "type": "food"},
    {"name": "Кафе у Москва-Сити", "lon": 37.5400, "lat": 55.7500, "type": "food"},
    {"name": "Банкомат Сбербанк Текстильщики", "lon": 37.7310, "lat": 55.7090, "type": "atm"},
    {"name": "Банкомат Тинькофф Марьино", "lon": 37.7410, "lat": 55.6510, "type": "atm"},
    {"name": "Золотая Корона Бирюлёво", "lon": 37.6450, "lat": 55.5860, "type": "transfer"},
    {"name": "Золотая Корона Люблино", "lon": 37.7480, "lat": 55.6760, "type": "transfer"},
    {"name": "Western Union Кузьминки", "lon": 37.7820, "lat": 55.6990, "type": "transfer"},
    {"name": "Аптека Бирюлёво", "lon": 37.6430, "lat": 55.5880, "type": "pharmacy"},
    {"name": "Магазин стройматериалов Очаково", "lon": 37.4530, "lat": 55.6870, "type": "hardware"},
    {"name": "Столовая Промзона Очаково", "lon": 37.4520, "lat": 55.6850, "type": "food"},
    {"name": "Столовая Стройка Коммунарка", "lon": 37.4900, "lat": 55.5620, "type": "food"},
    {"name": "Пятёрочка Котельники", "lon": 37.8580, "lat": 55.6620, "type": "grocery"},
    {"name": "Столовая Стройка Мытищи", "lon": 37.7400, "lat": 55.9130, "type": "food"},
]

# ---- Incident crime locations for scenario 15 ----
CRIME_INCIDENTS = [
    {"day": 4, "hour": 22, "lon": 37.6450, "lat": 55.5880, "name": "Драка у общежития Бирюлёво", "type_crime": "assault"},
    {"day": 9, "hour": 2, "lon": 37.7500, "lat": 55.6790, "name": "Кража в магазине Люблино", "type_crime": "theft"},
    {"day": 14, "hour": 19, "lon": 37.8230, "lat": 55.6270, "name": "Разбой у рынка Садовод", "type_crime": "robbery"},
    {"day": 20, "hour": 23, "lon": 37.7800, "lat": 55.7010, "name": "Нарушение общественного порядка Кузьминки", "type_crime": "disorder"},
    {"day": 25, "hour": 1, "lon": 37.6380, "lat": 55.7020, "name": "Инцидент у стройки ЗИЛ", "type_crime": "assault"},
    {"day": 10, "hour": 15, "lon": 37.4310, "lat": 55.5760, "name": "Конфликт на Фуд-Сити", "type_crime": "disorder"},
]


def random_point_in_zone(zone):
    """Generate a random point within a zone (circle)."""
    angle = random.uniform(0, 2 * math.pi)
    r = zone["radius"] * math.sqrt(random.random())
    return [
        round(zone["lon"] + r * math.cos(angle), 6),
        round(zone["lat"] + r * math.sin(angle) * 0.6, 6)  # lat correction
    ]


def point_in_circle(lon, lat, center_lon, center_lat, radius_km):
    """Check if point is within radius_km of center."""
    dlat = (lat - center_lat) * 111.0
    dlon = (lon - center_lon) * 111.0 * math.cos(math.radians(center_lat))
    return math.sqrt(dlat**2 + dlon**2) <= radius_km


def distance_km(lon1, lat1, lon2, lat2):
    """Approximate distance in km between two points."""
    dlat = (lat2 - lat1) * 111.0
    dlon = (lon2 - lon1) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.sqrt(dlat**2 + dlon**2)


def generate_migrants(count=1000):
    migrants = []
    for i in range(count):
        home_zone = random.choice(RESIDENTIAL_ZONES)
        work_zone = random.choice(WORK_ZONES)
        geozone = random.choice(GEOZONES)
        
        home = random_point_in_zone(home_zone)
        work = random_point_in_zone(work_zone)
        
        nationality = random.choices(NATIONALITIES, weights=NAT_WEIGHTS, k=1)[0]
        occupation = random.choices(OCCUPATIONS, weights=OCC_WEIGHTS, k=1)[0]
        
        # Work schedule: most work 8-18, some 6-22 (construction), some irregular
        if occupation in ["Строительство", "Логистика"]:
            work_start = random.choice([6, 7, 8])
            work_end = random.choice([17, 18, 19, 20])
        elif occupation == "Доставка":
            work_start = random.choice([10, 11, 12])
            work_end = random.choice([20, 21, 22, 23])
        else:
            work_start = random.choice([8, 9, 10])
            work_end = random.choice([17, 18, 19])

        # IMEI and phone number for new scenarios
        imei = f"35{random.randint(1000000000000, 9999999999999)}"
        phone = f"+7{random.choice(['903','905','916','926','977','985','999'])}{random.randint(1000000, 9999999)}"
        
        migrant = {
            "id": f"M{i+1:04d}",
            "name": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            "nationality": nationality,
            "occupation": occupation,
            "home": home,
            "home_zone": home_zone["name"],
            "work": work,
            "work_zone": work_zone["name"],
            "geozone_id": geozone["id"],
            "geozone_name": geozone["name"],
            "work_start": work_start,
            "work_end": work_end,
            "registration_date": (datetime(2026, 2, 1) + timedelta(days=random.randint(0, 60))).strftime("%Y-%m-%d"),
            "permit_expires": (datetime(2026, 2, 1) + timedelta(days=random.randint(90, 365))).strftime("%Y-%m-%d"),
            "phone": phone,
            "imei": imei,
        }
        migrants.append(migrant)
    return migrants


def generate_tracks(migrants, start_date, days=30):
    """Generate hourly position data for all migrants over the period."""
    tracks = {}  # migrant_id -> [{timestamp, lon, lat}, ...]
    incidents = []
    
    # Decide which migrants will have anomalies
    num_migrants = len(migrants)
    
    # ~5% route deviation
    route_deviators = set(random.sample(range(num_migrants), int(num_migrants * 0.05)))
    # ~3% geozone violators
    geozone_violators = set(random.sample(range(num_migrants), int(num_migrants * 0.03)))
    # ~4% time anomalies
    time_anomalies = set(random.sample(range(num_migrants), int(num_migrants * 0.04)))
    
    # NEW: ~6% GPS spoofing / operator discrepancy (scenario 1)
    gps_spoofers = set(random.sample(range(num_migrants), int(num_migrants * 0.06)))
    # NEW: ~3% phone left behind (scenario 3)
    phone_leavers = set(random.sample(range(num_migrants), int(num_migrants * 0.03)))
    # NEW: ~5% shadow employment (scenario 6)
    shadow_workers = set(random.sample(range(num_migrants), int(num_migrants * 0.05)))
    # NEW: ~8% night deviation (scenario 14)
    night_deviators = set(random.sample(range(num_migrants), int(num_migrants * 0.08)))
    
    # Clustering events (specific time + location)
    cluster_events = [
        {"day": 5, "hour": 14, "lon": 37.6500, "lat": 55.5900, "count": 40, "name": "Массовое скопление у рынка Садовод"},
        {"day": 12, "hour": 20, "lon": 37.7450, "lat": 55.6780, "count": 35, "name": "Скопление в Люблино вечером"},
        {"day": 18, "hour": 3, "lon": 37.8200, "lat": 55.6300, "count": 25, "name": "Ночное скопление у Садовода"},
        {"day": 24, "hour": 11, "lon": 37.4400, "lat": 55.5700, "count": 45, "name": "Скопление у Фуд-Сити"},
        {"day": 8, "hour": 22, "lon": 37.6380, "lat": 55.5830, "count": 30, "name": "Вечернее скопление Бирюлёво"},
        {"day": 15, "hour": 16, "lon": 37.5380, "lat": 55.7500, "count": 50, "name": "Скопление у Москва-Сити"},
        {"day": 21, "hour": 1, "lon": 37.7800, "lat": 55.7010, "count": 20, "name": "Ночное скопление Кузьминки"},
        {"day": 28, "hour": 13, "lon": 37.6050, "lat": 55.6230, "count": 35, "name": "Скопление Чертаново"},
    ]
    
    # Assign some migrants to cluster events
    cluster_participants = {}
    for evt in cluster_events:
        participants = random.sample(range(num_migrants), min(evt["count"], num_migrants))
        cluster_participants[(evt["day"], evt["hour"])] = participants
    
    # ---- NEW DATA STRUCTURES ----
    # GPS vs Operator discrepancies (scenario 1)
    gps_discrepancies = []
    # Purchases data (scenarios 3, 6)
    purchases = []
    # Night deviations (scenario 14)
    night_deviation_records = []
    # Crime scene snapshots (scenario 15)
    crime_snapshots = []
    
    # Pre-compute shadow work locations for shadow workers
    shadow_work_locations = {}
    for idx in shadow_workers:
        # They actually work at a different location than declared
        actual_work_zone = random.choice(WORK_ZONES)
        shadow_work_locations[idx] = random_point_in_zone(actual_work_zone)
    
    # Pre-compute night deviation addresses
    night_alt_addresses = {}
    for idx in night_deviators:
        # They sleep somewhere other than registered home
        alt_zone = random.choice(RESIDENTIAL_ZONES)
        night_alt_addresses[idx] = random_point_in_zone(alt_zone)
    
    for idx, m in enumerate(migrants):
        if idx % 100 == 0:
            print(f"  Generating migrant {idx+1}/{num_migrants}...")
        
        mid = m["id"]
        tracks[mid] = []
        
        is_route_deviator = idx in route_deviators
        is_geozone_violator = idx in geozone_violators
        is_time_anomaly = idx in time_anomalies
        is_gps_spoofer = idx in gps_spoofers
        is_phone_leaver = idx in phone_leavers
        is_shadow_worker = idx in shadow_workers
        is_night_deviator = idx in night_deviators
        
        # Pick anomaly days
        deviation_days = set()
        if is_route_deviator:
            deviation_days = set(random.sample(range(days), random.randint(1, 3)))
        
        violation_days = set()
        if is_geozone_violator:
            violation_days = set(random.sample(range(days), random.randint(1, 2)))
        
        anomaly_days = set()
        if is_time_anomaly:
            anomaly_days = set(random.sample(range(days), random.randint(2, 5)))
        
        # GPS spoofing days
        spoof_days = set()
        if is_gps_spoofer:
            spoof_days = set(random.sample(range(days), random.randint(2, 5)))
        
        # Phone left days
        phone_left_days = set()
        if is_phone_leaver:
            phone_left_days = set(random.sample(range(days), random.randint(1, 3)))

        # Night deviation is ongoing (most nights)
        night_dev_active_days = set()
        if is_night_deviator:
            # 60-80% of nights
            num_nights = random.randint(int(days * 0.6), int(days * 0.8))
            night_dev_active_days = set(random.sample(range(days), num_nights))
        
        for day in range(days):
            current_date = start_date + timedelta(days=day)
            is_weekend = current_date.weekday() >= 5
            
            for hour in range(24):
                ts = current_date.replace(hour=hour, minute=0, second=0).isoformat()
                
                # Check cluster event
                in_cluster = False
                for evt in cluster_events:
                    if evt["day"] == day and evt["hour"] == hour:
                        participants = cluster_participants[(day, hour)]
                        if idx in participants:
                            in_cluster = True
                            lon = evt["lon"] + random.gauss(0, 0.003)
                            lat = evt["lat"] + random.gauss(0, 0.002)
                            tracks[mid].append({
                                "t": ts,
                                "lon": round(lon, 6),
                                "lat": round(lat, 6)
                            })
                            break
                
                if in_cluster:
                    continue
                
                # Time anomaly: active at night, inactive during day
                if day in anomaly_days and is_time_anomaly:
                    if 1 <= hour <= 5:
                        # Active at night - moving around city
                        random_lon = m["home"][0] + random.gauss(0, 0.03)
                        random_lat = m["home"][1] + random.gauss(0, 0.02)
                        tracks[mid].append({
                            "t": ts,
                            "lon": round(random_lon, 6),
                            "lat": round(random_lat, 6)
                        })
                        if hour == 3:
                            incidents.append({
                                "type": "time_anomaly",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": round(random_lon, 6),
                                "lat": round(random_lat, 6),
                                "description": f"Ночное перемещение в {hour}:00",
                                "severity": "medium"
                            })
                        continue
                    elif m["work_start"] <= hour <= m["work_end"] and not is_weekend:
                        # Inactive during work hours
                        tracks[mid].append({
                            "t": ts,
                            "lon": m["home"][0] + random.gauss(0, 0.001),
                            "lat": m["home"][1] + random.gauss(0, 0.0006)
                        })
                        if hour == 12:
                            incidents.append({
                                "type": "time_anomaly",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": m["home"][0],
                                "lat": m["home"][1],
                                "description": f"Отсутствие на работе в рабочее время ({m['work_start']}:00-{m['work_end']}:00)",
                                "severity": "low"
                            })
                        continue
                
                # Route deviation: not at work, in random location
                if day in deviation_days and is_route_deviator and not is_weekend:
                    if m["work_start"] <= hour <= m["work_end"]:
                        # Should be at work but is somewhere else
                        dev_lon = m["home"][0] + random.uniform(-0.05, 0.05)
                        dev_lat = m["home"][1] + random.uniform(-0.03, 0.03)
                        tracks[mid].append({
                            "t": ts,
                            "lon": round(dev_lon, 6),
                            "lat": round(dev_lat, 6)
                        })
                        if hour == m["work_start"] + 1:
                            incidents.append({
                                "type": "route_deviation",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": round(dev_lon, 6),
                                "lat": round(dev_lat, 6),
                                "expected_lon": m["work"][0],
                                "expected_lat": m["work"][1],
                                "description": f"Отклонение от маршрута: должен быть в '{m['work_zone']}', находится в другом месте",
                                "severity": "high"
                            })
                        continue
                
                # Geozone violation
                if day in violation_days and is_geozone_violator:
                    if 10 <= hour <= 18:
                        # Move far outside allowed geozone
                        gz = next(g for g in GEOZONES if g["id"] == m["geozone_id"])
                        # Go to opposite side of city
                        viol_lon = gz["center_lon"] + random.choice([-1, 1]) * random.uniform(0.1, 0.15)
                        viol_lat = gz["center_lat"] + random.choice([-1, 1]) * random.uniform(0.06, 0.1)
                        # Clamp to Moscow area
                        viol_lon = max(37.2, min(38.0, viol_lon))
                        viol_lat = max(55.5, min(56.0, viol_lat))
                        tracks[mid].append({
                            "t": ts,
                            "lon": round(viol_lon, 6),
                            "lat": round(viol_lat, 6)
                        })
                        if hour == 14:
                            incidents.append({
                                "type": "geozone_violation",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": round(viol_lon, 6),
                                "lat": round(viol_lat, 6),
                                "geozone_id": m["geozone_id"],
                                "geozone_name": m["geozone_name"],
                                "description": f"Выход за пределы разрешённой зоны '{m['geozone_name']}'",
                                "severity": "high"
                            })
                        continue
                
                # Normal behavior
                if is_weekend:
                    if random.random() < 0.7:
                        lon = m["home"][0] + random.gauss(0, 0.001)
                        lat = m["home"][1] + random.gauss(0, 0.0006)
                    else:
                        lon = m["home"][0] + random.gauss(0, 0.015)
                        lat = m["home"][1] + random.gauss(0, 0.01)
                else:
                    if hour < m["work_start"] - 1 or hour > m["work_end"] + 1:
                        lon = m["home"][0] + random.gauss(0, 0.0008)
                        lat = m["home"][1] + random.gauss(0, 0.0005)
                    elif hour == m["work_start"] - 1:
                        t = random.uniform(0.3, 0.7)
                        lon = m["home"][0] + (m["work"][0] - m["home"][0]) * t + random.gauss(0, 0.003)
                        lat = m["home"][1] + (m["work"][1] - m["home"][1]) * t + random.gauss(0, 0.002)
                    elif hour == m["work_end"] + 1:
                        t = random.uniform(0.3, 0.7)
                        lon = m["work"][0] + (m["home"][0] - m["work"][0]) * t + random.gauss(0, 0.003)
                        lat = m["work"][1] + (m["home"][1] - m["work"][1]) * t + random.gauss(0, 0.002)
                    else:
                        lon = m["work"][0] + random.gauss(0, 0.001)
                        lat = m["work"][1] + random.gauss(0, 0.0006)
                
                # ---- NIGHT DEVIATION (scenario 14) ----
                # Override night position for night deviators
                if is_night_deviator and day in night_dev_active_days:
                    if 0 <= hour <= 5 or hour >= 23:
                        alt = night_alt_addresses[idx]
                        lon = alt[0] + random.gauss(0, 0.0008)
                        lat = alt[1] + random.gauss(0, 0.0005)
                        # Record incident once per day
                        if hour == 2:
                            dist = distance_km(m["home"][0], m["home"][1], alt[0], alt[1])
                            if dist > 2.0:
                                night_deviation_records.append({
                                    "type": "night_deviation",
                                    "migrant_id": mid,
                                    "timestamp": ts,
                                    "lon": round(alt[0], 6),
                                    "lat": round(alt[1], 6),
                                    "home_lon": m["home"][0],
                                    "home_lat": m["home"][1],
                                    "distance_km": round(dist, 1),
                                    "description": f"Ночёвка не по адресу регистрации ({round(dist, 1)} км от дома)",
                                    "severity": "medium" if dist < 5 else "high"
                                })
                
                tracks[mid].append({
                    "t": ts,
                    "lon": round(lon, 6),
                    "lat": round(lat, 6)
                })
                
                # ---- GPS vs OPERATOR (scenario 1) ----
                if is_gps_spoofer and day in spoof_days:
                    if m["work_start"] <= hour <= m["work_end"] and not is_weekend:
                        # App shows at work, but cell tower shows elsewhere (1-5 km away)
                        offset_km = random.uniform(1.5, 5.0)
                        angle = random.uniform(0, 2 * math.pi)
                        op_lon = lon + (offset_km / (111 * math.cos(math.radians(lat)))) * math.cos(angle)
                        op_lat = lat + (offset_km / 111) * math.sin(angle)
                        gps_discrepancies.append({
                            "migrant_id": mid,
                            "timestamp": ts,
                            "app_lon": round(lon, 6),
                            "app_lat": round(lat, 6),
                            "operator_lon": round(op_lon, 6),
                            "operator_lat": round(op_lat, 6),
                            "distance_m": round(offset_km * 1000),
                            "cell_tower": f"БС-{random.randint(10000,99999)}"
                        })
                        if hour == m["work_start"] + 2:
                            incidents.append({
                                "type": "gps_discrepancy",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": round(lon, 6),
                                "lat": round(lat, 6),
                                "operator_lon": round(op_lon, 6),
                                "operator_lat": round(op_lat, 6),
                                "distance_m": round(offset_km * 1000),
                                "description": f"Расхождение GPS и оператора: {round(offset_km * 1000)}м, возможна подмена GPS",
                                "severity": "high" if offset_km > 3 else "medium"
                            })
                
                # ---- PHONE LEFT BEHIND (scenario 3) ----
                if is_phone_leaver and day in phone_left_days:
                    if m["work_start"] <= hour <= m["work_end"] and not is_weekend:
                        # Phone stays at home, but purchases happen elsewhere
                        if hour in [12, 13] and random.random() < 0.5:
                            purchase_loc = random.choice([p for p in PURCHASE_LOCATIONS
                                                          if distance_km(p["lon"], p["lat"], m["home"][0], m["home"][1]) > 3])
                            purchases.append({
                                "migrant_id": mid,
                                "timestamp": ts.replace("T" + str(hour).zfill(2), "T" + str(hour).zfill(2)),
                                "purchase_lon": purchase_loc["lon"],
                                "purchase_lat": purchase_loc["lat"],
                                "phone_lon": round(m["home"][0] + random.gauss(0, 0.0005), 6),
                                "phone_lat": round(m["home"][1] + random.gauss(0, 0.0003), 6),
                                "store_name": purchase_loc["name"],
                                "amount": random.choice([150, 250, 380, 520, 780, 1200]),
                                "anomaly": True,
                                "description": f"Покупка в '{purchase_loc['name']}', телефон дома"
                            })
                            if hour == 12:
                                dist = distance_km(purchase_loc["lon"], purchase_loc["lat"], m["home"][0], m["home"][1])
                                incidents.append({
                                    "type": "phone_left",
                                    "migrant_id": mid,
                                    "timestamp": ts,
                                    "lon": m["home"][0],
                                    "lat": m["home"][1],
                                    "purchase_lon": purchase_loc["lon"],
                                    "purchase_lat": purchase_loc["lat"],
                                    "store_name": purchase_loc["name"],
                                    "distance_km": round(dist, 1),
                                    "description": f"Телефон дома, покупка в '{purchase_loc['name']}' ({round(dist, 1)} км)",
                                    "severity": "high"
                                })
                
                # ---- SHADOW EMPLOYMENT (scenario 6) ----
                if is_shadow_worker and not is_weekend:
                    actual_loc = shadow_work_locations[idx]
                    if hour in [12, 13]:
                        # Lunch purchase near actual (undeclared) workplace
                        nearby_food = [p for p in PURCHASE_LOCATIONS 
                                      if p["type"] == "food" and distance_km(p["lon"], p["lat"], actual_loc[0], actual_loc[1]) < 3]
                        if nearby_food:
                            food_loc = random.choice(nearby_food)
                        else:
                            food_loc = {"name": "Столовая", "lon": actual_loc[0] + random.gauss(0, 0.002),
                                       "lat": actual_loc[1] + random.gauss(0, 0.001), "type": "food"}
                        purchases.append({
                            "migrant_id": mid,
                            "timestamp": ts,
                            "purchase_lon": food_loc["lon"],
                            "purchase_lat": food_loc["lat"],
                            "phone_lon": round(lon, 6),
                            "phone_lat": round(lat, 6),
                            "store_name": food_loc["name"],
                            "amount": random.choice([120, 180, 250, 300, 350]),
                            "anomaly": False,
                            "description": f"Обед в '{food_loc['name']}'"
                        })
                    elif hour == 17 and current_date.weekday() == 4:
                        # ATM withdrawal every Friday
                        nearby_atm = [p for p in PURCHASE_LOCATIONS 
                                     if p["type"] == "atm" and distance_km(p["lon"], p["lat"], actual_loc[0], actual_loc[1]) < 5]
                        if nearby_atm:
                            atm = random.choice(nearby_atm)
                            purchases.append({
                                "migrant_id": mid,
                                "timestamp": ts,
                                "purchase_lon": atm["lon"],
                                "purchase_lat": atm["lat"],
                                "phone_lon": round(lon, 6),
                                "phone_lat": round(lat, 6),
                                "store_name": atm["name"],
                                "amount": random.choice([5000, 8000, 10000, 15000, 20000]),
                                "anomaly": False,
                                "description": f"Снятие наличных {atm['name']}"
                            })
                    
                    # Generate incident for shadow employment detection
                    # Check once per week at lunchtime
                    if hour == 12 and day % 7 == 2 and not is_weekend:
                        declared_work = m["work"]
                        actual_dist = distance_km(actual_loc[0], actual_loc[1], declared_work[0], declared_work[1])
                        if actual_dist > 3:
                            incidents.append({
                                "type": "shadow_employment",
                                "migrant_id": mid,
                                "timestamp": ts,
                                "lon": actual_loc[0],
                                "lat": actual_loc[1],
                                "declared_work_lon": declared_work[0],
                                "declared_work_lat": declared_work[1],
                                "distance_km": round(actual_dist, 1),
                                "description": f"Обеденные покупки в {round(actual_dist, 1)} км от заявленного места работы '{m['work_zone']}'",
                                "severity": "medium"
                            })
    
    # ---- Add normal purchases for non-anomaly migrants (sampling) ----
    for idx, m in enumerate(migrants):
        if idx in shadow_workers or idx in phone_leavers:
            continue
        if random.random() > 0.3:  # 30% make purchases
            continue
        mid = m["id"]
        for day in range(days):
            if random.random() > 0.4:
                continue
            current_date = start_date + timedelta(days=day)
            hour = random.choice([12, 13, 18, 19])
            ts = current_date.replace(hour=hour, minute=0, second=0).isoformat()
            # Normal purchase near home or work
            if random.random() < 0.5:
                loc = [p for p in PURCHASE_LOCATIONS 
                       if distance_km(p["lon"], p["lat"], m["home"][0], m["home"][1]) < 3]
            else:
                loc = [p for p in PURCHASE_LOCATIONS 
                       if distance_km(p["lon"], p["lat"], m["work"][0], m["work"][1]) < 3]
            if loc:
                pl = random.choice(loc)
                purchases.append({
                    "migrant_id": mid,
                    "timestamp": ts,
                    "purchase_lon": pl["lon"],
                    "purchase_lat": pl["lat"],
                    "phone_lon": round(m["home"][0] + random.gauss(0, 0.001), 6),
                    "phone_lat": round(m["home"][1] + random.gauss(0, 0.0006), 6),
                    "store_name": pl["name"],
                    "amount": random.choice([150, 250, 380, 520, 780]),
                    "anomaly": False,
                    "description": f"Покупка в '{pl['name']}'"
                })
    
    # ---- CRIME SCENE SNAPSHOTS (scenario 15) ----
    for crime in CRIME_INCIDENTS:
        crime_date = start_date + timedelta(days=crime["day"])
        crime_ts = crime_date.replace(hour=crime["hour"], minute=0, second=0).isoformat()
        
        # Find all migrants within 500m of the crime scene at that hour
        day_str = crime_date.strftime("%Y-%m-%d")
        nearby_migrants = []
        
        for mid_key, pts in tracks.items():
            for pt in pts:
                if pt["t"] == crime_ts:
                    dist = distance_km(pt["lon"], pt["lat"], crime["lon"], crime["lat"])
                    if dist <= 0.5:
                        nearby_migrants.append({
                            "migrant_id": mid_key,
                            "lon": pt["lon"],
                            "lat": pt["lat"],
                            "distance_m": round(dist * 1000)
                        })
        
        snapshot = {
            "crime_id": f"CR{crime['day']:02d}{crime['hour']:02d}",
            "timestamp": crime_ts,
            "crime_lon": crime["lon"],
            "crime_lat": crime["lat"],
            "crime_name": crime["name"],
            "crime_type": crime["type_crime"],
            "radius_m": 500,
            "migrants_nearby": nearby_migrants,
            "total_nearby": len(nearby_migrants)
        }
        crime_snapshots.append(snapshot)
        
        # Add incident
        incidents.append({
            "type": "crime_scene",
            "migrant_id": None,
            "timestamp": crime_ts,
            "lon": crime["lon"],
            "lat": crime["lat"],
            "description": f"{crime['name']} — {len(nearby_migrants)} мигрантов в радиусе 500м",
            "severity": "high",
            "count": len(nearby_migrants),
            "crime_id": snapshot["crime_id"]
        })
    
    # Add cluster incidents
    for evt in cluster_events:
        current_date = start_date + timedelta(days=evt["day"])
        ts = current_date.replace(hour=evt["hour"], minute=0, second=0).isoformat()
        incidents.append({
            "type": "cluster",
            "migrant_id": None,
            "timestamp": ts,
            "lon": evt["lon"],
            "lat": evt["lat"],
            "description": evt["name"],
            "severity": "high" if evt["hour"] < 6 or evt["count"] > 35 else "medium",
            "count": evt["count"]
        })
    
    # Add night deviation incidents
    incidents.extend(night_deviation_records)
    
    return tracks, incidents, gps_discrepancies, purchases, crime_snapshots


def main():
    print("=== Generating migrant monitoring demo data ===")
    print()
    
    start_date = datetime(2026, 3, 1)
    
    print("1. Generating migrants...")
    migrants = generate_migrants(1000)
    print(f"   Created {len(migrants)} migrants")
    
    print("2. Generating tracks and incidents...")
    tracks, incidents, gps_discrepancies, purchases, crime_snapshots = generate_tracks(migrants, start_date, days=30)
    print(f"   Created tracks for {len(tracks)} migrants")
    print(f"   Created {len(incidents)} incidents")
    print(f"   Created {len(gps_discrepancies)} GPS discrepancies")
    print(f"   Created {len(purchases)} purchase records")
    print(f"   Created {len(crime_snapshots)} crime scene snapshots")
    
    # Count points
    total_points = sum(len(v) for v in tracks.values())
    print(f"   Total track points: {total_points:,}")
    
    # Save migrants
    print("3. Saving data...")
    
    with open("data/migrants.json", "w", encoding="utf-8") as f:
        json.dump(migrants, f, ensure_ascii=False, indent=None)
    print(f"   migrants.json: {len(migrants)} records")
    
    # Save tracks - split into daily files for performance
    import os
    os.makedirs("data/tracks", exist_ok=True)
    
    for day in range(30):
        current_date = start_date + timedelta(days=day)
        day_str = current_date.strftime("%Y-%m-%d")
        day_tracks = {}
        
        for mid, pts in tracks.items():
            day_pts = [p for p in pts if p["t"].startswith(day_str)]
            if day_pts:
                day_tracks[mid] = day_pts
        
        with open(f"data/tracks/day_{day_str}.json", "w", encoding="utf-8") as f:
            json.dump(day_tracks, f, ensure_ascii=False, indent=None)
        
        day_points = sum(len(v) for v in day_tracks.values())
        print(f"   day_{day_str}.json: {day_points:,} points")
    
    # Save incidents
    incidents.sort(key=lambda x: x["timestamp"])
    with open("data/incidents.json", "w", encoding="utf-8") as f:
        json.dump(incidents, f, ensure_ascii=False, indent=None)
    print(f"   incidents.json: {len(incidents)} records")
    
    # Save geozones
    with open("data/geozones.json", "w", encoding="utf-8") as f:
        json.dump(GEOZONES, f, ensure_ascii=False, indent=None)
    print(f"   geozones.json: {len(GEOZONES)} zones")
    
    # Save work/residential zones for map display
    zones_data = {
        "work_zones": WORK_ZONES,
        "residential_zones": RESIDENTIAL_ZONES
    }
    with open("data/zones.json", "w", encoding="utf-8") as f:
        json.dump(zones_data, f, ensure_ascii=False, indent=None)
    
    # ---- NEW DATA FILES ----
    # GPS discrepancies
    with open("data/gps_discrepancies.json", "w", encoding="utf-8") as f:
        json.dump(gps_discrepancies, f, ensure_ascii=False, indent=None)
    print(f"   gps_discrepancies.json: {len(gps_discrepancies)} records")
    
    # Purchases
    with open("data/purchases.json", "w", encoding="utf-8") as f:
        json.dump(purchases, f, ensure_ascii=False, indent=None)
    print(f"   purchases.json: {len(purchases)} records")
    
    # Crime snapshots
    with open("data/crime_snapshots.json", "w", encoding="utf-8") as f:
        json.dump(crime_snapshots, f, ensure_ascii=False, indent=2)
    print(f"   crime_snapshots.json: {len(crime_snapshots)} records")
    
    # Generate summary stats
    stats = {
        "total_migrants": len(migrants),
        "total_points": total_points,
        "total_incidents": len(incidents),
        "total_gps_discrepancies": len(gps_discrepancies),
        "total_purchases": len(purchases),
        "total_crime_snapshots": len(crime_snapshots),
        "date_range": {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": (start_date + timedelta(days=29)).strftime("%Y-%m-%d")
        },
        "incidents_by_type": {},
        "incidents_by_severity": {},
        "nationalities": {},
        "occupations": {}
    }
    
    for inc in incidents:
        t = inc["type"]
        stats["incidents_by_type"][t] = stats["incidents_by_type"].get(t, 0) + 1
        s = inc["severity"]
        stats["incidents_by_severity"][s] = stats["incidents_by_severity"].get(s, 0) + 1
    
    for m in migrants:
        n = m["nationality"]
        stats["nationalities"][n] = stats["nationalities"].get(n, 0) + 1
        o = m["occupation"]
        stats["occupations"][o] = stats["occupations"].get(o, 0) + 1
    
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    print()
    print("=== Data generation complete ===")
    print(f"Stats: {json.dumps(stats, ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    import os
    os.makedirs("data/tracks", exist_ok=True)
    main()
