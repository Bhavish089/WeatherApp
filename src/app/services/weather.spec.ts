import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap, catchError, throwError, of } from 'rxjs';

export interface RouteWeatherResponse {
  location: { lat: number; lng: number; name: string }; 
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
    hourly: {
      time: string[];
      temperature_2m: number[];
      precipitation_probability: number[];
      windspeed_10m: number[];
    };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
      sunrise?: string[];
      sunset?: string[];
      uv_index_max?: number[];
    };
  };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly geocodingUrl = 'https://nominatim.openstreetmap.org/search';
  private readonly forecastUrl = 'https://api.open-meteo.com/v1/forecast';

  searchLocations(query: string): Observable<any[]> {
    if (!query || query.trim().length < 2) return of([]);
    return this.http.get<any[]>(this.geocodingUrl, {
      params: { q: query, format: 'json', limit: '5' }
    });
  }

  private fetchCoordinates(query: string): Observable<any> {
    return this.http.get<any[]>(this.geocodingUrl, {
      params: { q: query, format: 'json', limit: '1' }
    }).pipe(
      map(res => {
        if (res && res.length > 0) return res[0];
        throw new Error('Not found');
      })
    );
  }

  // --- PROGRESSIVE GEOCODING SHAVER ---
  private getFallbackQueries(original: string): string[] {
    const queries = new Set<string>();
    queries.add(original.trim());

    // 1. Strip Indian localized markers
    const afterNear = original.split(/(?:near|opp|opposite|behind|beside)\s+/i).pop();
    if (afterNear) queries.add(afterNear.trim());

    // 2. Extract strictly comma-separated regions
    const commaParts = original.split(',').map(s => s.trim()).filter(s => s);
    if (commaParts.length >= 2) queries.add(commaParts.slice(-2).join(', '));

    // 3. Absolute last resort: Strip down to macro-city words
    const words = original.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/);
    if (words.length >= 3) queries.add(words.slice(-3).join(' ')); 
    if (words.length >= 2) queries.add(words.slice(-2).join(' ')); 
    if (words.length >= 1) queries.add(words.slice(-1)[0]);        

    return Array.from(queries);
  }

  private tryQueries(queries: string[]): Observable<any> {
    if (queries.length === 0) return throwError(() => new Error('Location completely unresolvable'));
    
    return this.http.get<any[]>(this.geocodingUrl, {
      params: { q: queries[0], format: 'json', limit: '1' }
    }).pipe(
      switchMap(res => {
        if (res && res.length > 0) return of(res[0]); 
        return this.tryQueries(queries.slice(1));     
      })
    );
  }

  // Public wrapper for Routing Board
  geocodeLocation(query: string): Observable<any> {
    const fallbackStack = this.getFallbackQueries(query);
    return this.tryQueries(fallbackStack);
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
            daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max',
            forecast_days: 15, 
            timezone: 'auto',
          },
        }).pipe(map((forecast) => ({ 
          weather: forecast,
          location: { lat: latitude, lng: longitude, name: displayName }
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

      const req = this.http.get<any[]>(this.forecastUrl, {
        params: {
          latitude: lats,
          longitude: lngs,
          current: 'temperature_2m,weather_code'
        }
      }).pipe(
        map(res => Array.isArray(res) ? res : [res])
      );

      requests.push(req);
    }

    return forkJoin(requests).pipe(
      map(chunks => chunks.reduce((acc, val) => acc.concat(val), []))
    );
  }
}

@Injectable({ providedIn: 'root' })
export class Weather extends WeatherService {}