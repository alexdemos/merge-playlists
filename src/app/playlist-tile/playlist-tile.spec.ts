import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaylistTile } from './playlist-tile';

describe('PlaylistTile', () => {
  let component: PlaylistTile;
  let fixture: ComponentFixture<PlaylistTile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistTile]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlaylistTile);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
