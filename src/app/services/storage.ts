import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface SavedLocation {
  name: string;
  lat: number;
  lon: number;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private STORAGE_KEY = 'weather_app_recent_cities';

  // Angular Signal holding our list of saved/recent locations
  recentLocations = signal<SavedLocation[]>(this.loadLocations());

  /**
   * Safely loads locations from localStorage (SSR-friendly)
   */
  private loadLocations(): SavedLocation[] {
    if (!this.isBrowser) return [];
    
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Adds a new search to the top of the recent list and persists it
   */
  saveLocation(location: SavedLocation): void {
    if (!this.isBrowser) return;

    // Filter out duplicate cities
    const current = this.recentLocations().filter(loc => loc.name.toLowerCase() !== location.name.toLowerCase());
    
    // Keep maximum of 5 recent locations
    const updated = [location, ...current].slice(0, 5);
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    this.recentLocations.set(updated); // Update signal reactively
  }

  /**
   * Clears saved search history
   */
  clearLocations(): void {
    if (!this.isBrowser) return;

    localStorage.removeItem(this.STORAGE_KEY);
    this.recentLocations.set([]);
  }
}

@Injectable({
  providedIn: 'root'
})
export class Storage extends StorageService {}