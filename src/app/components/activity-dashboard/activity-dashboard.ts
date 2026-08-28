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

  readonly optimalWindows = signal<ActivityWindow[]>([]);
  readonly currentWeather = signal<RouteWeatherResponse['weather']['current'] | any>(null);
  readonly dailyForecast = signal<RouteWeatherResponse['weather']['daily'] | null>(null);
  
  readonly atmosphericData = signal<{ visibility: string, pressure: string, uv: number } | null>(null);
  readonly ephemerisData = signal<{ sunrise: string, sunset: string } | null>(null);

  readonly mouseX = signal<number>(0);
  readonly mouseY = signal<number>(0);
  readonly deviceHeading = signal<number>(0);

  private globeInstance: any;

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
      
      if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
      } 
      else if (event.absolute && event.alpha !== null) {
        heading = 360 - event.alpha;
      }
      
      if (Math.abs(this.deviceHeading() - heading) > 2) {
        this.deviceHeading.set(heading);
      }
    }
  }

  get parallaxGlobe(): string {
    return `translate3d(${this.mouseX() * -15}px, ${this.mouseY() * -15}px, 0) scale(1.05)`;
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
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#00E5FF')
        .atmosphereAltitude(0.18);

      this.globeInstance.controls().autoRotate = true;
      this.globeInstance.controls().autoRotateSpeed = 0.4;
      this.globeInstance.controls().enableZoom = false;
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
        this.globeInstance.pointOfView({ ...currentPov, altitude: 2.5 }, 1000);
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
            this.globeInstance.pointOfView({ lat, lng, altitude: 0.7 }, 2000); 
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

  launchRoute(): void {
    this.navService.startNavigation('', this.currentCity());
  }
}