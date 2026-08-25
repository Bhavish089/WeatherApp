import { DatePipe, DecimalPipe, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  HostListener, OnInit, PLATFORM_ID, ViewChild, inject, signal,
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
export class ActivityDashboard implements OnInit, AfterViewInit {
  private readonly weatherService = inject(WeatherService);
  private readonly advisorService = inject(ActivityAdvisorService);
  private readonly navService = inject(NavigationService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('globeViz', { static: false }) globeVizEl!: ElementRef;

  readonly currentPhase = signal<AppPhase>('preloading');
  readonly currentCity = signal<string>('');
  readonly isSearching = signal(false);

  readonly optimalWindows = signal<ActivityWindow[]>([]);
  readonly currentWeather = signal<RouteWeatherResponse['weather']['current'] | null>(null);
  readonly dailyForecast = signal<RouteWeatherResponse['weather']['daily'] | null>(null);

  readonly mouseX = signal<number>(0);
  readonly mouseY = signal<number>(0);

  private globeInstance: any;

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (isPlatformBrowser(this.platformId)) {
      this.mouseX.set((event.clientX / window.innerWidth) * 2 - 1);
      this.mouseY.set((event.clientY / window.innerHeight) * 2 - 1);
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.globeInstance && this.globeVizEl) {
      const width = this.globeVizEl.nativeElement.clientWidth;
      const height = this.globeVizEl.nativeElement.clientHeight;
      this.globeInstance.width(width);
      this.globeInstance.height(height);
    }
  }

  get parallaxGlobe(): string {
    return `translate3d(${this.mouseX() * -15}px, ${this.mouseY() * -15}px, 0) scale(1.05)`;
  }

  ngOnInit(): void {
    setTimeout(() => {
      if (navigator.onLine) {
        this.currentPhase.set('search');
      }
    }, 2200);
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // @ts-ignore
      import('globe.gl').then((module) => {
        const Globe = module.default as any;
        
        const width = this.globeVizEl.nativeElement.clientWidth;
        const height = this.globeVizEl.nativeElement.clientHeight;

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

        this.buildCinematicCosmos();
      });
    }
  }

  private buildCinematicCosmos(): void {
    const scene = this.globeInstance.scene();
    // @ts-ignore
    import('three').then((THREE) => {
      // Procedural generator for Sun and Moon
      const createTexture = (type: 'sun' | 'moon') => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        if (type === 'sun') {
          // Deep fiery solar gradient
          const gradient = ctx.createRadialGradient(512, 512, 50, 512, 512, 512);
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(0.15, '#fff7ae');
          gradient.addColorStop(0.45, '#ff8c00');
          gradient.addColorStop(0.8, '#e62e00');
          gradient.addColorStop(1, '#8b0000');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 1024, 1024);

          // Intense solar flares and plasma granules
          for (let i = 0; i < 800; i++) {
            ctx.fillStyle = Math.random() > 0.3 ? 'rgba(255,255,255,0.25)' : 'rgba(255,69,0,0.3)';
            ctx.beginPath();
            ctx.arc(Math.random() * 1024, Math.random() * 1024, Math.random() * 30, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Lunar crater surface texture
          ctx.fillStyle = '#999999';
          ctx.fillRect(0, 0, 1024, 1024);
          for (let i = 0; i < 500; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(50,50,50,0.4)' : 'rgba(220,220,220,0.25)';
            ctx.beginPath();
            ctx.arc(Math.random() * 1024, Math.random() * 1024, Math.random() * 25, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        return new THREE.CanvasTexture(canvas);
      };

      // 1. MASSIVE DEEP-SPACE SUN (Pushed far away, increased size to 110)
      const sunGeo = new THREE.SphereGeometry(110, 32, 32);
      const sunMat = new THREE.MeshBasicMaterial({ map: createTexture('sun') });
      const sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.set(700, 350, -900); // Placed deep into the background horizon
      scene.add(sunMesh);

      // Add a secondary outer corona glow layer for that blinding star effect
      const coronaGeo = new THREE.SphereGeometry(125, 32, 32);
      const coronaMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending
      });
      const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
      sunMesh.add(coronaMesh);

      // High-intensity directional light casting from the distant Sun across the scene
      const sunLight = new THREE.DirectionalLight(0xfff8ee, 2.8);
      sunLight.position.copy(sunMesh.position);
      scene.add(sunLight);

      // 2. Textured Moon Mesh
      const moonGeo = new THREE.SphereGeometry(12, 32, 32);
      const moonMat = new THREE.MeshStandardMaterial({
        map: createTexture('moon'),
        roughness: 0.9,
        metalness: 0.1
      });
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.position.set(-280, -150, -250);
      scene.add(moonMesh);

      // Deep space ambient light
      const ambientLight = new THREE.AmbientLight(0x1a1a33, 0.4);
      scene.add(ambientLight);

      // Cinematic rotation loop
      const animateCosmos = () => {
        requestAnimationFrame(animateCosmos);
        sunMesh.rotation.y += 0.0008;
        moonMesh.rotation.y += 0.0012;
      };
      animateCosmos();
    });
  }

  executeSearch(cityName: string): void {
    const destination = cityName.trim();
    if (!destination) return;

    this.currentCity.set(destination);
    this.isSearching.set(true);
    this.currentPhase.set('animating');

    if (this.globeInstance) {
      const currentPov = this.globeInstance.pointOfView();
      this.globeInstance.pointOfView({ ...currentPov, altitude: 2.5 }, 1000);
      this.globeInstance.controls().autoRotateSpeed = 15;
    }

    this.weatherService.getRouteWeather(destination).subscribe({
      next: (data) => {
        this.currentWeather.set(data.weather.current);
        this.dailyForecast.set(data.weather.daily);
        this.optimalWindows.set(this.advisorService.evaluateWindows(data.weather.hourly, 'running'));

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
      error: () => {
        this.isSearching.set(false);
        this.currentPhase.set('search');
      },
    });
  }

  launchRoute(): void {
    this.navService.startNavigation('', this.currentCity());
  }
}