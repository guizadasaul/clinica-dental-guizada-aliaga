import { clampPage, pageCount, pageSlice } from './pagination.util';

describe('pagination.util (CLI-204)', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it('cuenta las páginas, mínimo una', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
    expect(pageCount(23, 10)).toBe(3);
  });

  it('recorta cada página a 10', () => {
    expect(pageSlice(items, 1, 10)).toEqual(items.slice(0, 10));
    expect(pageSlice(items, 3, 10)).toEqual([21, 22, 23]);
  });

  it('una página fuera de rango se lleva a la última o a la primera', () => {
    expect(clampPage(9, 23, 10)).toBe(3);
    expect(clampPage(0, 23, 10)).toBe(1);
    expect(pageSlice(items, 9, 10)).toEqual([21, 22, 23]);
  });

  it('una lista vacía da una página vacía', () => {
    expect(pageSlice([], 1, 10)).toEqual([]);
  });
});
