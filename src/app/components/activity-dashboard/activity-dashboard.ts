// @ts-ignore
import * as THREE from 'three';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, inject, signal, afterNextRender, OnDestroy, Injectable } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, forkJoin, map, switchMap, catchError, throwError, of } from 'rxjs';
import { ActivityAdvisorService, ActivityWindow } from '../../services/activity-advisor';
import { NavigationService } from '../../services/navigation';
import { environment } from '../../../environments/environment';

export interface RouteWeatherResponse {
  location: { lat: number; lng: number; name: string; timezone: string }; 
  weather: {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      wind_direction_10m?: number;
      wind_gusts_10m?: number;
      surface_pressure?: number;
      visibility?: number;
    };
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; windspeed_10m: number[]; };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
      sunrise?: string[];
      sunset?: string[];
      uv_index_max?: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
    };
  };
}

@Injectable({ providedIn: 'root' })
export class GroqAiService {
  private readonly http = inject(HttpClient);
  private readonly apiKey = environment.OpenRouterApiKey; 

  generateWeatherSummary(location: string, current: any, daily: any): Observable<string> {
    // 1. Force a strict structural delimiter in the prompt
    const prompt = `Location: ${location} | Temp: ${current.temperature_2m}°C | Humidity: ${current.relative_humidity_2m}% | High: ${daily.temperature_2m_max[0]}°C
    
CRITICAL: You must output EXACTLY two sentences of practical weather advice. You MUST format your response exactly like this:
SUMMARY: [your 2 sentences here]`;

    const payload = {
      model: "openai/gpt-4o", // Targeting a strict, non-reasoning model
      messages: [{ role: "user", content: prompt }],
      temperature: 0, // 0 forces maximum robotic compliance
      max_tokens: 100
    };

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTPS-Referer': 'https://weather-app-coral-beta-28.vercel.app',
      'X-Title': 'Weather Dashboard',
      'Content-Type': 'application/json'
    });

    return this.http.post<any>('https://openrouter.ai/api/v1/chat/completions', payload, { headers }).pipe(
      map(res => {
        let text = res.choices[0].message.content || '';
        
        // 2. Nuke <think> blocks if OpenRouter falls back to a reasoning model
        text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
        
        // 3. Slice away all conversational fluff before our keyword
        if (text.includes('SUMMARY:')) {
          text = text.split('SUMMARY:')[1];
        }
        
        return text.trim();
      }),
      catchError((err) => {
        console.error('[ OPENROUTER API REJECTED ]:', err.error?.error?.message || err.message);
        return of('AI Telemetry summarization is currently offline. Please refer to raw atmospheric data.');
      })
    );
  }
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly geocodingUrl = 'https://nominatim.openstreetmap.org/search';
  private readonly forecastUrl = 'https://api.open-meteo.com/v1/forecast';

  searchLocations(query: string): Observable<any[]> {
    if (!query || query.trim().length < 2) return of([]);
    return this.http.get<any[]>(this.geocodingUrl, { params: { q: query, format: 'json', limit: '5' } });
  }

  private fetchCoordinates(query: string): Observable<any> {
    return this.http.get<any[]>(this.geocodingUrl, { params: { q: query, format: 'json', limit: '1' } }).pipe(
      map(res => {
        if (res && res.length > 0) return res[0];
        throw new Error('Not found');
      })
    );
  }

  private getFallbackQueries(original: string): string[] {
    const queries = new Set<string>();
    queries.add(original.trim());
    const afterNear = original.split(/(?:near|opp|opposite|behind|beside)\s+/i).pop();
    if (afterNear) queries.add(afterNear.trim());
    const commaParts = original.split(',').map(s => s.trim()).filter(s => s);
    if (commaParts.length >= 2) queries.add(commaParts.slice(-2).join(', '));
    const words = original.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/);
    if (words.length >= 3) queries.add(words.slice(-3).join(' ')); 
    if (words.length >= 2) queries.add(words.slice(-2).join(' ')); 
    if (words.length >= 1) queries.add(words.slice(-1)[0]);        
    return Array.from(queries);
  }

  private tryQueries(queries: string[]): Observable<any> {
    if (queries.length === 0) return throwError(() => new Error('Location completely unresolvable'));
    return this.http.get<any[]>(this.geocodingUrl, { params: { q: queries[0], format: 'json', limit: '1' } }).pipe(
      switchMap(res => {
        if (res && res.length > 0) return of(res[0]); 
        return this.tryQueries(queries.slice(1));     
      })
    );
  }

  geocodeLocation(query: string): Observable<any> {
    return this.tryQueries(this.getFallbackQueries(query));
  }

  getRouteWeather(cityName: string): Observable<RouteWeatherResponse> {
    return this.geocodeLocation(cityName).pipe(
      switchMap((geoData) => {
        const latitude = parseFloat(geoData.lat);
        const longitude = parseFloat(geoData.lon);
        const displayName = cityName.length > 28 ? cityName.substring(0, 28) + '...' : cityName;

        return this.http.get<any>(this.forecastUrl, {
          params: {
            latitude: latitude,
            longitude: longitude,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility',
            hourly: 'temperature_2m,precipitation_probability,windspeed_10m',
            daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max',
            forecast_days: 15, 
            timezone: 'auto',
          },
        }).pipe(map((forecast) => ({ 
          weather: forecast,
          location: { lat: latitude, lng: longitude, name: displayName, timezone: forecast.timezone }
        })));
      })
    );
  }

  getLiveGlobalWeather(locations: {lat: number, lng: number}[]): Observable<any[]> {
    const chunkSize = 50;
    const requests: Observable<any[]>[] = [];
    for (let i = 0; i < locations.length; i += chunkSize) {
      const chunk = locations.slice(i, i + chunkSize);
      const lats = chunk.map(l => l.lat).join(',');
      const lngs = chunk.map(l => l.lng).join(',');
      requests.push(this.http.get<any[]>(this.forecastUrl, { params: { latitude: lats, longitude: lngs, current: 'temperature_2m,weather_code' } }).pipe(map(res => Array.isArray(res) ? res : [res])));
    }
    return forkJoin(requests).pipe(map(chunks => chunks.reduce((acc, val) => acc.concat(val), [])));
  }
}

type AppPhase = 'preloading' | 'search' | 'animating' | 'dashboard';
type UITheme = 'void' | 'coastal';

@Component({
  selector: 'app-activity-dashboard',
  imports: [DatePipe, DecimalPipe, UpperCasePipe],
  templateUrl: './activity-dashboard.html',
  styleUrl: './activity-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityDashboard implements OnDestroy {
  private readonly weatherService = inject(WeatherService);
  private readonly groqAiService = inject(GroqAiService);
  private readonly advisorService = inject(ActivityAdvisorService);
  private readonly navService = inject(NavigationService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('globeViz', { static: false }) globeVizEl!: ElementRef;

  readonly currentPhase = signal<AppPhase>('preloading');
  readonly currentCity = signal<string>('');
  readonly isSearching = signal(false);
  readonly errorMessage = signal<string>(''); 
  readonly activeFilter = signal<string>('ALL'); 

  readonly activeTheme = signal<UITheme>('void');
  readonly isMenuOpen = signal<boolean>(false);
  readonly localTime = signal<string>('--:--');
  readonly daylightProgress = signal<number>(-90);
  readonly expandedForecastRow = signal<number | null>(null);

  readonly searchQuery = signal<string>('');
  readonly searchResults = signal<any[]>([]);
  readonly showDropdown = signal<boolean>(false);

  readonly optimalWindows = signal<ActivityWindow[]>([]);
  readonly currentWeather = signal<RouteWeatherResponse['weather']['current'] | any>(null);
  readonly dailyForecast = signal<RouteWeatherResponse['weather']['daily'] | null>(null);
  readonly atmosphericData = signal<{ visibility: string, pressure: string, uv: number } | null>(null);
  readonly ephemerisData = signal<{ sunrise: string, sunset: string } | null>(null);
  readonly currentLocation = signal<{ lat: number, lng: number, name: string, timezone?: string } | null>(null);
  readonly safeMapUrl = signal<SafeResourceUrl | null>(null);

  readonly aiSummary = signal<string>('');
  readonly isGeneratingSummary = signal<boolean>(false);

  readonly routeOrigin = signal<string>('Greater Noida, Uttar Pradesh');
  readonly routeDestination = signal<string>('');
  readonly routeMode = signal<string>('driving');
  readonly selectedRoute = signal<number>(0);
  readonly routeOriginCoords = signal<{lat: number, lng: number}>({ lat: 28.4744, lng: 77.5040 });
  readonly routeDestCoords = signal<{lat: number, lng: number} | null>(null);
  readonly routeDistance = signal<number>(0); 
  readonly availableModes = signal<string[]>(['driving', 'two-wheeler', 'transit', 'bicycling', 'walking']);
  readonly generatedRoutes = signal<{ title: string, time: string, traffic: string, status: string }[]>([]);

  readonly mouseX = signal<number>(0);
  readonly mouseY = signal<number>(0);
  readonly deviceHeading = signal<number>(0);

  private globeInstance: any;
  private currentZoomLevel = 0;
  private searchTimeout: any; 
  private clockInterval: any;

  private readonly modeSpeeds: { [key: string]: number } = { 'driving': 40, 'two-wheeler': 45, 'transit': 25, 'bicycling': 15, 'walking': 5 };

  private readonly baseMarkers = [
    { city: 'Tokyo, JPN', lat: 35.6762, lng: 139.6503 }, { city: 'Beijing, CHN', lat: 39.9042, lng: 116.4074 },
    { city: 'Shanghai, CHN', lat: 31.2304, lng: 121.4737 }, { city: 'Hong Kong, HKG', lat: 22.3193, lng: 114.1694 },
    { city: 'Seoul, KOR', lat: 37.5665, lng: 126.9780 }, { city: 'Bangkok, THA', lat: 13.7563, lng: 100.5018 },
    { city: 'Singapore, SGP', lat: 1.3521, lng: 103.8198 }, { city: 'Jakarta, IDN', lat: -6.2088, lng: 106.8456 },
    { city: 'Kuala Lumpur, MYS', lat: 3.1390, lng: 101.6869 }, { city: 'Manila, PHL', lat: 14.5995, lng: 120.9842 },
    { city: 'New Delhi, IND', lat: 28.6139, lng: 77.2090 }, { city: 'Mumbai, IND', lat: 19.0760, lng: 72.8777 },
    { city: 'Bengaluru, IND', lat: 12.9716, lng: 77.5946 }, { city: 'Dubai, UAE', lat: 25.2048, lng: 55.2708 },
    { city: 'Riyadh, SAU', lat: 24.7136, lng: 46.6753 }, { city: 'Tehran, IRN', lat: 35.6892, lng: 51.3890 },
    { city: 'London, UK', lat: 51.5074, lng: -0.1278 }, { city: 'Paris, FRA', lat: 48.8566, lng: 2.3522 },
    { city: 'Berlin, DEU', lat: 52.5200, lng: 13.4050 }, { city: 'Rome, ITA', lat: 41.9028, lng: 12.4964 },
    { city: 'Madrid, ESP', lat: 40.4168, lng: -3.7038 }, { city: 'Amsterdam, NLD', lat: 52.3676, lng: 4.9041 },
    { city: 'Moscow, RUS', lat: 55.7558, lng: 37.6173 }, { city: 'Istanbul, TUR', lat: 41.0082, lng: 28.9784 },
    { city: 'Athens, GRC', lat: 37.9838, lng: 23.7275 }, { city: 'Stockholm, SWE', lat: 37.9838, lng: 18.0686 },
    { city: 'New York, USA', lat: 40.7128, lng: -74.0060 }, { city: 'Los Angeles, USA', lat: 34.0522, lng: -118.2437 },
    { city: 'Chicago, USA', lat: 41.8781, lng: -87.6298 }, { city: 'Toronto, CAN', lat: 43.6532, lng: -79.3832 },
    { city: 'Mexico City, MEX', lat: 19.4326, lng: -99.1332 }, { city: 'Vancouver, CAN', lat: 49.2827, lng: -123.1207 },
    { city: 'Miami, USA', lat: 25.7617, lng: -80.1918 }, { city: 'Havana, CUB', lat: 23.1136, lng: -82.3666 },
    { city: 'São Paulo, BRA', lat: -23.5505, lng: -46.6333 }, { city: 'Buenos Aires, ARG', lat: -34.6037, lng: -58.3816 },
    { city: 'Bogotá, COL', lat: 4.7110, lng: -74.0721 }, { city: 'Lima, PER', lat: -12.0464, lng: -77.0428 },
    { city: 'Santiago, CHL', lat: -33.4489, lng: -70.6693 }, { city: 'Rio de Janeiro, BRA', lat: -22.9068, lng: -43.1729 },
    { city: 'Cairo, EGY', lat: 30.0444, lng: 31.2357 }, { city: 'Johannesburg, ZAF', lat: -26.2041, lng: 28.0473 },
    { city: 'Lagos, NGA', lat: 6.5244, lng: 3.3792 }, { city: 'Nairobi, KEN', lat: -1.2864, lng: 36.8172 },
    { city: 'Casablanca, MAR', lat: 33.5731, lng: -7.5898 }, { city: 'Addis Ababa, KEN', lat: 9.0300, lng: 38.7400 },
    { city: 'Sydney, AUS', lat: -33.8688, lng: 151.2093 }, { city: 'Melbourne, AUS', lat: -37.8136, lng: 144.9631 },
    { city: 'Auckland, NZL', lat: -36.8485, lng: 174.7633 }, { city: 'Fiji, FJI', lat: -17.7134, lng: 178.0650 }
  ];

  private liveMarkers: any[] = []; 

  constructor() {
    afterNextRender(() => {
      setTimeout(() => this.currentPhase.set('search'), 2200);
      this.initGlobe();
    });
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (typeof window !== 'undefined') {
      this.mouseX.set((event.clientX / window.innerWidth) * 2 - 1);
      this.mouseY.set((event.clientY / window.innerHeight) * 2 - 1);
    }
  }

  get parallaxGlobe(): string { return `translate3d(${this.mouseX() * -15}px, ${this.mouseY() * -15}px, 0) scale(1.05)`; }

  toggleForecastRow(index: number) {
    this.expandedForecastRow.update(curr => curr === index ? null : index);
  }

  saveTelemetryProfile() {
    const payload = {
      location: this.currentLocation(),
      origin: this.routeOriginCoords(),
      preferences: { mode: this.routeMode() }
    };
    console.log('[ DB SYNC ]: Profile cached locally.', payload);
    alert(`[ DB SYNC ]: Telemetry profile for ${this.currentCity()} saved.`);
  }

  private syncTimezoneAndEphemeris(timezone: string, sunriseIso?: string, sunsetIso?: string) {
    if (this.clockInterval) clearInterval(this.clockInterval);
    
    this.clockInterval = setInterval(() => {
      this.localTime.set(new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }));
    }, 1000);

    if (sunriseIso && sunsetIso) {
      const now = new Date().getTime();
      const dawn = new Date(sunriseIso).getTime();
      const dusk = new Date(sunsetIso).getTime();
      let progress = ((now - dawn) / (dusk - dawn)) * 180 - 90;
      this.daylightProgress.set(Math.max(-90, Math.min(90, progress)));
    }
  }

  onSearchInput(event: any) {
    const val = event.target.value;
    this.searchQuery.set(val);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (val.trim().length > 2) {
      this.searchTimeout = setTimeout(() => {
        this.weatherService.searchLocations(val).subscribe(results => {
          this.searchResults.set(results);
          this.showDropdown.set(results.length > 0);
        });
      }, 500);
    } else {
      this.searchResults.set([]);
      this.showDropdown.set(false);
    }
  }

  selectLocation(item: any) {
    const name = item.display_name.split(',')[0]; 
    this.showDropdown.set(false);
    this.searchQuery.set(name);
    this.executeSearch(item.display_name); 
  }

  private deg2rad(deg: number) { return deg * (Math.PI/180); }
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return (R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))) * 1.3; 
  }

  updateDistanceAndRoutes() {
    const orig = this.routeOriginCoords();
    const dest = this.routeDestCoords();
    if (!orig || !dest) return;

    const dist = this.calculateDistance(orig.lat, orig.lng, dest.lat, dest.lng);
    this.routeDistance.set(dist);

    if (dist > 4000) this.availableModes.set([]); 
    else if (dist > 50) {
      this.availableModes.set(['driving', 'two-wheeler', 'transit']);
      if (['walking', 'bicycling'].includes(this.routeMode())) this.routeMode.set('driving');
    } else this.availableModes.set(['driving', 'two-wheeler', 'transit', 'bicycling', 'walking']);

    this.calculateETAs();
  }

  setMode(mode: string) {
    this.routeMode.set(mode);
    this.calculateETAs();
  }

  private calculateETAs() {
    const dist = this.routeDistance();
    if (dist === 0) return;

    if (dist > 4000) {
      this.generatedRoutes.set([{ title: 'Oceanic / Terrain Barrier', time: '--', traffic: 'Flight Required', status: 'poor' }]);
      return;
    }

    const speed = this.modeSpeeds[this.routeMode()] || 40;
    const baseHours = dist / speed;
    const formatTime = (hours: number) => {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return h > 0 ? `${h}h ${m}m` : `${m} min`;
    };

    if (this.routeMode() === 'walking' || this.routeMode() === 'bicycling') {
      this.generatedRoutes.set([
        { title: 'Primary Route (Direct)', time: formatTime(baseHours), traffic: '--', status: 'optimal' },
        { title: 'Alternative (Scenic)', time: formatTime(baseHours * 1.1), traffic: '--', status: 'optimal' }
      ]);
    } else {
      this.generatedRoutes.set([
        { title: 'Primary Route (Fastest)', time: formatTime(baseHours), traffic: 'Light', status: 'optimal' },
        { title: 'Alternative Route', time: formatTime(baseHours * 1.2), traffic: 'Moderate', status: 'marginal' },
        { title: 'Bypass Route', time: formatTime(baseHours * 1.4), traffic: 'Heavy', status: 'poor' }
      ]);
    }
  }

  onOriginBlur(event: any) {
    const val = event.target.value;
    if (!val) return;
    this.routeOrigin.set(val);
    this.weatherService.geocodeLocation(val).subscribe({
      next: (geo) => {
        this.routeOriginCoords.set({ lat: parseFloat(geo.lat), lng: parseFloat(geo.lon) });
        this.updateDistanceAndRoutes();
      }
    });
  }

  onDestBlur(event: any) {
    const val = event.target.value;
    if (!val) return;
    this.routeDestination.set(val);
    this.weatherService.geocodeLocation(val).subscribe({
      next: (geo) => {
        this.routeDestCoords.set({ lat: parseFloat(geo.lat), lng: parseFloat(geo.lon) });
        this.updateDistanceAndRoutes();
      }
    });
  }

  parseWmoCode(code: number): { icon: string, condition: string } {
    if (code == null) return { icon: '--', condition: 'UNKNOWN' };
    if (code <= 1) return { icon: '☀️', condition: 'SUNNY' };
    if (code <= 3) return { icon: '⛅', condition: 'CLOUDY' };
    if (code >= 45 && code <= 48) return { icon: '🌫️', condition: 'CLOUDY' };
    if (code >= 51 && code <= 67) return { icon: '🌧️', condition: 'RAIN' };
    if (code >= 71 && code <= 77) return { icon: '❄️', condition: 'RAIN' }; 
    if (code >= 80 && code <= 82) return { icon: '🌧️', condition: 'RAIN' };
    if (code >= 95) return { icon: '⛈️', condition: 'STORM' };
    return { icon: '☀️', condition: 'SUNNY' };
  }

  private getFilteredMarkers() {
    if (this.activeFilter() === 'ALL') return this.liveMarkers;
    return this.liveMarkers.filter(m => m.condition === this.activeFilter());
  }

  applyFilter(filter: string) {
    this.activeFilter.set(filter);
    if (this.globeInstance && this.currentZoomLevel > 0) this.globeInstance.htmlElementsData(this.getFilteredMarkers());
  }

  private generateWindCurrents() {
    const arcs = [];
    for (let i = 0; i < 150; i++) {
      const lat = (Math.random() - 0.5) * 140; 
      const lng = (Math.random() - 0.5) * 360;
      const isWesterly = Math.abs(lat) > 30; 
      const length = (Math.random() * 40) + 15;
      
      arcs.push({
        startLat: lat, startLng: lng,
        endLat: lat + (Math.random() - 0.5) * 5, 
        endLng: lng + (isWesterly ? length : -length),
        color: isWesterly ? ['rgba(0, 229, 255, 0.0)', 'rgba(0, 229, 255, 0.8)'] : ['rgba(0, 255, 157, 0.0)', 'rgba(0, 255, 157, 0.8)']
      });
    }
    return arcs;
  }

  private initGlobe(): void {
    // @ts-ignore
    import('globe.gl').then((module) => {
      const Globe = module.default as any;
      if (!this.globeVizEl || !this.globeVizEl.nativeElement) return;
      const self = this;
      
      this.globeInstance = Globe()(this.globeVizEl.nativeElement)
        .width(window.innerWidth).height(window.innerHeight)
        .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(false) 
        
        .arcsData(this.generateWindCurrents()) 
        .arcStartLat((d: any) => d.startLat)
        .arcStartLng((d: any) => d.startLng)
        .arcEndLat((d: any) => d.endLat)
        .arcEndLng((d: any) => d.endLng)
        .arcColor((d: any) => d.color)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(3000)
        .arcAltitudeAutoScale(0.01)

        .htmlTransitionDuration(200).htmlElementsData([]) 
        .htmlElement((d: any) => {
          const el = document.createElement('div');
          if (self.currentZoomLevel > 0) {
            el.className = 'globe-marker scale-in';
            el.innerHTML = `<div class="m-city">${d.city}</div><div class="m-data">${d.icon} <span>${d.temp}</span></div>`;
          } else return document.createElement('div');
          el.onclick = () => self.globeInstance.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.5 }, 1500);
          return el;
        });

      const scene = this.globeInstance.scene();

      scene.children = scene.children.filter((c: any) => !(c instanceof THREE.AmbientLight || c instanceof THREE.DirectionalLight));

      const globeMaterial = this.globeInstance.globeMaterial();
      globeMaterial.shininess = 0.5;
      globeMaterial.specular = new THREE.Color(0x222222);

      const starGeometry = new THREE.BufferGeometry();
      const starVertices = [];
      for(let i=0; i<1500; i++) {
        const r = 2500 + Math.random() * 500; 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        starVertices.push(x,y,z);
      }
      starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
      const starMaterial = new THREE.PointsMaterial({color: 0xffffff, size: 2.5, transparent: true, opacity: 0.6, sizeAttenuation: true});
      const starPoints = new THREE.Points(starGeometry, starMaterial);
      scene.add(starPoints);

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      
      const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');       
      grad.addColorStop(0.1, 'rgba(255, 255, 255, 1)');     
      grad.addColorStop(0.3, 'rgba(255, 215, 0, 0.8)');     
      grad.addColorStop(0.6, 'rgba(255, 100, 0, 0.4)');     
      grad.addColorStop(1, 'rgba(255, 50, 0, 0)');          
      
      ctx.fillStyle = grad;
      ctx.clearRect(0, 0, 512, 512);
      ctx.fillRect(0, 0, 512, 512);

      const sunTexture = new THREE.CanvasTexture(canvas);
      
      const sunGeo = new THREE.SphereGeometry(60, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); 
      const sun = new THREE.Mesh(sunGeo, sunMat);
      sun.position.set(-900, 200, -900); 
      scene.add(sun);

      const coronaMat = new THREE.SpriteMaterial({
        map: sunTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false 
      });
      
      const sunCorona = new THREE.Sprite(coronaMat);
      sunCorona.scale.set(700, 700, 1); 
      sun.add(sunCorona);

      const sunLight = new THREE.PointLight(0xfffaed, 4.5, 6000);
      sunLight.position.copy(sun.position);
      scene.add(sunLight);

      scene.add(new THREE.AmbientLight(0x222222)); 

      const moonGeo = new THREE.SphereGeometry(15, 32, 32);
      const textureLoader = new THREE.TextureLoader();
      textureLoader.setCrossOrigin('anonymous'); 
      const moonMat = new THREE.MeshPhongMaterial({ 
        map: textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/planets/moon_1024.jpg'),
        bumpMap: textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/planets/moon_1024.jpg'),
        bumpScale: 0.02,
      });
      const moon = new THREE.Mesh(moonGeo, moonMat);
      moon.position.set(300, 100, -300); 
      scene.add(moon);

      const cloudGeometry = new THREE.SphereGeometry(this.globeInstance.getGlobeRadius() * 1.015, 75, 75);
      const cloudMaterial = new THREE.MeshPhongMaterial({
        map: textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-clouds10k.png'),
        transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      });
      const cloudSphere = new THREE.Mesh(cloudGeometry, cloudMaterial);
      scene.add(cloudSphere);

      (function rotateClouds() {
        cloudSphere.rotation.y += 0.0003;
        requestAnimationFrame(rotateClouds);
      })();

      this.weatherService.getLiveGlobalWeather(this.baseMarkers).subscribe((responses: any[]) => {
        this.liveMarkers = this.baseMarkers.map((m, i) => {
          const current = responses[i]?.current || { temperature_2m: 25, weather_code: 0 };
          const parsed = this.parseWmoCode(current.weather_code);
          return { ...m, temp: Math.round(current.temperature_2m) + '°', icon: parsed.icon, condition: parsed.condition };
        });
        if (this.currentZoomLevel > 0) this.globeInstance.htmlElementsData(this.getFilteredMarkers());
      });

      this.globeInstance.controls().autoRotate = true;
      this.globeInstance.controls().autoRotateSpeed = 0.4;
      this.globeInstance.controls().enableZoom = true; 
      this.globeInstance.controls().minDistance = 110; 

      this.globeInstance.onZoom((pov: { altitude: number }) => {
        const dynamicScale = Math.max(0.6, Math.min(2.5, 3.5 / pov.altitude));
        this.globeVizEl.nativeElement.style.setProperty('--city-scale', dynamicScale.toString());

        let newLevel = pov.altitude < 4.5 ? 1 : 0; 
        if (this.currentZoomLevel !== newLevel) {
          this.currentZoomLevel = newLevel;
          this.globeInstance.htmlElementsData(newLevel === 0 ? [] : this.getFilteredMarkers());
        }
      });
      this.globeInstance.pointOfView({ lat: 28.4744, lng: 77.5040, altitude: 6 }, 0);
    });
  }

  executeSearch(cityName: string): void {
    const destination = cityName.trim();
    if (!destination) return;

    this.showDropdown.set(false);
    this.errorMessage.set('');
    this.currentCity.set(destination.split(',')[0]); 
    this.routeDestination.set(destination.split(',')[0]); 
    this.isSearching.set(true);
    this.currentPhase.set('animating');

    if (this.globeInstance) try { this.globeInstance.pointOfView({ ...this.globeInstance.pointOfView(), altitude: 3.0 }, 1000); } catch (e) {}

    this.weatherService.getRouteWeather(destination).subscribe({
      next: (data: any) => {
        this.currentWeather.set(data.weather.current);
        this.dailyForecast.set(data.weather.daily);

        this.atmosphericData.set({
          visibility: data.weather.current?.visibility ? (data.weather.current.visibility / 1000).toFixed(1) : '10.0',
          pressure: data.weather.current?.surface_pressure?.toString() || '1013',
          uv: data.weather.daily?.uv_index_max?.[0] || 0
        });

        const sunriseIso = data.weather.daily?.sunrise?.[0];
        const sunsetIso = data.weather.daily?.sunset?.[0];
        this.ephemerisData.set({
          sunrise: sunriseIso ? new Date(sunriseIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '05:42 AM',
          sunset: sunsetIso ? new Date(sunsetIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:55 PM'
        });

        const { lat, lng, name, timezone } = data.location;
        this.currentCity.set(name); 
        this.routeDestination.set(name);
        this.currentLocation.set({ lat, lng, name, timezone }); 
        this.routeDestCoords.set({ lat, lng });

        this.syncTimezoneAndEphemeris(timezone, sunriseIso, sunsetIso);
        this.updateDistanceAndRoutes();

        const bbox = 0.05; 
        const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-bbox},${lat-bbox},${lng+bbox},${lat+bbox}&layer=mapnik&marker=${lat},${lng}`;
        this.safeMapUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(mapUrl));

        // Generate AI Summary
        this.isGeneratingSummary.set(true);
        this.aiSummary.set('');
        this.groqAiService.generateWeatherSummary(name, data.weather.current, data.weather.daily).subscribe(summary => {
          this.aiSummary.set(summary);
          this.isGeneratingSummary.set(false);
        });
        
        setTimeout(() => {
          if (this.globeInstance) {
            this.globeInstance.controls().autoRotateSpeed = 0.1; 
            this.globeInstance.pointOfView({ lat, lng, altitude: 1.5 }, 2000); 
          }
          setTimeout(() => {
            this.isSearching.set(false);
            this.currentPhase.set('dashboard');
          }, 2000);
        }, 1000);
      },
      error: () => {
        this.isSearching.set(false);
        this.currentPhase.set('search');
        this.errorMessage.set(`[ ERROR ]: TARGET '${destination.toUpperCase()}' NOT FOUND.`);
      }
    });
  }

  deployToGoogleMaps(): void {
    const orig = this.routeOriginCoords();
    const dest = this.routeDestCoords();
    if (!orig || !dest || this.routeDistance() > 4000) return;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${orig.lat},${orig.lng}&destination=${dest.lat},${dest.lng}&travelmode=${this.routeMode()}`, '_blank');
  }

  openGoogleMaps(): void {
    const loc = this.currentLocation();
    if (loc) window.open(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`, '_blank');
  }

  closeDashboard(): void {
    this.currentPhase.set('search');
    this.currentCity.set('');
    this.searchQuery.set('');
    if (this.globeInstance) this.globeInstance.pointOfView({ ...this.globeInstance.pointOfView(), altitude: 6 }, 1500);
  }
}