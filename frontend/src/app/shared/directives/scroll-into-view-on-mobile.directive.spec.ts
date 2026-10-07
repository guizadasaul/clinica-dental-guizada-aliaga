import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollIntoViewOnMobileDirective } from './scroll-into-view-on-mobile.directive';
import { ViewportService } from '../services/viewport.service';

@Component({
  standalone: true,
  imports: [ScrollIntoViewOnMobileDirective],
  template: `@if (open()) {
    <section appScrollIntoViewOnMobile>Panel</section>
  }`,
})
class HostComponent {
  readonly open = signal(false);
}

function setup(mobile: boolean) {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [{ provide: ViewportService, useValue: { isMobile: signal(mobile) } }],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, scroll };
}

describe('ScrollIntoViewOnMobileDirective', () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('en el celular lleva el panel a la vista cuando aparece', async () => {
    const { fixture, scroll } = setup(true);
    expect(scroll).not.toHaveBeenCalled();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // Sin esto, el panel quedaba tapado por la topbar fija.
    const section = (fixture.nativeElement as HTMLElement).querySelector('section')!;
    expect(section.style.scrollMarginTop).toBe('72px');
  });

  it('en escritorio no mueve la página', async () => {
    const { fixture, scroll } = setup(false);

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scroll).not.toHaveBeenCalled();
  });
});
