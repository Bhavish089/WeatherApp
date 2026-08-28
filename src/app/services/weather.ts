import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

interface GeocodingResponse {
  results?: Array<{ latitude: number; longitude: number; name: string }>;
}

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

interface ForecastResponse {
  current: RouteWeatherResponse['weather']['current'];
  hourly: RouteWeatherResponse['weather']['hourly'];
  daily: RouteWeatherResponse['weather']['daily'];
}

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly geocodingUrl = 'https://geocoding-api.open-meteo.com/v1/search';
  private readonly forecastUrl = 'https://api.open-meteo.com/v1/forecast';

  getRouteWeather(cityName: string): Observable<RouteWeatherResponse> {
    return this.http
      .get<GeocodingResponse>(this.geocodingUrl, {
        params: { name: cityName, count: 1, language: 'en', format: 'json' },
      })
      .pipe(
        switchMap((location) => {
          const result = location.results?.[0];
          if (!result) {
            throw new Error(`Location not found: ${cityName}`);
          }

          return this.http.get<ForecastResponse>(this.forecastUrl, {
            params: {
              latitude: result.latitude,
              longitude: result.longitude,
              current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility',
              hourly: 'temperature_2m,precipitation_probability,windspeed_10m',
              daily: 'temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max',
              forecast_days: 15, 
              timezone: 'auto',
            },
          }).pipe(map((forecast) => ({ 
            weather: forecast,
            location: { lat: result.latitude, lng: result.longitude, name: result.name }
          })));
        }),
      );
  }
}

@Injectable({
  providedIn: 'root',
})
export class Weather extends WeatherService {}