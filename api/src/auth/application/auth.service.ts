import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { User } from '../domain/User';
import { ACCOUNT_DISABLED_MESSAGE } from '../domain/account-disabled';
import { UserRepository } from '../domain/UserRepository';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';
import { SupabaseAdminService } from '../infrastructure/SupabaseAdminService';
import { EmailSender } from '../../patient-invites/domain/EmailSender';
import type { EmailSender as IEmailSender } from '../../patient-invites/domain/EmailSender';
import { phoneLastDigits, toLoginE164 } from '../../shared/phone.util';

function frontendUrl(): string {
  return process.env['FRONTEND_URL'] || 'http://localhost:4200';
}

/** Link del correo de confirmación: verifyOtp con token_hash, sin PKCE. */
function confirmationUrl(hashedToken: string): string {
  return `${frontendUrl()}/auth/confirmar?token_hash=${encodeURIComponent(hashedToken)}&type=signup`;
}

/** Link del correo de recuperación (CLI-243): también con token_hash, sin PKCE. */
function recoveryUrl(hashedToken: string): string {
  return `${frontendUrl()}/auth/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    private readonly patientInvitesService: PatientInvitesService,
    private readonly supabaseAdminService: SupabaseAdminService,
    @Inject(EmailSender) private readonly emailSender: IEmailSender,
  ) {}

  async syncUser(
    authUser: AuthenticatedUser,
    inviteToken?: string,
  ): Promise<User> {
    if (inviteToken) {
      const linked = await this.tryLinkInvitedUser(authUser, inviteToken);
      if (linked) {
        return linked;
      }
    }

    // Un login de Google, por sí solo, ya no crea una cuenta: solo actualiza
    // el perfil de una que ya existe (reservó y pagó, el doctor la creó, o
    // ya canjeó una invitación antes). Sin fila previa y sin invitación
    // válida, no queda ningún rastro en users — la única cuenta real que
    // existe es la de Supabase, que no está bajo nuestro control.
    const existing = await this.userRepository.findByAuthUserId(authUser.uid);
    if (!existing) {
      throw new NotFoundException(
        'No hay una cuenta asociada a este login todavía',
      );
    }
    if (!existing.isActive) {
      throw new ForbiddenException(ACCOUNT_DISABLED_MESSAGE);
    }
    return this.userRepository.upsertByAuthUserId({
      authUserId: authUser.uid,
      email: authUser.email,
      ...(authUser.phone && { phone: authUser.phone }),
      displayName: authUser.displayName,
      photoUrl: authUser.photoUrl,
    });
  }

  /**
   * CONTRATO: este método nunca lanza — un token inválido/vencido/ya usado
   * solo se loguea y el login sigue el camino normal (upsertByAuthUserId).
   * /auth/sync siempre debe completar.
   */
  private async tryLinkInvitedUser(
    authUser: AuthenticatedUser,
    inviteToken: string,
  ): Promise<User | null> {
    try {
      const redeemed = await this.patientInvitesService.redeem(inviteToken);
      if (!redeemed) {
        this.logger.warn(
          `inviteToken inválido/vencido/ya usado (uid=${authUser.uid})`,
        );
        return null;
      }
      const linked = await this.userRepository.linkAuthIdentity(
        redeemed.userId,
        {
          authUserId: authUser.uid,
          email: authUser.email,
          ...(authUser.phone && { phone: authUser.phone }),
          displayName: authUser.displayName,
          photoUrl: authUser.photoUrl,
        },
      );
      if (linked) {
        await this.enableFichaPhoneLogin(linked, authUser.uid);
      }
      return linked;
    } catch (error) {
      this.logger.error('Error al canjear inviteToken', error);
      return null;
    }
  }

  /**
   * Registro por teléfono (CLI-27): crea la identidad de Supabase Auth
   * directo vía Admin API, sin SMS. Solo con una invitación vigente — el
   * token se verifica acá pero NO se canjea: lo canjea el POST /auth/sync
   * que el frontend dispara apenas inicia sesión con la cuenta nueva, que es
   * donde se vincula la identidad con la fila de users/patients.
   *
   * El teléfono de la ficha es el oficial (lo cargó el doctor, CLI-144): si
   * la ficha tiene uno, solo se puede registrar con ese. Antes se aceptaba
   * cualquiera y, al canjear la invitación, el login pasaba en silencio al
   * número de la ficha — el paciente dejaba de poder entrar con el suyo.
   */
  async registerWithPhone(
    phone: string,
    password: string,
    inviteToken: string,
  ): Promise<void> {
    const invite =
      await this.patientInvitesService.registrationTarget(inviteToken);
    if (!invite.valid) {
      throw new ForbiddenException('La invitación no es válida o ya venció');
    }
    const phoneE164 = toLoginE164(phone);
    if (invite.phone && toLoginE164(invite.phone) !== phoneE164) {
      throw new UnprocessableEntityException(
        `Regístrate con el número que diste en la clínica (terminado en ${phoneLastDigits(invite.phone)}).`,
      );
    }
    await this.supabaseAdminService.createPhoneUser(phoneE164, password);
  }

  /**
   * El teléfono puede venir de una ficha que el doctor ya completó antes
   * de que el paciente reclamara la invitación — si está, lo confirmamos
   * en Supabase Auth ahora para que quede utilizable como login desde el
   * primer momento, sin que el doctor tenga que volver a tocar la ficha.
   * Si no queda habilitado (CLI-143), el login sigue igual, pero se marca
   * en la cuenta para que el doctor o el admin lo vean en la ficha.
   */
  private async enableFichaPhoneLogin(
    linked: User,
    authUserId: string,
  ): Promise<void> {
    if (!linked.phone) return;
    const result = await this.supabaseAdminService.setConfirmedPhone(
      authUserId,
      toLoginE164(linked.phone),
    );
    await this.userRepository.updateContactInfo(linked.id, {
      phoneLoginError: result.ok ? null : result.reason,
    });
  }

  /**
   * Alta por correo + contraseña (CLI-242). Antes era un signUp desde el
   * navegador y la invitación se canjeaba recién al confirmar el correo: si
   * el paciente tardaba más de 5 minutos (la vigencia de la invitación), la
   * cuenta quedaba sin ficha. Ahora la cuenta se crea acá, la invitación se
   * canjea y se vincula en el mismo momento, y el correo de confirmación lo
   * manda el backend (Supabase no estaba mandando los suyos) con un link que
   * funciona en cualquier navegador.
   */
  async registerWithEmail(
    email: string,
    password: string,
    inviteToken: string,
  ): Promise<void> {
    const invite =
      await this.patientInvitesService.registrationTarget(inviteToken);
    if (!invite.valid) {
      throw new ForbiddenException('La invitación no es válida o ya venció');
    }
    const { authUserId, hashedToken } =
      await this.supabaseAdminService.createEmailUser(email, password);

    // Un segundo intento antes de confirmar devuelve la misma cuenta, ya
    // vinculada: solo se reenvía el correo.
    const account =
      (await this.userRepository.findByAuthUserId(authUserId)) ??
      (await this.linkNewEmailAccount(inviteToken, authUserId, email));
    await this.emailSender.sendAccountEmail({
      to: email,
      displayName: account.displayName,
      actionUrl: confirmationUrl(hashedToken),
      kind: 'confirm_email',
    });
  }

  private async linkNewEmailAccount(
    inviteToken: string,
    authUserId: string,
    email: string,
  ): Promise<User> {
    let linked: User | null = null;
    try {
      const redeemed = await this.patientInvitesService.redeem(inviteToken);
      if (!redeemed) {
        throw new ForbiddenException('La invitación no es válida o ya venció');
      }
      linked = await this.userRepository.linkAuthIdentity(redeemed.userId, {
        authUserId,
        email,
        displayName: null,
        photoUrl: null,
      });
      if (!linked) {
        throw new ConflictException('Esta invitación ya se usó');
      }
    } catch (error) {
      // Sin ficha vinculada, la cuenta no sirve: se deshace para que el
      // paciente pueda volver a intentarlo con el mismo correo.
      await this.supabaseAdminService.deleteUser(authUserId);
      throw error;
    }
    await this.enableFichaPhoneLogin(linked, authUserId);
    return linked;
  }

  /**
   * Reenvía el correo de confirmación (CLI-242). Siempre termina igual (no
   * revela si el correo existe): solo manda algo si es una cuenta vinculada
   * que todavía no confirmó, y nunca crea una cuenta.
   */
  async resendEmailConfirmation(email: string): Promise<void> {
    const account = await this.userRepository.findByEmail(email);
    if (!account?.authUserId) return;
    const pending = await this.supabaseAdminService.createEmailConfirmation(
      account.authUserId,
    );
    if (!pending) return;
    await this.emailSender.sendAccountEmail({
      to: pending.email,
      displayName: account.displayName,
      actionUrl: confirmationUrl(pending.hashedToken),
      kind: 'confirm_email',
    });
  }

  /**
   * "Olvidé mi contraseña" (CLI-243). Antes lo pedía el navegador a
   * Supabase, que no estaba mandando el correo, y la pantalla igual decía
   * "Revisa tu correo". Ahora el link lo arma el backend y sale por Resend;
   * funciona en cualquier navegador. Nunca lanza: la respuesta es la misma
   * exista o no la cuenta, y las fallas quedan en el log.
   */
  async requestPasswordRecovery(email: string): Promise<void> {
    try {
      const hashedToken =
        await this.supabaseAdminService.createRecoveryLink(email);
      if (!hashedToken) return;
      const account = await this.userRepository.findByEmail(email);
      await this.emailSender.sendAccountEmail({
        to: email,
        displayName: account?.displayName ?? null,
        actionUrl: recoveryUrl(hashedToken),
        kind: 'reset_password',
      });
    } catch (error) {
      this.logger.error('No se pudo mandar el correo de recuperación', error);
    }
  }

  async getCurrentUser(uid: string): Promise<User> {
    const user = await this.userRepository.findByAuthUserId(uid);
    if (!user) {
      throw new NotFoundException(
        'User not found. Call POST /auth/sync first.',
      );
    }
    if (!user.isActive) {
      throw new ForbiddenException(ACCOUNT_DISABLED_MESSAGE);
    }
    return user;
  }
}
