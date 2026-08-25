import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityDashboard } from './activity-dashboard';

describe('ActivityDashboard', () => {
  let component: ActivityDashboard;
  let fixture: ComponentFixture<ActivityDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
