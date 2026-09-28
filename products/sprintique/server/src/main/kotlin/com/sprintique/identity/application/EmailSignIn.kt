package com.sprintique.identity.application

import com.sprintique.configuration.SprintiqueProperties
import com.sprintique.database.Database
import com.sprintique.identity.domain.EmailAddress
import com.sprintique.problem.ProblemException
import com.sprintique.problem.requireCondition
import com.sprintique.token.Tokens
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** A session opened by a code, and the token that remembers this browser for the address. */
data class EmailSignedIn(val session: OpenedSession, val device: String)

/**
 * Sign-in by a six-digit code sent to an address. The code is bound to the browser that asked for it (its challenge
 * token lives in a cookie), valid for ten minutes and five attempts; a new code from the same client replaces that
 * client's previous one. The answers are the same whether or not a person with the address exists: the first valid
 * code creates them.
 *
 * Limits: one code per 30 seconds and five per hour for an address from one client; twenty per address a day,
 * which bounds guessing to a hundred attempts a day. A browser that once signed in to the address by a code is
 * remembered for it (a device cookie) and is exempt from the daily limit, so strangers who fill it up by asking for
 * codes to someone's address neither cancel nor block that person's codes.
 */
@Component
@Profile("api")
class EmailSignIn(
    private val database: Database,
    private val mail: ObjectProvider<MailPort>,
    private val accounts: Accounts,
    private val properties: SprintiqueProperties,
) {
    private val log = LoggerFactory.getLogger(EmailSignIn::class.java)

    val isAvailable: Boolean get() = mail.ifAvailable != null

    /**
     * Sends a code and returns the challenge token the browser keeps. `client` is the requester's address, `device`
     * the browser's device cookie if it has one.
     */
    fun start(email: EmailAddress, client: String, device: String?): String {
        val transport = mail.ifAvailable ?: throw notConfigured()
        val token = Tokens.random()
        val code = Tokens.digits(CODE_LENGTH)
        val clientHash = Tokens.sha256Hex(client)
        database.transaction { tx ->
            // Parallel requests for one address are counted one after another, never against the same count.
            tx.row("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", "email-code:${email.value}")
            tx.update(
                """
                DELETE FROM auth.email_challenges WHERE token_hash IN (SELECT token_hash FROM auth.email_challenges
                    WHERE expires_at <= clock_timestamp() - interval '1 day' LIMIT 500)
                """.trimIndent(),
            )
            tx.update(
                """
                DELETE FROM auth.known_devices WHERE token_hash IN (SELECT token_hash FROM auth.known_devices
                    WHERE expires_at <= clock_timestamp() LIMIT 500)
                """.trimIndent(),
            )
            val pending = tx.row(
                "SELECT count(*)::int AS n FROM auth.email_challenges WHERE expires_at > clock_timestamp()",
            )!!.int("n")
            requireCondition(pending < PENDING_LIMIT, 503, "BUSY", "Слишком много запросов кода. Повторите позже.")
            val recent = tx.row(
                """
                SELECT count(*) FILTER (WHERE client_hash = $2 AND created_at > clock_timestamp() - interval '1 hour')::int
                         AS "fromClient",
                       coalesce(max(created_at) FILTER (WHERE client_hash = $3)
                         > clock_timestamp() - interval '30 seconds', false) AS "tooSoon",
                       count(*)::int AS "today"
                FROM auth.email_challenges WHERE email = $1 AND created_at > clock_timestamp() - interval '1 day'
                """.trimIndent(),
                email.value, clientHash, clientHash,
            )!!
            requireCondition(
                !recent.boolean("tooSoon"),
                429,
                "EMAIL_CODE_WAIT",
                "Новый код можно запросить через 30 секунд.",
            )
            requireCondition(
                recent.int("fromClient") < CODES_PER_HOUR,
                429,
                "EMAIL_CODE_LIMIT",
                "Для этой почты запрошено слишком много кодов. Повторите через час.",
            )
            val known = device != null && tx.row(
                """
                SELECT 1 FROM auth.known_devices
                WHERE token_hash = $1 AND email = $2 AND expires_at > clock_timestamp()
                """.trimIndent(),
                Tokens.sha256Hex(device), email.value,
            ) != null
            requireCondition(
                known || recent.int("today") < CODES_PER_DAY,
                429,
                "EMAIL_CODE_LIMIT",
                "Для этой почты сегодня запрошено слишком много кодов. Повторите завтра.",
            )
            tx.update(
                """
                INSERT INTO auth.email_challenges(token_hash, email, code_hash, client_hash, expires_at)
                VALUES ($1, $2, $3, $4, clock_timestamp() + interval '10 minutes')
                """.trimIndent(),
                Tokens.sha256Hex(token), email.value, codeHash(token, code), clientHash,
            )
        }
        try {
            transport.send(letter(email, code))
        } catch (error: MailUnavailableException) {
            // The code never reached anyone: forget it, so it does not count against the address.
            database.transaction { tx ->
                tx.update("DELETE FROM auth.email_challenges WHERE token_hash = $1", Tokens.sha256Hex(token))
            }
            log.warn("Sign-in letter could not be sent: {}", error.cause?.javaClass?.simpleName)
            throw ProblemException(503, "MAIL_UNAVAILABLE", "Не удалось отправить письмо. Повторите через минуту.")
        }
        // Only a letter that left replaces this client's earlier code: a failed send keeps the one already received.
        database.transaction { tx ->
            tx.update(
                """
                UPDATE auth.email_challenges SET consumed_at = clock_timestamp()
                WHERE email = $1 AND client_hash = $2 AND token_hash <> $3 AND consumed_at IS NULL
                  AND expires_at > clock_timestamp()
                """.trimIndent(),
                email.value, clientHash, Tokens.sha256Hex(token),
            )
        }
        return token
    }

    /**
     * Opens a session for the right code and remembers the browser for the address (the returned device token); a
     * wrong code uses up an attempt, and the fifth ends the challenge.
     */
    fun verify(token: String, code: String): EmailSignedIn {
        val outcome = database.transaction { tx ->
            val challenge = tx.row(
                """
                SELECT email, code_hash AS "codeHash", attempts FROM auth.email_challenges
                WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE
                """.trimIndent(),
                Tokens.sha256Hex(token),
            ) ?: return@transaction Outcome.Expired
            if (!Tokens.equalsInConstantTime(codeHash(token, code), challenge.string("codeHash"))) {
                val left = MAX_ATTEMPTS - challenge.int("attempts") - 1
                tx.update(
                    """
                    UPDATE auth.email_challenges SET attempts = attempts + 1,
                        consumed_at = CASE WHEN attempts + 1 >= $2 THEN clock_timestamp() END
                    WHERE token_hash = $1
                    """.trimIndent(),
                    Tokens.sha256Hex(token), MAX_ATTEMPTS,
                )
                return@transaction if (left > 0) Outcome.Wrong(left) else Outcome.Expired
            }
            tx.update(
                "UPDATE auth.email_challenges SET consumed_at = clock_timestamp() WHERE token_hash = $1",
                Tokens.sha256Hex(token),
            )
            val email = challenge.string("email")
            val address = EmailAddress.parse(email) ?: error("Stored address is not normalized")
            val session = accounts.signIn(tx, ExternalIdentity(ISSUER, email, address.localPart, email))
            val device = Tokens.random()
            tx.update(
                """
                INSERT INTO auth.known_devices(token_hash, email, expires_at)
                VALUES ($1, $2, clock_timestamp() + interval '180 days')
                """.trimIndent(),
                Tokens.sha256Hex(device), email,
            )
            Outcome.Opened(EmailSignedIn(session, device))
        }
        return when (outcome) {
            is Outcome.Opened -> outcome.signedIn

            is Outcome.Wrong ->
                throw ProblemException(400, "EMAIL_CODE_INVALID", "Неверный код. Осталось попыток: ${outcome.left}.")

            Outcome.Expired ->
                throw ProblemException(400, "EMAIL_CODE_EXPIRED", "Код больше не действует. Запросите новый.")
        }
    }

    private fun letter(email: EmailAddress, code: String) = MailMessage(
        to = email,
        subject = "Код для входа в Sprintique: $code",
        text =
        """
            Здравствуйте!

            Ваш код для входа в Sprintique: $code

            Код действует 10 минут. Введите его на странице входа ${properties.publicOrigin} в том же браузере, где вы его запросили.

            Если вы не запрашивали код, просто удалите это письмо: без кода в аккаунт не войти.
        """.trimIndent(),
    )

    private sealed interface Outcome {
        data class Opened(val signedIn: EmailSignedIn) : Outcome

        data class Wrong(val left: Int) : Outcome

        data object Expired : Outcome
    }

    companion object {
        /** The issuer of e-mail identities; their subject is the normalized address. */
        const val ISSUER = "urn:sprintique:email"
        const val CODE_LENGTH = 6
        const val DEVICE_DAYS = 180L
        private const val MAX_ATTEMPTS = 5
        private const val CODES_PER_HOUR = 5
        private const val CODES_PER_DAY = 20
        private const val PENDING_LIMIT = 10_000

        private fun codeHash(token: String, code: String) = Tokens.sha256Hex("$token:$code")

        private fun notConfigured() =
            ProblemException(503, "SIGN_IN_NOT_CONFIGURED", "Вход по почте ещё не настроен.")
    }
}
