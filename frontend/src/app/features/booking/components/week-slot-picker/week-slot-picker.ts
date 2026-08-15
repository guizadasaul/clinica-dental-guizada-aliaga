import { Component, ChangeDetectionStrategy, input, output, signal, computed, effect } from '@angular/core';

const CLINIC_TIMEZONE = 'America/La_Paz';
const DAYS_PER_WEEK = 7;

const timeFormatter = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  weekday: 'short',
});

const dayNumberFormatter = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  day: 'numeric',
});

interface DayTab {
  readonly date: string;
  readonly weekdayLabel: string;
  readonly dayLabel: string;
  readonly hasSlots: boolean;
}

interface SlotOption {
  readonly iso: string;
  readonly label: string;
}

@Component({
  selector: 'app-week-slot-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-slot-picker.html',
  styleUrl: './week-slot-picker.scss',
})
export class WeekSlotPickerComponent {
  // Mapa fecha (YYYY-MM-DD) → horarios ISO libres, ya filtrados por el
  // backend (sin pasado, sin held vigente ni confirmed). Se espera que
  // cubra 14 días consecutivos — "esta semana" y "la próxima" son
  // simplemente los primeros 7 y los 7 siguientes.
  readonly slotsByDate = input<Record<string, string[]>>({});
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly slotSelected = output<string>();

  protected readonly activeWeekIndex = signal<0 | 1>(0);
  protected readonly activeDate = signal<string | null>(null);

  private readonly sortedDates = computed(() => Object.keys(this.slotsByDate()).sort());

  private readonly weeks = computed<[string[], string[]]>(() => {
    const dates = this.sortedDates();
    return [dates.slice(0, DAYS_PER_WEEK), dates.slice(DAYS_PER_WEEK, DAYS_PER_WEEK * 2)];
  });

  protected readonly hasNextWeek = computed(() => this.weeks()[1].length > 0);

  protected readonly activeDayTabs = computed<DayTab[]>(() => {
    const dates = this.weeks()[this.activeWeekIndex()] ?? [];
    const slotsByDate = this.slotsByDate();
    return dates.map((date) => {
      const localNoon = new Date(`${date}T12:00:00-04:00`);
      return {
        date,
        weekdayLabel: weekdayFormatter.format(localNoon),
        dayLabel: dayNumberFormatter.format(localNoon),
        hasSlots: (slotsByDate[date]?.length ?? 0) > 0,
      };
    });
  });

  protected readonly daySlots = computed<SlotOption[]>(() => {
    const date = this.activeDate();
    if (!date) {
      return [];
    }
    return (this.slotsByDate()[date] ?? []).map((iso) => ({
      iso,
      label: timeFormatter.format(new Date(iso)),
    }));
  });

  constructor() {
    // Mantiene el día activo dentro de la semana visible: al cargar datos o
    // cambiar de semana, si el día seleccionado ya no pertenece a la
    // semana activa, salta al primer día disponible de esa semana.
    effect(
      () => {
        const tabs = this.activeDayTabs();
        if (tabs.length === 0) {
          return;
        }
        const current = this.activeDate();
        if (!current || !tabs.some((tab) => tab.date === current)) {
          this.activeDate.set(tabs[0].date);
        }
      },
      { allowSignalWrites: true },
    );
  }

  protected switchWeek(index: 0 | 1): void {
    this.activeWeekIndex.set(index);
  }

  protected selectDate(date: string): void {
    this.activeDate.set(date);
  }
}
