import { Matches } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** GET /admin/chatbot/usage. `to` es inclusivo (días en hora de Bolivia). */
export class ChatUsageQueryDto {
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to!: string;
}
