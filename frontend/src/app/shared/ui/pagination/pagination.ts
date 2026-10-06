import { Component, ChangeDetectionStrategy, computed, input, output } from '@angular/core';

/** Cuántos pacientes se muestran por página en las listas del panel del doctor. */
export const PAGE_SIZE = 10;

/**
 * Controles de paginación (CLI-204): anterior / "Página X de N" / siguiente.
 * No corta la lista: quien la usa recorta con `pageSlice` y guarda la página.
 * Con una sola página no se muestra.
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class PaginationComponent {
  readonly total = input.required<number>();
  /** Página actual, desde 1. */
  readonly page = input.required<number>();
  readonly pageSize = input(PAGE_SIZE);
  readonly pageChange = output<number>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  protected go(page: number): void {
    const target = Math.min(Math.max(1, page), this.pages());
    if (target !== this.page()) {
      this.pageChange.emit(target);
    }
  }
}
