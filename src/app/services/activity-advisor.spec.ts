import { TestBed } from '@angular/core/testing';
import { ActivityAdvisor } from './activity-advisor';
describe('ActivityAdvisorService', () => {
  let service: ActivityAdvisor;

  // Mock hourly data matching the Open-Meteo parallel array structure
  const mockHourlyData = {
    time: Array(24).fill('2026-08-24T12:00:00Z'),
    temperature_2m: Array(24).fill(20), // Safe for outdoor running (5°C - 27°C) & picnic (18°C - 32°C)
    precipitation_probability: Array(24).fill(0), // Safe for outdoor running (<=10%) & picnic (<=5%)
    windspeed_10m: Array(24).fill(10) // Safe for outdoor running (<=20 km/h) & picnic (<=15 km/h)
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActivityAdvisor);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('evaluateWindows', () => {
    it('should throw an error if an unknown activity profile ID is provided', () => {
      expect(() => (service as any).evaluateWindows(mockHourlyData, 'invalid-activity'))
        .toThrow('Activity profile not found');
    });

    it('should return optimal time windows when weather parameters fall within thresholds', () => {
      const windows = (service as any).evaluateWindows(mockHourlyData, 'running');
      
      expect(windows.length).toBe(24);
      expect(windows[0].status).toBe('Optimal');
      expect(windows[0].temperature).toBe(20);
      expect(windows[0].reasoning).toBe('Conditions are clear and comfortable.');
    });

    it('should exclude windows that violate temperature, precipitation, or wind thresholds', () => {
      const badWeather = {
        time: Array(24).fill('2026-08-24T12:00:00Z'),
        temperature_2m: Array(24).fill(35), // Exceeds running maxTemp (27°C)
        precipitation_probability: Array(24).fill(50), // Exceeds running maxPrecipitationProb (10%)
        windspeed_10m: Array(24).fill(30) // Exceeds running maxWindSpeed (20 km/h)
      };

      const windows = (service as any).evaluateWindows(badWeather, 'running');
      expect(windows.length).toBe(0);
    });
  });
});