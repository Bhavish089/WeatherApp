import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private platformId = inject(PLATFORM_ID);

  /**
   * Generates a Google Maps deep link.
   * Valid travel modes: 'driving', 'walking', 'bicycling', 'transit'
   */
  getGoogleMapsUrl(origin: string, destination: string, mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'): string {
    const baseUrl = 'https://www.google.com/maps/dir/?api=1';
    return `${baseUrl}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`;
  }

  /**
   * Generates an Apple Maps deep link (ideal for iOS users).
   * Valid direction flags: 'd' (Driving), 'w' (Walking), 'r' (Transit)
   */
  getAppleMapsUrl(origin: string, destination: string, mode: 'd' | 'w' | 'r' = 'd'): string {
    const baseUrl = 'http://maps.apple.com/';
    return `${baseUrl}?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=${mode}`;
  }

  /**
   * Automatically detects the OS and launches the native map app.
   */
  startNavigation(origin: string, destination: string): void {
    // Prevent SSR errors by ensuring this only runs in the browser
    if (!isPlatformBrowser(this.platformId)) return;

    // Basic iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    const url = isIOS 
      ? this.getAppleMapsUrl(origin, destination) 
      : this.getGoogleMapsUrl(origin, destination);
      
    // Opens the link. On mobile, this usually triggers the OS to open the native map app.
    window.open(url, '_blank');
  }
}

@Injectable({
  providedIn: 'root'
})
export class Navigation extends NavigationService {}