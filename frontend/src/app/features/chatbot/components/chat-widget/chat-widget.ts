import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import { ChatbotService } from '../../services/chatbot.service';
import type { ChatLink } from '../../models/chat.model';
import type { ChatLocale } from '../../models/chat.request';

export const CHAT_MESSAGE_MAX_LENGTH = 1000;
const LOCALES: ReadonlySet<string> = new Set<ChatLocale>(['es', 'en', 'pt']);
const URL_PATTERN = /(https?:\/\/\S+)/;

/** Un tramo del texto: literal, o un link propio que se puede abrir. */
interface TextSegment {
  text: string;
  href: string | null;
}

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant' | 'error';
  segments: TextSegment[];
  /** Solo los errores: clave de i18n en vez de texto. */
  errorKey: string | null;
  links: ChatLink[];
}

/** Solo es clicable lo que apunta al propio frontend (ej. /reservar?...). */
export function isOwnUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Parte el texto en tramos literales y links propios. Nunca se usa innerHTML:
 * cada tramo se interpola como texto, así que un "<img onerror>" se ve tal cual.
 */
export function toSegments(text: string, origin: string): TextSegment[] {
  return text
    .split(URL_PATTERN)
    .filter((part) => part !== '')
    .map((part) => ({
      text: part,
      href: URL_PATTERN.test(part) && isOwnUrl(part, origin) ? part : null,
    }));
}

function errorKeyFor(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 429) return 'chatbot.errors.limit';
  if (status === 503) return 'chatbot.errors.unavailable';
  return 'chatbot.errors.generic';
}

/**
 * Asistente virtual flotante (CLI-97): en la landing responde como visitante
 * y en el dashboard con la cuenta logueada (el backend decide qué puede ver
 * cada rol; acá solo cambia la bienvenida).
 */
@Component({
  selector: 'app-chat-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
})
export class ChatWidgetComponent {
  private readonly chatbot = inject(ChatbotService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly messageList = viewChild<ElementRef<HTMLElement>>('messageList');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');

  protected readonly maxLength = CHAT_MESSAGE_MAX_LENGTH;
  protected readonly open = signal(false);
  protected readonly messages = signal<ChatEntry[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  private nextId = 0;

  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.sending());

  protected readonly welcomeKey = computed(() => {
    switch (this.auth.currentUser()?.role) {
      case 'patient':
        return 'chatbot.welcome.patient';
      case 'odontologist':
        return 'chatbot.welcome.doctor';
      case 'admin':
        return 'chatbot.welcome.admin';
      default:
        return 'chatbot.welcome.guest';
    }
  });

  constructor() {
    // Cada mensaje nuevo (o el "escribiendo…") deja el historial al final.
    afterRenderEffect(() => {
      this.messages();
      this.sending();
      const list = this.messageList()?.nativeElement;
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.focusAfterRender(() => this.input()?.nativeElement);
  }

  protected close(): void {
    this.open.set(false);
    this.focusAfterRender(() => this.launcher()?.nativeElement);
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter envía; Shift+Enter hace un salto de línea. */
  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    void this.submit();
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.push('user', text);
    this.draft.set('');
    this.sending.set(true);
    try {
      const { reply, links } = await firstValueFrom(this.chatbot.send(text, this.locale()));
      this.push('assistant', reply, links);
    } catch (error) {
      this.pushError(errorKeyFor(error));
    } finally {
      this.sending.set(false);
      this.focusAfterRender(() => this.input()?.nativeElement);
    }
  }

  protected async clear(): Promise<void> {
    try {
      await firstValueFrom(this.chatbot.clear());
      this.messages.set([]);
    } catch {
      this.pushError('chatbot.errors.clear');
    }
  }

  protected isOwnLink(link: ChatLink): boolean {
    return isOwnUrl(link.url, globalThis.location.origin);
  }

  /** Navega dentro de la SPA en vez de recargar la página. */
  protected openLink(event: Event, url: string): void {
    event.preventDefault();
    const target = new URL(url);
    this.close();
    void this.router.navigateByUrl(`${target.pathname}${target.search}${target.hash}`);
  }

  private locale(): ChatLocale | undefined {
    const lang = this.translate.getCurrentLang();
    return LOCALES.has(lang) ? (lang as ChatLocale) : undefined;
  }

  private push(role: 'user' | 'assistant', text: string, links: ChatLink[] = []): void {
    const entry: ChatEntry = {
      id: this.nextId++,
      role,
      segments: toSegments(text, globalThis.location.origin),
      errorKey: null,
      links,
    };
    this.messages.update((list) => [...list, entry]);
  }

  private pushError(errorKey: string): void {
    const entry: ChatEntry = {
      id: this.nextId++,
      role: 'error',
      segments: [],
      errorKey,
      links: [],
    };
    this.messages.update((list) => [...list, entry]);
  }

  private focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }
}
