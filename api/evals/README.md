# Evals del chatbot

Los evals miden cómo responde el chatbot con el modelo real (Groq), no con el LLM falso de los tests (CLI-232). Cada caso es una conversación de un rol (visitante, paciente, doctor o admin) contra datos propios en la base de test. Se chequea:

- **Reglas** (`chatbot/checks.ts`, sin gastar tokens):
  - que llame a las tools esperadas y a ninguna prohibida
  - que dé los datos esperados (montos, nombres, horas)
  - que no dé datos ajenos
  - español neutro (sin voseo ni "turno")
  - texto plano: sin URLs, Markdown ni emojis
  - largo máximo
  - que no diga "un momento, déjame revisar": todo en una sola respuesta
- **Juez LLM** (`chatbot/judge.ts`, opcional): puntúa de 1 a 5 la calidez, la claridad, la respuesta única y la fidelidad a los datos de las tools.

No corren en el CI: gastan cupo de Groq y su resultado varía de una corrida a otra. Se corren a mano antes y después de cambiar el prompt o las tools, y se compara el reporte.

## Cómo correrlos

Necesitan:

- el Postgres de Docker (`cga-db`) con la base `cga_e2e` migrada
- `GROQ_API_KEY` en `api/.env`

```bash
cd api
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/cga_e2e?schema=public" npx prisma migrate deploy   # una vez
npm run eval:chatbot                                        # todos los casos, sin juez
EVAL_ROLE=doctor npm run eval:chatbot                       # un rol (o varios: doctor,patient)
EVAL_CASE=patient-pay-qr,doctor-agenda npm run eval:chatbot # casos puntuales
EVAL_JUDGE=1 EVAL_JUDGE_MODEL=openai/gpt-oss-20b npm run eval:chatbot  # con juez
```

El reporte queda en `api/evals/reports/chatbot-<fecha>.md` (más un `.json`). La carpeta está en el gitignore. Tiene:

- el resumen por rol
- cada conversación con las tools que usó
- las reglas que fallaron
- el comentario del juez

Jest marca en rojo los casos que fallaron, así que el comando termina con error si alguno no pasa: es lo esperado.

| Variable                 | Default                       | Para qué                                                                                       |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `EVAL_DATABASE_URL`      | `cga_e2e` en `localhost:5433` | Base donde se crean los datos. Se niega a correr si el nombre no tiene `e2e`, `eval` o `test`. |
| `EVAL_ROLE`, `EVAL_CASE` | todos                         | Filtros, separados por coma.                                                                   |
| `EVAL_JUDGE`             | apagado                       | `1` para correr el juez.                                                                       |
| `EVAL_JUDGE_MODEL`       | el del chatbot                | Modelo del juez.                                                                               |
| `EVAL_TOKENS_PER_MINUTE` | `7000`                        | Ritmo de llamadas, para no chocar con el límite por minuto.                                    |

## Costo y cupo de Groq

En el plan gratuito, el cupo es por modelo: 8K tokens por minuto y 200K por día.

- Un turno gasta ~3.000 tokens, o ~6.000 si llama a una tool.
- La corrida completa (~27 casos) gasta ~120K tokens del modelo del chatbot y tarda ~20 minutos por el ritmo de 7K tokens por minuto.
- El juez gasta ~1.500 tokens por caso. Con `EVAL_JUDGE_MODEL=openai/gpt-oss-20b` usa el cupo del 20b, así que no le resta al del chatbot.
- Dos corridas completas en el mismo día agotan el cupo diario. Mientras tanto, el chat del entorno de desarrollo responde con el fallback.
- Para iterar, conviene filtrar por rol o por caso.

Los casos que terminan con error del proveedor no pasan por el juez, para no ensuciar los promedios. Si un caso termina con `error del agente: llm_rate_limited`, es el cupo y no el comportamiento. Leer el 429 de Groq: "tokens per day (TPD)" o "per minute".

## Datos

`chatbot/fixtures.ts` crea sus propios datos y los borra al terminar, también lo que haya quedado de una corrida abortada:

- usuarios con el dominio `@eval-chatbot.test`
- tratamientos y una categoría con el código `EVAL_*`

Los datos:

- la Dra. Lucía Rojas, con 3 pacientes:
  - Carla Mendoza: tiene un presupuesto de Bs. 1350 con Bs. 300 pagados (saldo Bs. 1050), una visita atendida, una falta, una cita cancelada y una próxima cita
  - Jorge Mendoza: tiene el mismo apellido, para el caso del nombre ambiguo
  - Sofía Quispe
- el Dr. Martín Vargas, con Rodrigo Paz: un paciente ajeno que nunca debe aparecer en las respuestas a Carla ni a la Dra. Rojas

BANECO se reemplaza por un gateway falso: los evals nunca generan QR reales.

## Agregar un caso

Los casos se suman en `chatbot/cases.ts`. Cada turno puede tener:

- `expectTools`: grupos "o"
- `forbidTools`
- `mustMention`, `mustMentionAny`, `mustNotMention`

El caso puede llevar una `rubric` para el juez. Si el caso necesita un dato nuevo, se agrega en `fixtures.ts` como constante exportada y se usa desde el caso, nunca escrito a mano.
