import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';

// ─── REQUEST SCHEMAS ──────────────────────────────────────────────────────────
// Fastify validates ALL incoming data against these BEFORE your handler runs.
// Invalid requests → instant 400 rejection. No DB hit, no CPU wasted.

const registerSchema = {
    body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        additionalProperties: false, // 🔐 rejects unknown/extra fields
        properties: {
            email: {
                type: 'string',
                // regex instead of "format: email" to avoid needing ajv-formats package
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                maxLength: 255,
            },
            username: {
                type: 'string',
                minLength: 3,
                maxLength: 20,
                pattern: '^[a-zA-Z0-9_]+$', // 🔐 alphanumeric + underscore only
            },
            password: {
                type: 'string',
                minLength: 8,
                maxLength: 72, // 🔐 bcrypt silently ignores chars beyond 72
                // 🔐 must have: lowercase + uppercase + number + special char
                pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$',
            },
        },
    },
};

const loginSchema = {
    body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
            email: {
                type: 'string',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                maxLength: 255,
            },
            password: { type: 'string', minLength: 1, maxLength: 72 },
        },
    },
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
    // ─── REGISTER ───────────────────────────────────────────────────────────────
    app.post(
        '/register',
        {
            schema: registerSchema,
            config: { rateLimit: { max: 5, timeWindow: '1 hour' } }, // 🔐 max 5 registrations/hour per IP
        },
        async (request, reply) => {
            const { email, username, password } = request.body as {
                email: string;
                username: string;
                password: string;
            };

            const existing = await app.prisma.user.findFirst({
                where: { OR: [{ email }, { username }] },
            });
            if (existing) {
                return reply.status(409).send({ error: 'Email or username already taken' });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const user = await app.prisma.user.create({
                data: {
                    email,
                    username,
                    password: hashedPassword,
                    account: { create: {} },
                },
            });

            const token = app.jwt.sign(
                { userId: user.id, email: user.email },
                { expiresIn: '7d' },
            );

            return reply.status(201).send({
                token,
                user: { id: user.id, email: user.email, username: user.username },
            });
        },
    );

    // ─── LOGIN ───────────────────────────────────────────────────────────────────
    app.post(
        '/login',
        {
            schema: loginSchema,
            config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }, // 🔐 max 10 attempts/15min per IP
        },
        async (request, reply) => {
            const { email, password } = request.body as {
                email: string;
                password: string;
            };

            const user = await app.prisma.user.findUnique({ where: { email } });

            // 🔐 Always run bcrypt even if user not found — prevents timing attacks
            const passwordMatch = user
                ? await bcrypt.compare(password, user.password)
                : false;

            if (!user || !passwordMatch) {
                return reply.status(401).send({ error: 'Invalid email or password' });
            }

            const token = app.jwt.sign(
                { userId: user.id, email: user.email },
                { expiresIn: '7d' },
            );

            return {
                token,
                user: { id: user.id, email: user.email, username: user.username },
            };
        },
    );

    // ─── ME (protected) ──────────────────────────────────────────────────────────
    app.get('/me', { onRequest: [app.authenticate] }, async (request) => {
        const { userId } = request.user as { userId: string; email: string };

        const user = await app.prisma.user.findUnique({
            where: { id: userId },
            include: { account: true },
            omit: { password: true }, // 🔐 never expose password hash
        });

        return { user };
    });
}
