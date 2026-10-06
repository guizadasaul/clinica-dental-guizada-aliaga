import { TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination';

function setup(total: number, page: number) {
  const fixture = TestBed.createComponent(PaginationComponent);
  fixture.componentRef.setInput('total', total);
  fixture.componentRef.setInput('page', page);
  const changes: number[] = [];
  fixture.componentInstance.pageChange.subscribe((p) => changes.push(p));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => el.querySelectorAll<HTMLButtonElement>('.pagination__btn');
  return { el, changes, buttons };
}

describe('PaginationComponent (CLI-204)', () => {
  it('no se muestra con una sola página', () => {
    const { el } = setup(10, 1);
    expect(el.querySelector('.pagination')).toBeNull();
  });

  it('muestra la página y el rango', () => {
    const { el } = setup(23, 2);
    expect(el.textContent).toContain('Página 2 de 3');
    expect(el.textContent).toContain('11–20 de 23');
  });

  it('en la primera página no se puede retroceder y avanza a la siguiente', () => {
    const { buttons, changes } = setup(23, 1);
    expect(buttons()[0].disabled).toBe(true);
    buttons()[1].click();
    expect(changes).toEqual([2]);
  });

  it('en la última página no se puede avanzar y retrocede', () => {
    const { buttons, changes } = setup(23, 3);
    expect(buttons()[1].disabled).toBe(true);
    buttons()[0].click();
    expect(changes).toEqual([2]);
  });
});
