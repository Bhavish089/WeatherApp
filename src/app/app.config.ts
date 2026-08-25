import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), //[cite: 1]
    provideRouter(routes), //[cite: 1]
    provideClientHydration(withEventReplay()), //[cite: 1]
    provideHttpClient(), // Enabled for the WeatherService
    provideHttpClient(withFetch())
  ]
};