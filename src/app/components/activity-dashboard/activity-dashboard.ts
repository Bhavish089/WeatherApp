// @ts-ignore
import * as THREE from 'three';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef,
  HostListener, ViewChild, inject, signal, afterNextRender
} from '@angular/core';
import { ActivityAdvisorService, ActivityWindow } from '../../services/activity-advisor';
import { NavigationService } from '../../services/navigation';
import { RouteWeatherResponse, WeatherService } from '../../services/weather';

type AppPhase = 'preloading' | 'search' | 'animating' | 'dashboard';

@Component({
  selector: 'app-activity-dashboard',
  imports: [DatePipe, DecimalPipe, UpperCasePipe],
  templateUrl: './activity-dashboard.html',
  styleUrl: './activity-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityDashboard {
  private readonly weatherService = inject(WeatherService);
  private readonly advisorService = inject(ActivityAdvisorService);
  private readonly navService = inject(NavigationService);

  @ViewChild('globeViz', { static: false }) globeVizEl!: ElementRef;

  readonly currentPhase = signal<AppPhase>('preloading');
  readonly currentCity = signal<string>('');
  readonly isSearching = signal(false);
  readonly errorMessage = signal<string>(''); 
  readonly activeFilter = signal<string>('ALL'); 

  readonly optimalWindows = signal<ActivityWindow[]>([]);
  readonly currentWeather = signal<RouteWeatherResponse['weather']['current'] | any>(null);
  readonly dailyForecast = signal<RouteWeatherResponse['weather']['daily'] | null>(null);
  
  readonly atmosphericData = signal<{ visibility: string, pressure: string, uv: number } | null>(null);
  readonly ephemerisData = signal<{ sunrise: string, sunset: string } | null>(null);

  readonly mouseX = signal<number>(0);
  readonly mouseY = signal<number>(0);
  readonly deviceHeading = signal<number>(0);

  private globeInstance: any;
  private currentZoomLevel = 0; 

  private readonly globalMarkers = [
    { city: 'New York, USA', lat: 40.7128, lng: -74.0060, temp: '22°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Los Angeles, USA', lat: 34.0522, lng: -118.2437, temp: '26°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Mexico City, MX', lat: 19.4326, lng: -99.1332, temp: '20°', icon: '⛅', condition: 'CLOUDY' },
    { city: 'Toronto, CAN', lat: 43.6532, lng: -79.3832, temp: '18°', icon: '🌧️', condition: 'RAIN' },
    { city: 'São Paulo, BRA', lat: -23.5505, lng: -46.6333, temp: '25°', icon: '⛈️', condition: 'STORM' },
    { city: 'Bogotá, COL', lat: 4.7110, lng: -74.0721, temp: '14°', icon: '🌧️', condition: 'RAIN' },
    { city: 'London, UK', lat: 51.5074, lng: -0.1278, temp: '15°', icon: '🌧️', condition: 'RAIN' },
    { city: 'Paris, FRA', lat: 48.8566, lng: 2.3522, temp: '17°', icon: '⛅', condition: 'CLOUDY' },
    { city: 'Berlin, DEU', lat: 52.5200, lng: 13.4050, temp: '16°', icon: '⛅', condition: 'CLOUDY' },
    { city: 'Rome, ITA', lat: 41.9028, lng: 12.4964, temp: '24°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Cape Town, ZAF', lat: -33.9249, lng: 18.4241, temp: '18°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Cairo, EGY', lat: 30.0444, lng: 31.2357, temp: '33°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Greater Noida, IND', lat: 28.4744, lng: 77.5040, temp: '31°', icon: '☀️', condition: 'SUNNY' }, 
    { city: 'Mumbai, IND', lat: 19.0760, lng: 72.8777, temp: '29°', icon: '⛈️', condition: 'STORM' },
    { city: 'Tokyo, JPN', lat: 35.6762, lng: 139.6503, temp: '28°', icon: '🌤️', condition: 'SUNNY' },
    { city: 'Dubai, UAE', lat: 25.2048, lng: 55.2708, temp: '38°', icon: '☀️', condition: 'SUNNY' },
    { city: 'Sydney, AUS', lat: -33.8688, lng: 151.2093, temp: '18°', icon: '⛅', condition: 'CLOUDY' }
  ];

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        if (navigator.onLine) {
          this.currentPhase.set('search');
        } else {
          this.currentPhase.set('search');
        }
      }, 2200);
      this.initGlobe();
    });
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (typeof window !== 'undefined') {
      this.mouseX.set((event.clientX / window.innerWidth) * 2 - 1);
      this.mouseY.set((event.clientY / window.innerHeight) * 2 - 1);
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (typeof window !== 'undefined' && this.globeInstance && this.globeVizEl) {
      const width = this.globeVizEl.nativeElement.clientWidth;
      const height = this.globeVizEl.nativeElement.clientHeight;
      this.globeInstance.width(width);
      this.globeInstance.height(height);
    }
  }

  @HostListener('window:deviceorientationabsolute', ['$event'])
  @HostListener('window:deviceorientation', ['$event'])
  onDeviceOrientation(event: any) {
    if (typeof window !== 'undefined') {
      let heading = 0;
      if (event.webkitCompassHeading) { heading = event.webkitCompassHeading; } 
      else if (event.absolute && event.alpha !== null) { heading = 360 - event.alpha; }
      this.deviceHeading.set(Math.round(heading));
    }
  }

  get parallaxGlobe(): string {
    return `translate3d(${this.mouseX() * -15}px, ${this.mouseY() * -15}px, 0) scale(1.05)`;
  }

  private getFilteredMarkers() {
    if (this.activeFilter() === 'ALL') return this.globalMarkers;
    return this.globalMarkers.filter(m => m.condition === this.activeFilter());
  }

  applyFilter(filter: string) {
    this.activeFilter.set(filter);
    if (this.globeInstance && this.currentZoomLevel > 0) {
      this.globeInstance.htmlElementsData(this.getFilteredMarkers());
    }
  }

  private generateWindCurrents() {
    const arcs = [];
    for (let i = 0; i < 100; i++) {
      const lat = (Math.random() - 0.5) * 140; 
      const lng = (Math.random() - 0.5) * 360;
      const isWesterly = Math.abs(lat) > 30; 
      const length = (Math.random() * 40) + 15;
      
      arcs.push({
        startLat: lat, startLng: lng,
        endLat: lat + (Math.random() - 0.5) * 5, 
        endLng: lng + (isWesterly ? length : -length),
        color: isWesterly ? ['rgba(0, 229, 255, 0.0)', 'rgba(0, 229, 255, 0.6)'] : ['rgba(0, 255, 157, 0.0)', 'rgba(0, 255, 157, 0.6)']
      });
    }
    return arcs;
  }

  private initGlobe(): void {
    // @ts-ignore
    import('globe.gl').then((module) => {
      const Globe = module.default as any;
      if (!this.globeVizEl || !this.globeVizEl.nativeElement) return;

      const width = this.globeVizEl.nativeElement.clientWidth || window.innerWidth;
      const height = this.globeVizEl.nativeElement.clientHeight || window.innerHeight;

      this.globeInstance = Globe()(this.globeVizEl.nativeElement)
        .width(width)
        .height(height)
        // CORS FIX: Bypassing unpkg redirect using JSDelivr CDN
        .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#00E5FF')
        .atmosphereAltitude(0.25)
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
        .htmlTransitionDuration(200) 
        .htmlElementsData([]) 
        .htmlElement((d: any) => {
          const el = document.createElement('div');
          
          if (this.currentZoomLevel === 2) {
            el.className = 'globe-marker detailed scale-in';
            el.innerHTML = `<div class="m-city">${d.city}</div><div class="m-data">${d.icon} <span>${d.temp}</span></div>`;
          } else {
            el.className = 'globe-marker basic scale-in';
            el.innerHTML = `${d.icon} <span>${d.temp}</span>`;
          }
          
          el.onclick = () => this.globeInstance.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.5 }, 1500);
          return el;
        });

      // --- VOLUMETRIC DRIFTING CLOUDS ---
      const cloudGeometry = new THREE.SphereGeometry(this.globeInstance.getGlobeRadius() * 1.015, 75, 75);
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.setCrossOrigin('anonymous'); 

      const cloudMaterial = new THREE.MeshPhongMaterial({
        // CORS FIX: Bypassing unpkg redirect using JSDelivr CDN
        map: textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-clouds10k.png'),
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      
      const cloudSphere = new THREE.Mesh(cloudGeometry, cloudMaterial);
      this.globeInstance.scene().add(cloudSphere);

      (function rotateClouds() {
        cloudSphere.rotation.y += 0.0003;
        requestAnimationFrame(rotateClouds);
      })();

      this.globeInstance.controls().autoRotate = true;
      this.globeInstance.controls().autoRotateSpeed = 0.4;
      this.globeInstance.controls().enableZoom = true; 

      this.globeInstance.onZoom((pov: { lat: number, lng: number, altitude: number }) => {
        let newLevel = 0;
        if (pov.altitude < 2.0) newLevel = 2; 
        else if (pov.altitude < 4.0) newLevel = 1; 
        else newLevel = 0; 

        if (this.currentZoomLevel !== newLevel) {
          this.currentZoomLevel = newLevel;
          this.globeInstance.htmlElementsData(newLevel === 0 ? [] : this.getFilteredMarkers());
        }
      });

      this.globeInstance.pointOfView({ lat: 28.4744, lng: 77.5040, altitude: 6 }, 0);
    }).catch(err => console.error('Globe initialization failed:', err));
  }

  executeSearch(cityName: string): void {
    const destination = cityName.trim();
    if (!destination) return;

    this.errorMessage.set('');
    this.currentCity.set(destination);
    this.isSearching.set(true);
    this.currentPhase.set('animating');

    if (this.globeInstance) {
      try {
        const currentPov = this.globeInstance.pointOfView();
        this.globeInstance.pointOfView({ ...currentPov, altitude: 3.0 }, 1000);
        this.globeInstance.controls().autoRotateSpeed = 15;
      } catch (e) {
        console.warn('Globe POV transition skipped', e);
      }
    }

    this.weatherService.getRouteWeather(destination).subscribe({
      next: (data: any) => {
        this.currentWeather.set(data.weather.current);
        this.dailyForecast.set(data.weather.daily);
        this.optimalWindows.set(this.advisorService.evaluateWindows(data.weather.hourly, 'running'));

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

        const { lat, lng } = data.location;
        
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
      error: (err: any) => {
        console.error('Weather search failed:', err);
        this.isSearching.set(false);
        this.currentPhase.set('search');
        this.errorMessage.set(`[ ERROR ]: TARGET '${destination.toUpperCase()}' NOT FOUND. PLEASE RECALIBRATE.`);
      },
    });
  }

  closeDashboard(): void {
    this.currentPhase.set('search');
    this.currentCity.set('');
    
    if (this.globeInstance) {
      this.globeInstance.controls().autoRotateSpeed = 0.4;
      const currentPov = this.globeInstance.pointOfView();
      this.globeInstance.pointOfView({ lat: currentPov.lat, lng: currentPov.lng, altitude: 6 }, 1500);
    }
  }

  launchRoute(): void {
    this.navService.startNavigation('', this.currentCity());
  }
}