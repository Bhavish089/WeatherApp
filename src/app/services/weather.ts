import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

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

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly http = inject(HttpClient);
  // NEW: OpenStreetMap allows searching for hyper-specific landmarks and streets
  private readonly geocodingUrl = 'https://nominatim.openstreetmap.org/search';
  private readonly forecastUrl = 'https://api.open-meteo.com/v1/forecast';

  getRouteWeather(cityName: string): Observable<RouteWeatherResponse> {
    return this.http
      .get<any[]>(this.geocodingUrl, {
        params: { q: cityName, format: 'json', limit: '1' },
      })
      .pipe(
        switchMap((geoData) => {
          if (!geoData || geoData.length === 0) {
            throw new Error(`Location not found: ${cityName}`);
          }

          const result = geoData[0];
          const latitude = parseFloat(result.lat);
          const longitude = parseFloat(result.lon);
          // Extracts the primary location name from the lengthy OpenStreetMap string
          const name = result.display_name.split(',')[0];

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
            location: { lat: latitude, lng: longitude, name: name }
          })));
        }),
      );
  }

  // NEW: Multi-fetch endpoint to bring the 3D Globe to life
  getLiveGlobalWeather(locations: {lat: number, lng: number}[]): Observable<any[]> {
    const lats = locations.map(l => l.lat).join(',');
    const lngs = locations.map(l => l.lng).join(',');
    
    return this.http.get<any[]>(this.forecastUrl, {
      params: {
        latitude: lats,
        longitude: lngs,
        current: 'temperature_2m,weather_code'
      }
    });
  }
}

@Injectable({
  providedIn: 'root',
})
export class Weather extends WeatherService {}