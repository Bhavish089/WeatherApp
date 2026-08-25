import { Component } from '@angular/core';
import { ActivityDashboard } from './components/activity-dashboard/activity-dashboard'; 

@Component({
  selector: 'app-root',
  imports: [
    ActivityDashboard
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  title = 'WeatherApp';
}