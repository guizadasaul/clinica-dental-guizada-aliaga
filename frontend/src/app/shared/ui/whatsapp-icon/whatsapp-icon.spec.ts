import { TestBed } from '@angular/core/testing';
import { WhatsappIconComponent } from './whatsapp-icon';

describe('WhatsappIconComponent (CLI-268)', () => {
  it('dibuja el logo de WhatsApp como decorativo', () => {
    TestBed.configureTestingModule({ imports: [WhatsappIconComponent] });
    const fixture = TestBed.createComponent(WhatsappIconComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg path')?.getAttribute('d')).toMatch(/^M13\.601 2\.326/);
  });
});
