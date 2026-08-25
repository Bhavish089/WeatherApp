import { Injectable } from '@angular/core';

export interface HourlyWeather {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  windspeed_10m: number[];
}

export interface ActivityWindow {
  timeBlock: string;
  temperature: number;
  status: 'Optimal' | 'Poor';
  reasoning: string;
}

@Injectable({
  providedIn: 'root',
})
export class ActivityAdvisorService {
  private readonly profiles = {
    running: { minTemperature: 5, maxTemperature: 27, maxPrecipitation: 10, maxWindSpeed: 20 },
    picnic: { minTemperature: 18, maxTemperature: 32, maxPrecipitation: 5, maxWindSpeed: 15 },
  } as const;

  evaluateWindows(hourly: HourlyWeather, activity: keyof typeof this.profiles): ActivityWindow[] {
    const profile = this.profiles[activity];
    if (!profile) {
      throw new Error('Activity profile not found');
    }

    return hourly.time.reduce<ActivityWindow[]>((windows, time, index) => {
      const temperature = hourly.temperature_2m[index];
      const precipitation = hourly.precipitation_probability[index];
      const windSpeed = hourly.windspeed_10m[index];

      if (
        temperature >= profile.minTemperature &&
        temperature <= profile.maxTemperature &&
        precipitation <= profile.maxPrecipitation &&
        windSpeed <= profile.maxWindSpeed
      ) {
        windows.push({
          timeBlock: time,
          temperature,
          status: 'Optimal',
          reasoning: 'Conditions are clear and comfortable.',
        });
      }
      return windows;
    }, []);
  }
}

@Injectable({
  providedIn: 'root',
})
export class ActivityAdvisor extends ActivityAdvisorService {}
