import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../../auth/application/auth.service';
import type { AuthenticatedUser, UserRole } from '../../../../auth/models/authenticated-user.model';
import { ChatbotService, type ChatbotReply } from '../../services/chatbot.service';
import { CHAT_MESSAGE_MAX_LENGTH, ChatWidgetComponent, isOwnUrl, toSegments } from './chat-widget';

const ORIGIN = globalThis.location.origin;

function user(role: UserRole | null): AuthenticatedUser {
  return { uid: 'uid-1', id: 'user-1', email: null, displayName: null, photoURL: null, role };
}

function setup(currentUser: AuthenticatedUser | null = null) {
  const chatbot = {
    send: vi.fn().mockReturnValue(of({ reply: 'Respuesta', links: [] })),
    clear: vi.fn().mockReturnValue(of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [ChatWidgetComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: ChatbotService, useValue: chatbot },
      { provide: AuthService, useValue: { currentUser: signal(currentUser) } },
    ],
  });
  const fixture = TestBed.createComponent(ChatWidgetComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const openPanel = async () => {
    q<HTMLButtonElement>('.chat-launcher')!.click();
    await render();
  };
  const type = async (text: string) => {
    const input = q<HTMLTextAreaElement>('.chat-panel__input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await render();
  };
  const sendMessage = async (text: string) => {
    await type(text);
    q<HTMLFormElement>('.chat-panel__form')!.dispatchEvent(new Event('submit'));
    await render();
  };
  const bubbles = () => [...root.querySelectorAll<HTMLElement>('.chat-msg')];
  return { fixture, root, q, chatbot, render, openPanel, type, sendMessage, bubbles };
}

describe('isOwnUrl / toSegments', () => {
  it('solo acepta links del propio origen', () => {
    expect(isOwnUrl(`${ORIGIN}/reservar?slot=1`, ORIGIN)).toBe(true);
    expect(isOwnUrl('https://evil.example.com/reservar', ORIGIN)).toBe(false);
    expect(isOwnUrl('no es una url', ORIGIN)).toBe(false);
  });

  it('parte el texto en tramos y marca como link solo los propios', () => {
    expect(
      toSegments(`Reservá en ${ORIGIN}/reservar?slot=1 o mirá https://otro.com/x`, ORIGIN),
    ).toEqual([
      { text: 'Reservá en ', href: null },
      { text: `${ORIGIN}/reservar?slot=1`, href: `${ORIGIN}/reservar?slot=1` },
      { text: ' o mirá ', href: null },
      { text: 'https://otro.com/x', href: null },
    ]);
  });
});

describe('ChatWidgetComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('arranca cerrado y el botón abre y cierra el panel', async () => {
    const { q, openPanel, render } = setup();

    expect(q('.chat-panel')).toBeNull();
    expect(q('.chat-launcher')?.getAttribute('aria-expanded')).toBe('false');

    await openPanel();
    expect(q('.chat-panel')).not.toBeNull();
    expect(q('.chat-launcher')?.getAttribute('aria-expanded')).toBe('true');
    expect(q('.chat-panel__messages')?.getAttribute('aria-live')).toBe('polite');

    q<HTMLButtonElement>('.chat-launcher')!.click();
    await render();
    expect(q('.chat-panel')).toBeNull();
  });

  it('Esc cierra el panel', async () => {
    const { q, openPanel, render } = setup();
    await openPanel();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await render();

    expect(q('.chat-panel')).toBeNull();
  });

  it('Esc con el panel cerrado no hace nada', async () => {
    const { q, render } = setup();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await render();

    expect(q('.chat-panel')).toBeNull();
  });

  it.each<[UserRole | null, string]>([
    [null, 'chatbot.welcome.guest'],
    ['patient', 'chatbot.welcome.patient'],
    ['odontologist', 'chatbot.welcome.doctor'],
    ['admin', 'chatbot.welcome.admin'],
  ])('la bienvenida depende del rol (%s)', async (role, key) => {
    const { bubbles, openPanel } = setup(role ? user(role) : null);
    await openPanel();

    expect(bubbles()[0].textContent?.trim()).toBe(key);
  });

  it('envía el mensaje con el idioma actual y muestra la respuesta', async () => {
    const { chatbot, bubbles, openPanel, sendMessage, q } = setup();
    TestBed.inject(TranslateService).use('en');
    await openPanel();

    await sendMessage('  ¿Qué horario tienen?  ');

    expect(chatbot.send).toHaveBeenCalledWith('¿Qué horario tienen?', 'en');
    const texts = bubbles().map((b) => b.textContent?.trim());
    expect(texts.slice(1)).toEqual(['¿Qué horario tienen?', 'Respuesta']);
    expect(q<HTMLTextAreaElement>('.chat-panel__input')!.value).toBe('');
  });

  it('Enter envía y Shift+Enter no', async () => {
    const { chatbot, openPanel, type, q, render } = setup();
    await openPanel();
    await type('Hola');
    const input = q<HTMLTextAreaElement>('.chat-panel__input')!;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    await render();
    expect(chatbot.send).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await render();
    // Sin idioma elegido todavía, el backend usa el suyo por defecto.
    expect(chatbot.send).toHaveBeenCalledWith('Hola', undefined);
  });

  it('no envía un mensaje vacío y deshabilita el botón', async () => {
    const { chatbot, openPanel, sendMessage, q } = setup();
    await openPanel();

    await sendMessage('   ');

    expect(chatbot.send).not.toHaveBeenCalled();
    expect(q<HTMLButtonElement>('.chat-panel__send')!.disabled).toBe(true);
  });

  it('muestra "escribiendo…" y no deja mandar otro mientras espera', async () => {
    const { chatbot, openPanel, sendMessage, q, render } = setup();
    const pending = new Subject<ChatbotReply>();
    chatbot.send.mockReturnValue(pending);
    await openPanel();

    await sendMessage('Hola');
    expect(q('.chat-msg--typing')?.textContent?.trim()).toBe('chatbot.typing');
    await sendMessage('Otra');
    expect(chatbot.send).toHaveBeenCalledTimes(1);

    pending.next({ reply: 'Listo', links: [] });
    pending.complete();
    await render();
    expect(q('.chat-msg--typing')).toBeNull();
  });

  it('limita el mensaje a 1000 caracteres y muestra el contador', async () => {
    const { openPanel, type, q } = setup();
    await openPanel();

    await type('abc');

    expect(q<HTMLTextAreaElement>('.chat-panel__input')!.maxLength).toBe(CHAT_MESSAGE_MAX_LENGTH);
    expect(q('.chat-panel__counter')?.textContent?.trim()).toBe(`3/${CHAT_MESSAGE_MAX_LENGTH}`);
  });

  it('muestra la respuesta como texto plano, sin interpretar HTML', async () => {
    const { chatbot, openPanel, sendMessage, bubbles, root } = setup();
    chatbot.send.mockReturnValue(
      of({ reply: '<img src=x onerror="alert(1)"><b>hola</b>', links: [] }),
    );
    await openPanel();

    await sendMessage('Hola');

    expect(root.querySelector('.chat-panel img, .chat-panel b')).toBeNull();
    expect(bubbles().at(-1)?.textContent?.trim()).toBe('<img src=x onerror="alert(1)"><b>hola</b>');
  });

  it('un link propio es clicable y navega dentro de la app; uno externo queda como texto', async () => {
    const { chatbot, openPanel, sendMessage, root, q, render } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    chatbot.send.mockReturnValue(
      of({
        reply: `Mirá https://otro.com/x o ${ORIGIN}/reservar?slot=a`,
        links: [
          {
            label: 'Reservar el lunes',
            url: `${ORIGIN}/reservar?slot=2026-09-28T10:00&doctorId=d1`,
          },
          { label: 'Otro sitio', url: 'https://evil.example.com/reservar' },
        ],
      }),
    );
    await openPanel();
    await sendMessage('Quiero reservar');

    const anchors = [...root.querySelectorAll<HTMLAnchorElement>('.chat-panel a')];
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
      `${ORIGIN}/reservar?slot=a`,
      `${ORIGIN}/reservar?slot=2026-09-28T10:00&doctorId=d1`,
    ]);
    expect(q('.chat-msg__link-text')?.textContent?.trim()).toBe(
      'Otro sitio: https://evil.example.com/reservar',
    );
    expect(root.querySelector('a[href^="https://otro.com"]')).toBeNull();

    q<HTMLAnchorElement>('.chat-msg__link')!.click();
    await render();

    expect(navigate).toHaveBeenCalledWith('/reservar?slot=2026-09-28T10:00&doctorId=d1');
    expect(q('.chat-panel')).toBeNull();
  });

  it.each([
    [409, 'chatbot.errors.busy'],
    [429, 'chatbot.errors.limit'],
    [503, 'chatbot.errors.unavailable'],
    [500, 'chatbot.errors.generic'],
    [0, 'chatbot.errors.generic'],
  ])('un error %s muestra un mensaje amable', async (status, key) => {
    const { chatbot, openPanel, sendMessage, q } = setup();
    chatbot.send.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    await openPanel();

    await sendMessage('Hola');

    expect(q('.chat-msg--error')?.textContent?.trim()).toBe(key);
  });

  it('un error que no es HTTP también muestra el mensaje genérico', async () => {
    const { chatbot, openPanel, sendMessage, q } = setup();
    chatbot.send.mockReturnValue(throwError(() => new Error('x')));
    await openPanel();

    await sendMessage('Hola');

    expect(q('.chat-msg--error')?.textContent?.trim()).toBe('chatbot.errors.generic');
  });

  it('"Borrar conversación" vacía el historial', async () => {
    const { chatbot, openPanel, sendMessage, bubbles, q, render } = setup(user('patient'));
    await openPanel();
    const clearButton = () => q<HTMLButtonElement>('.chat-panel__icon-btn')!;
    expect(clearButton().disabled).toBe(true);
    await sendMessage('Hola');

    clearButton().click();
    await render();

    expect(chatbot.clear).toHaveBeenCalled();
    expect(bubbles()).toHaveLength(1);
  });

  it('si borrar falla, lo avisa y conserva el historial', async () => {
    const { chatbot, openPanel, sendMessage, q, render, bubbles } = setup(user('patient'));
    chatbot.clear.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await openPanel();
    await sendMessage('Hola');

    q<HTMLButtonElement>('.chat-panel__icon-btn')!.click();
    await render();

    expect(bubbles()).toHaveLength(4);
    expect(q('.chat-msg--error')?.textContent?.trim()).toBe('chatbot.errors.clear');
  });

  it('el botón de cerrar del encabezado cierra el panel', async () => {
    const { q, openPanel, render } = setup();
    await openPanel();

    q<HTMLButtonElement>('.chat-panel__icon-btn:last-of-type')!.click();
    await render();

    expect(q('.chat-panel')).toBeNull();
  });
});
