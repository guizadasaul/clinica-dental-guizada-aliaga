import { Component, ChangeDetectionStrategy, DestroyRef, inject, input, output, signal, computed, effect } from '@angular/core';

@Component({
  selector: 'app-hold-countdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hold-countdown.html',
  styleUrl: './hold-countdown.scss',
})
export class HoldCountdownComponent {
  readonly holdExpiresAt = input.required<string>();
  readonly expired = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  protected readonly secondsLeft = signal(0);
  protected readonly display = computed(() => {
    const total = Math.max(0, this.secondsLeft());
    const mm = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const ss = (total % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  });
  protected readonly isLow = computed(() => this.secondsLeft() <= 60);

  constructor() {
    let hasEmittedExpired = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    effect(() => {
      const expiresAt = new Date(this.holdExpiresAt()).getTime();
      hasEmittedExpired = false;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }

      const tick = () => {
        const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
        this.secondsLeft.set(remaining);
        if (remaining <= 0 && !hasEmittedExpired) {
          hasEmittedExpired = true;
          this.expired.emit();
        }
      };

      tick();
      intervalId = setInterval(tick, 1000);
    }, { allowSignalWrites: true });

    this.destroyRef.onDestroy(() => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    });
  }
}
