import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpotifyAuthService } from './authorization-service';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `<h1>Processing Login...</h1>`
})
export class CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(SpotifyAuthService);

  async ngOnInit() {
    console.log('CallbackComponent Loaded');
    const code = this.route.snapshot.queryParamMap.get('code');
    
    if (code) {
      console.log('Code found, starting exchange...');
      try {
        await this.authService.handleCallback(code);
        console.log('Exchange successful, moving to dashboard');
        this.router.navigate(['/dashboard']);
      } catch (err) {
        console.error('Exchange failed:', err);
      }
    } else {
      console.log('No code found in URL');
    }
  }
}