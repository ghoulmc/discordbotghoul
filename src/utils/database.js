import { pgDb } from './postgresDatabase.js';
import { MemoryStorage } from './memoryStorage.js';
import { logger } from './logger.js';
import { BotConfig } from '../config/bot.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from './schemas.js';
import { DEFAULT_GUILD_CONFIG } from './constants.js';

class DatabaseWrapper {
    constructor() {
        this.initialized = false;
        this.db = null;
        this.useFallback = false;
        this.connectionType = 'none';
        this.degradedModeWarningShown = false;
        this.degradedReason = null;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            logger.info('Intentando conectar a PostgreSQL...');
            const pgConnected = await pgDb.connect();
            if (pgConnected) {
                this.db = pgDb;
                this.connectionType = 'postgresql';
                this.degradedReason = null;
                logger.info('✅ Base de datos PostgreSQL inicializada - usando base de datos persistente');
                this.initialized = true;
                return;
            }

            const pgFailure = pgDb.getLastFailure?.();
            if (pgFailure?.reason === 'SCHEMA_VERSION_MISMATCH') {
                const schemaError = new Error(
                    `Se detectó una discrepancia en la versión del esquema (${pgFailure.message}). Ejecuta las migraciones antes de iniciar.`
                );
                schemaError.code = 'SCHEMA_VERSION_MISMATCH';
                throw schemaError;
            }
        } catch (error) {
            logger.warn('Falló la conexión a PostgreSQL:', error.message);

            if (error.code === 'SCHEMA_VERSION_MISMATCH') {
                throw error;
            }
        }

        
        this.db = new MemoryStorage();
        this.useFallback = true;
        this.connectionType = 'memory';
        this.degradedReason = 'POSTGRES_UNAVAILABLE';
        logger.warn('⚠️  MODO DEGRADADO DE BASE DE DATOS ACTIVADO - Usando almacenamiento en memoria (los datos se perderán al reiniciar)');
        logger.warn('⚠️  Por favor verifica la conexión a PostgreSQL y reinicia el bot cuando se solucione');
        this.initialized = true;
        this.degradedModeWarningShown = true;
    }

    async set(key, value, ttl = null) {
        if (this.useFallback) {
            logger.debug(`[DEGRADADO] Escribiendo en memoria: ${key}`);
        }

        if (typeof key === 'string' && /^guild:[^:]+:config$/.test(key)) {
            const guildId = key.split(':')[1];
            validateGuildConfigOrThrow(value, {
                guildId,
                errorCode: 'VALIDATION_FAILED'
            });
        }

        return this.db.set(key, value, ttl);
    }

    async get(key, defaultValue = null) {
        return this.db.get(key, defaultValue);
    }

    async delete(key) {
        if (this.useFallback) {
            logger.debug(`[DEGRADADO] Eliminando de memoria: ${key}`);
        }
        return this.db.delete(key);
    }

    async list(prefix) {
        return this.db.list(prefix);
    }

    async exists(key) {
        if (this.db.exists) {
            return this.db.exists(key);
        }
        const value = await this.db.get(key);
        return value !== null;
    }

    async increment(key, amount = 1) {
        if (this.useFallback) {
            logger.debug(`[DEGRADADO] Incrementando en memoria: ${key}`);
        }
        if (this.db.increment) {
            return this.db.increment(key, amount);
        }
        const current = await this.db.get(key, 0);
        const newValue = current + amount;
        await this.db.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        if (this.useFallback) {
            logger.debug(`[DEGRADADO] Decrementando en memoria: ${key}`);
        }
        if (this.db.decrement) {
            return this.db.decrement(key, amount);
        }
        const current = await this.db.get(key, 0);
        const newValue = current - amount;
        await this.db.set(key, newValue);
        return newValue;
    }

    /**
     * Comprueba si la base de datos está en modo degradado (solo memoria como fallback)
     * @returns {boolean} Verdadero si está usando almacenamiento en memoria como fallback
     */
    isDegraded() {
        return this.useFallback;
    }

    /**
     * Comprueba si la base de datos está completamente disponible (PostgreSQL)
     * @returns {boolean} Verdadero si está conectado a PostgreSQL
     */
    isAvailable() {
        return this.db && !this.useFallback;
    }

    



    getStatus() {
        return {
            initialized: this.initialized,
            connectionType: this.connectionType,
            isDegraded: this.useFallback,
            isAvailable: this.isAvailable(),
            degradedReason: this.degradedReason
        };
    }

    getConnectionType() {
        return this.connectionType;
    }
}

export const db = new DatabaseWrapper();

export async function initializeDatabase() {
    try {
        logger.info("Inicializando base de datos (PostgreSQL > fallback en memoria)...");
        await db.initialize();
        logger.info("✅ Base de datos inicializada");
        return { db };
    } catch (error) {
        logger.error("❌ Error al inicializar la base de datos:", error);

        if (error.code === 'SCHEMA_VERSION_MISMATCH') {
            throw error;
        }

        return { db };
    }
}

export async function getFromDb(key, defaultValue = null) {
    try {
        const value = await db.get(key);
        return value === null ? defaultValue : value;
    } catch (error) {
        logger.error(`Error al obtener el valor para la clave ${key}:`, error);
        return defaultValue;
    }
}

export async function setInDb(key, value, ttl = null) {
    try {
        await db.set(key, value, ttl);
        return true;
    } catch (error) {
        logger.error(`Error al establecer el valor para la clave ${key}:`, error);
        return false;
    }
}

export async function deleteFromDb(key) {
    try {
        await db.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error al eliminar la clave ${key}:`, error);
        return false;
    }
}

export async function insertVerificationAudit(record) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.isAvailable() && typeof pgDb.insertVerificationAudit === 'function') {
            return await pgDb.insertVerificationAudit(record);
        }

        const key = `verification:audit:${record.guildId}`;
        const existing = await getFromDb(key, []);
        const auditEntries = Array.isArray(existing) ? existing : [];
        const maxInMemoryAuditEntries = BotConfig?.verification?.maxInMemoryAuditEntries ?? 1000;

        auditEntries.push({
            ...record,
            createdAt: record.createdAt || new Date().toISOString()
        });

        if (auditEntries.length > maxInMemoryAuditEntries) {
            auditEntries.splice(0, auditEntries.length - maxInMemoryAuditEntries);
        }

        await setInDb(key, auditEntries);
        return true;
    } catch (error) {
        logger.error('Error al guardar la auditoría de verificación:', error);
        return false;
    }
}

/**
 * Extrae los datos reales de la respuesta de la base de datos (para compatibilidad con versiones anteriores)
 * @param {any} data - Datos a desempaquetar
 * @returns {any} Datos desempaquetados
 */
export function unwrapReplitData(data) {
    if (
        typeof data === "object" &&
        data !== null &&
        data.ok !== undefined &&
        data.value !== undefined
    ) {
        return unwrapReplitData(data.value);
    }
    return data;
}

export const getGuildConfigKey = (guildId) => `guild:${guildId}:config`;
export const getGuildBirthdaysKey = (guildId) => `guild:${guildId}:birthdays`;

/**
 * Obtiene o inicializa la configuración del servidor
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Object>} Configuración del servidor
 */
export async function getGuildConfig(client, guildId, context = {}) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            return {};
        }

        const configKey = getGuildConfigKey(guildId);
        const rawConfig = await client.db.get(configKey, {});
        const cleanedConfig = unwrapReplitData(rawConfig);

        return normalizeGuildConfig(cleanedConfig, DEFAULT_GUILD_CONFIG);
    } catch (error) {
        logger.error(`Error al obtener la configuración del servidor ${guildId}`, {
            error,
            traceId: context.traceId,
            guildId,
            userId: context.userId,
            command: context.command
        });
        return {};
    }
}

/**
 * Guarda la configuración del servidor
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @param {Object} config - Configuración a guardar
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function setGuildConfig(client, guildId, config, context = {}) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para setGuildConfig");
            return false;
        }

        const key = getGuildConfigKey(guildId);
        const validated = validateGuildConfigOrThrow(config, { guildId, ...context });
        await client.db.set(key, validated);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración del servidor ${guildId}`, {
            error,
            traceId: context.traceId,
            guildId,
            userId: context.userId,
            command: context.command
        });
        return false;
    }
}

export { DatabaseWrapper, pgDb };

export const getMessage = (key, replacements = {}) => {
    let message = BotConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return message;
};

export const getColor = (path, fallback = "#000000") => {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            logger.warn(`La ruta de color '${path}' no se encontró en la configuración, usando valor por defecto`);
            return fallback;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallback;
};

/**
 * Obtiene todos los cumpleaños de un servidor
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Object>} Objeto que mapea IDs de usuario a datos de cumpleaños
 */
export async function getGuildBirthdays(client, guildId) {
    const key = getGuildBirthdaysKey(guildId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.error("El cliente de base de datos no está disponible para getGuildBirthdays.");
            return {};
        }

        const rawData = await client.db.get(key, {});
        return unwrapReplitData(rawData) || {};
    } catch (error) {
        logger.error(`Error al obtener los cumpleaños del servidor ${guildId}:`, error);
        return {};
    }
}

/**
 * Establece el cumpleaños de un usuario
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @param {string} userId - ID del usuario
 * @param {number} month - Mes (1-12)
 * @param {number} day - Día (1-31)
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function setBirthday(client, guildId, userId, month, day) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para setBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        birthdays[userId] = { month, day };
        await client.db.set(key, birthdays);
        return true;
    } catch (error) {
        logger.error(`Error al establecer el cumpleaños del usuario ${userId} en el servidor ${guildId}:`, error);
        return false;
    }
}

/**
 * Elimina el cumpleaños de un usuario
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function deleteBirthday(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para deleteBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        if (birthdays[userId]) {
            delete birthdays[userId];
            await client.db.set(key, birthdays);
        }
        return true;
    } catch (error) {
        logger.error(`Error al eliminar el cumpleaños del usuario ${userId} en el servidor ${guildId}:`, error);
        return false;
    }
}






export function getMonthName(monthNum) {
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const index = Math.max(0, Math.min(monthNum - 1, 11));
    return monthNum >= 1 && monthNum <= 12 ? months[index] : 'Mes inválido';
}


/**
 * Obtiene todos los sorteos de un servidor
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Object>} Objeto que mapea IDs de mensaje a datos de sorteos
 */
export async function getGuildGiveaways(client, guildId) {
    const key = giveawayKey(guildId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.error("El cliente de base de datos no está disponible para getGuildGiveaways.");
            return {};
        }

        const giveaways = await client.db.get(key, {});
        return unwrapReplitData(giveaways) || {};
    } catch (error) {
        logger.error(`Error al obtener los sorteos del servidor ${guildId}:`, error);
        return {};
    }
}

/**
 * Guarda un sorteo
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @param {Object} giveawayData - Datos del sorteo a guardar
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para saveGiveaway.");
            return false;
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        giveaways[giveawayData.messageId] = giveawayData;
        
        await client.db.set(key, giveaways);
        return true;
    } catch (error) {
        logger.error('Error al guardar el sorteo:', error);
        return false;
    }
}

/**
 * Elimina un sorteo
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {string} guildId - ID del servidor
 * @param {string} messageId - ID del mensaje del sorteo a eliminar
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function deleteGiveaway(client, guildId, messageId) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        if (giveaways[messageId]) {
            delete giveaways[messageId];
            await client.db.set(key, giveaways);
            return true;
        }
        return false;
    } catch (error) {
        logger.error('Error al eliminar el sorteo:', error);
        return false;
    }
}

/**
 * Obtiene todos los sorteos que han finalizado (optimizado con SQL para PostgreSQL)
 * Usa el índice de la tabla giveaways en ends_at para consultas eficientes
 * @param {Object} client - Cliente de Discord con base de datos
 * @returns {Promise<Array>} Array de registros de sorteos finalizados
 */
export async function getEndedGiveaways(client) {
    try {
        if (!client.db || !client.db.isAvailable()) {
            logger.warn('Base de datos no disponible para getEndedGiveaways, usando fallback');
            return [];
        }

        const { pgDb } = await import('./postgresDatabase.js');
        const { pgConfig } = await import('../config/postgres.js');
        
        if (!pgDb.isAvailable()) {
            return [];
        }

        const result = await pgDb.pool.query(
            `SELECT id, guild_id, message_id, data, ends_at 
             FROM ${pgConfig.tables.giveaways} 
             WHERE ends_at <= NOW() 
             AND (data->>'ended')::boolean = false
             ORDER BY ends_at ASC`
        );

        return result.rows || [];
    } catch (error) {
        logger.error('Error al obtener los sorteos finalizados:', error);
        return [];
    }
}

/**
 * Marca un sorteo como finalizado en la base de datos
 * @param {Object} client - Cliente de Discord con base de datos
 * @param {number} giveawayId - ID del sorteo en la base de datos
 * @param {Object} endedData - Datos actualizados del sorteo a guardar
 * @returns {Promise<boolean>} Estado de éxito
 */
export async function markGiveawayEnded(client, giveawayId, endedData) {
    try {
        if (!client.db || !client.db.isAvailable()) {
            logger.warn('Base de datos no disponible para markGiveawayEnded');
            return false;
        }

        const { pgDb } = await import('./postgresDatabase.js');
        const { pgConfig } = await import('../config/postgres.js');
        
        if (!pgDb.isAvailable()) {
            return false;
        }

        await pgDb.pool.query(
            `UPDATE ${pgConfig.tables.giveaways} 
             SET data = $1, updated_at = NOW() 
             WHERE id = $2`,
            [endedData, giveawayId]
        );

        return true;
    } catch (error) {
        logger.error('Error al marcar el sorteo como finalizado:', error);
        return false;
    }
}

/**
 * Genera una clave consistente para los sorteos en la base de datos
 * @param {string} guildId - ID del servidor
 * @returns {string} La clave formateada
 */
export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

export const getGiveawaysKey = giveawayKey;

export function getTicketKey(guildId, channelId) {
    return `guild:${guildId}:ticket:${channelId}`;
}

export function getInviteTrackingKey(guildId) {
    return `guild:${guildId}:invites`;
}

export function getMemberInvitesKey(guildId, userId) {
    return `guild:${guildId}:invites:${userId}`;
}

export function getInviteUsesKey(guildId, inviteCode) {
    return `guild:${guildId}:invite_uses:${inviteCode}`;
}

export function getFakeAccountKey(guildId, userId) {
    return `guild:${guildId}:fake_account:${userId}`;
}

export async function getTicketData(guildId, channelId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    return await db.get(key);
}

export async function getOpenTicketCountForUser(guildId, userId) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
            const { pgConfig } = await import('../config/postgres.js');
            const result = await db.db.pool.query(
                `SELECT COUNT(*)::int AS count FROM ${pgConfig.tables.tickets}
                 WHERE guild_id = $1
                   AND data->>'userId' = $2
                   AND data->>'status' = 'open'`,
                [guildId, userId]
            );

            return Number(result.rows?.[0]?.count || 0);
        }

        if (typeof db.list === 'function') {
            const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
            let count = 0;

            for (const key of ticketKeys) {
                const ticket = await getFromDb(key, null);
                if (ticket && ticket.userId === userId && ticket.status === 'open') {
                    count += 1;
                }
            }

            return count;
        }

        return 0;
    } catch (error) {
        logger.error(`Error al contar los tickets abiertos del usuario ${userId} en el servidor ${guildId}:`, error);
        return 0;
    }
}

export async function saveTicketData(guildId, channelId, data) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.set(key, data);
}

export async function deleteTicketData(guildId, channelId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.delete(key);
}

export function getTicketCounterKey(guildId) {
    return `guild:${guildId}:ticket:counter`;
}

export async function getTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const counter = await db.get(key);
    return counter || 0;
}

export async function incrementTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const currentCounter = await getTicketCounter(guildId);
    const nextCounter = currentCounter + 1;
    
    await db.set(key, nextCounter);
    
    // Devuelve rellenado a 3 dígitos (001, 002, etc.)
    return nextCounter.toString().padStart(3, '0');
}







export function getEconomyKey(guildId, userId) {
    return `guild:${guildId}:economy:${userId}`;
}







export function getAFKKey(guildId, userId) {
    return `guild:${guildId}:afk:${userId}`;
}






export function getWelcomeConfigKey(guildId) {
    return `guild:${guildId}:welcome`;
}

function normalizeWelcomeConfig(raw = {}) {
    const base = typeof raw === "object" && raw !== null ? raw : {};

    const channelId = base.channelId ?? null;
    const goodbyeChannelId = base.goodbyeChannelId ?? null;

    const welcomeMessage = base.welcomeMessage ?? "¡Bienvenido/a {user} a {server}!";
    const leaveMessage = base.leaveMessage ?? "{user.tag} ha abandonado el servidor.";

    const welcomeEmbed = base.welcomeEmbed ?? {
        title: "🎉 ¡Bienvenido/a!",
        description: "¡Bienvenido/a {user} a {server}!",
        color: getColor("success"),
        thumbnail: true,
        footer: "¡Bienvenido/a a {server}!"
    };

    const leaveEmbed = base.leaveEmbed ?? {
        title: "👋 Adiós",
        description: "{user.tag} ha abandonado el servidor.",
        color: getColor("error"),
        thumbnail: true,
        footer: "¡Hasta luego de {server}!"
    };

    const roleIds = Array.isArray(base.roleIds) ? base.roleIds : [];

    return {
        ...base,
        enabled: Boolean(base.enabled),
        channelId,
        welcomeMessage,
        welcomeEmbed,
        welcomePing: Boolean(base.welcomePing),
        welcomeImage: base.welcomeImage ?? null,
        goodbyeEnabled: Boolean(base.goodbyeEnabled),
        goodbyeChannelId,
        leaveMessage,
        leaveEmbed,
        dmMessage: base.dmMessage ?? "",
        goodbyePing: Boolean(base.goodbyePing),
        roleIds,
        autoRoleDelay: base.autoRoleDelay ?? 0,
        joinLogs: base.joinLogs ?? { enabled: false, channelId: null },
        leaveLogs: base.leaveLogs ?? { enabled: false, channelId: null }
    };
}







export async function getWelcomeConfig(client, guildId) {
    if (!client.db) {
        logger.warn('Base de datos no disponible para getWelcomeConfig');
        return normalizeWelcomeConfig();
    }
    
    const key = getWelcomeConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        return normalizeWelcomeConfig(unwrapped);
    } catch (error) {
        logger.error(`Error al obtener la configuración de bienvenida del servidor ${guildId}:`, error);
        return normalizeWelcomeConfig();
    }
}








export async function saveWelcomeConfig(client, guildId, config) {
    const key = getWelcomeConfigKey(guildId);
    try {
        const existingConfig = await getWelcomeConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración de bienvenida del servidor ${guildId}:`, error);
        return false;
    }
}








export async function updateWelcomeConfig(client, guildId, updates) {
    try {
        const currentConfig = await getWelcomeConfig(client, guildId);
        const updatedConfig = { ...currentConfig, ...updates };
        
        await saveWelcomeConfig(client, guildId, updatedConfig);
        return updatedConfig;
    } catch (error) {
        logger.error(`Error al actualizar la configuración de bienvenida del servidor ${guildId}:`, error);
        throw error;
    }
}







export function getLevelingKey(guildId) {
    return `guild:${guildId}:leveling:config`;
}







export function getUserLevelKey(guildId, userId) {
    return `guild:${guildId}:leveling:users:${userId}`;
}







export async function getLevelingConfig(client, guildId) {
    const key = getLevelingKey(guildId);
    try {
        const config = await getFromDb(key, {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpChannel: null,
            roles: {},
            milestones: {}
        });
        
        return config;
    } catch (error) {
        logger.error('Error al obtener la configuración de niveles:', error);
        return {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpChannel: null,
            roles: {},
            milestones: {}
        };
    }
}








export async function saveLevelingConfig(client, guildId, config) {
    const key = getLevelingKey(guildId);
    try {
        await setInDb(key, config);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración de niveles del servidor ${guildId}:`, error);
        return false;
    }
}








export async function getUserLevelData(client, guildId, userId) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const data = await getFromDb(key, null);
        if (!data) {
            return {
                xp: 0,
                level: 0,
                totalXp: 0,
                lastMessage: 0,
                rank: 0,
                xpToNextLevel: getXpForLevel(1)
            };
        }
        
        const levelData = {
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            xpToNextLevel: getXpForLevel((data.level || 0) + 1)
        };
        
        return levelData;
    } catch (error) {
        logger.error(`Error al obtener los datos de nivel del usuario ${userId} en el servidor ${guildId}:`, error);
        return {
            xp: 0,
            level: 0,
            totalXp: 0,
            lastMessage: 0,
            rank: 0,
            xpToNextLevel: getXpForLevel(1)
        };
    }
}









export async function saveUserLevelData(client, guildId, userId, data) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const levelData = {
            ...data,
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            updatedAt: Date.now()
        };
        
        await setInDb(key, levelData);
        return true;
    } catch (error) {
        logger.error(`Error al guardar los datos de nivel del usuario ${userId} en el servidor ${guildId}:`, error);
        return false;
    }
}






export function getXpForLevel(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 50;
}








export async function getLeaderboard(client, guildId, limit = 10) {
    try {
        if (!client.db || typeof client.db.list !== "function") {
            logger.error("El cliente de base de datos no está disponible para getLeaderboard.");
            return [];
        }

        const prefix = `guild:${guildId}:leveling:users:`;
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return [];
            }
        }
        
        if (keys.length === 0) {
            return [];
        }
        
        const userDataPromises = keys.map(async (key) => {
            try {
                const userId = key.replace(prefix, '');
                const data = await client.db.get(key);
                if (!data) return null;
                
                const unwrapped = unwrapReplitData(data);
                return {
                    userId,
                    xp: unwrapped.xp || 0,
                    level: unwrapped.level || 0,
                    totalXp: unwrapped.totalXp || 0,
rank: 0
                };
            } catch (error) {
                logger.error(`Error al procesar la clave del marcador ${key}:`, error);
                return null;
            }
        });
        
        let userData = (await Promise.all(userDataPromises)).filter(Boolean);
        
        userData.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
        
        userData = userData.map((user, index) => ({
            ...user,
            rank: index + 1
        }));
        
        return userData.slice(0, limit);
    } catch (error) {
        logger.error(`Error al obtener el marcador del servidor ${guildId}:`, error);
        return [];
    }
}







export function getApplicationRolesKey(guildId) {
    return `guild:${guildId}:applications:roles`;
}







export async function getApplicationRoles(client, guildId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.error("El cliente de base de datos no está disponible para getApplicationRoles.");
            return [];
        }

        const key = getApplicationRolesKey(guildId);
        const roles = await client.db.get(key, []);
        const unwrappedRoles = unwrapReplitData(roles);
        return Array.isArray(unwrappedRoles) ? unwrappedRoles : [];
    } catch (error) {
        logger.error(`Error al obtener los roles de solicitud del servidor ${guildId}:`, error);
        return [];
    }
}








export async function saveApplicationRoles(client, guildId, roles) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para saveApplicationRoles.");
            return false;
        }

        const key = getApplicationRolesKey(guildId);
        await client.db.set(key, roles);
        return true;
    } catch (error) {
        logger.error(`Error al guardar los roles de solicitud del servidor ${guildId}:`, error);
        return false;
    }
}






export function getApplicationSettingsKey(guildId) {
    return `guild:${guildId}:applications:settings`;
}







export function getUserApplicationsKey(guildId, userId) {
    return `guild:${guildId}:applications:users:${userId}`;
}







export function getApplicationKey(guildId, applicationId) {
    return `guild:${guildId}:applications:${applicationId}`;
}







export async function getApplicationSettings(client, guildId) {
    if (!client.db) {
        logger.warn('Base de datos no disponible para getApplicationSettings');
        return {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "¿Por qué quieres unirte a nuestro equipo de staff?",
                "¿Qué experiencia tienes que te haría un buen candidato?",
                "¿Cuánto tiempo puedes dedicar a este rol?"
            ]
        };
    }
    
    const key = getApplicationSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        const defaultSettings = {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "Why do you want to join our staff team?",
                "What experience do you have that would make you a good fit?",
                "How much time can you dedicate to this role?"
            ],
            roles: {
                admin: null,
                reviewer: null,
                accepted: null,
                denied: null
            },
            requiredRoles: [],
            deniedRoles: [],
minAccountAge: 0,
            maxApplications: 1,
cooldown: 7,
            allowMultipleApplications: false,
            requireVerification: false,
            customWelcomeMessage: "",
            pendingApplicationRetentionDays: 30,
            reviewedApplicationRetentionDays: 14
        };
        
        return { ...defaultSettings, ...unwrapped };
    } catch (error) {
        logger.error(`Error al obtener la configuración de solicitudes del servidor ${guildId}:`, error);
        return {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "Why do you want to join our staff team?",
                "What experience do you have that would make you a good fit?",
                "How much time can you dedicate to this role?"
            ],
            roles: {
                admin: null,
                reviewer: null,
                accepted: null,
                denied: null
            },
            requiredRoles: [],
            deniedRoles: [],
            minAccountAge: 0,
            maxApplications: 1,
            cooldown: 7,
            allowMultipleApplications: false,
            requireVerification: false,
            customWelcomeMessage: "",
            pendingApplicationRetentionDays: 30,
            reviewedApplicationRetentionDays: 14
        };
    }
}

function getApplicationRetentionDays(settings = {}) {
    const pendingRaw = Number(settings.pendingApplicationRetentionDays);
    const reviewedRaw = Number(settings.reviewedApplicationRetentionDays);

    const pendingDays = Number.isFinite(pendingRaw) ? Math.min(Math.max(pendingRaw, 1), 3650) : 30;
    const reviewedDays = Number.isFinite(reviewedRaw) ? Math.min(Math.max(reviewedRaw, 1), 3650) : 14;

    return { pendingDays, reviewedDays };
}

function isApplicationExpired(application, retentionDays, now = Date.now()) {
    if (!application || typeof application !== 'object') {
        return false;
    }

    const createdAt = Number(application.createdAt) || now;
    const updatedAt = Number(application.updatedAt) || createdAt;
    const reviewedAt = application.reviewedAt ? Number(new Date(application.reviewedAt)) : null;
    const status = typeof application.status === 'string' ? application.status.toLowerCase() : 'pending';

    const ageMsFromCreated = now - createdAt;
    const ageMsFromReviewed = now - (reviewedAt || updatedAt || createdAt);
    const pendingRetentionMs = retentionDays.pendingDays * 24 * 60 * 60 * 1000;
    const reviewedRetentionMs = retentionDays.reviewedDays * 24 * 60 * 60 * 1000;

    if (status === 'pending') {
        return ageMsFromCreated > pendingRetentionMs;
    }

    if (status === 'approved' || status === 'denied') {
        return ageMsFromReviewed > reviewedRetentionMs;
    }

    return ageMsFromCreated > pendingRetentionMs;
}

export async function deleteApplication(client, guildId, applicationId, userIdHint = null) {
    const key = getApplicationKey(guildId, applicationId);

    try {
        const existing = unwrapReplitData(await client.db.get(key, null));
        const userId = userIdHint || existing?.userId || null;

        await client.db.delete(key);

        if (userId) {
            const userKey = getUserApplicationsKey(guildId, userId);
            const userApplications = await client.db.get(userKey, []);
            const unwrapped = unwrapReplitData(userApplications);
            const ids = Array.isArray(unwrapped) ? unwrapped : [];
            const filtered = ids.filter(id => id !== applicationId);
            await client.db.set(userKey, filtered);
        }

        return true;
    } catch (error) {
        logger.error(`Error al eliminar la solicitud ${applicationId} en el servidor ${guildId}:`, error);
        return false;
    }
}

export async function cleanupExpiredApplications(client, guildId) {
    try {
        if (!client.db || typeof client.db.list !== 'function') {
            return { removed: 0, scanned: 0 };
        }

        const settings = await getApplicationSettings(client, guildId);
        const retentionDays = getApplicationRetentionDays(settings);
        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);

        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return { removed: 0, scanned: 0 };
            }
        }

        const applicationKeyPattern = new RegExp(`^guild:${guildId}:applications:[^:]+$`);
        const applicationKeys = keys.filter(key => applicationKeyPattern.test(key));

        const now = Date.now();
        let removed = 0;

        for (const key of applicationKeys) {
            const app = unwrapReplitData(await client.db.get(key, null));
            if (!app) {
                continue;
            }

            if (isApplicationExpired(app, retentionDays, now)) {
                const deleted = await deleteApplication(client, guildId, app.id, app.userId);
                if (deleted) {
                    removed += 1;
                }
            }
        }

        return { removed, scanned: applicationKeys.length };
    } catch (error) {
        logger.error(`Error al limpiar las solicitudes expiradas del servidor ${guildId}:`, error);
        return { removed: 0, scanned: 0 };
    }
}








export async function saveApplicationSettings(client, guildId, settings) {
    const key = getApplicationSettingsKey(guildId);
    try {
        const existingSettings = await getApplicationSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración de solicitudes del servidor ${guildId}:`, error);
        return false;
    }
}

// ────────── Configuración por solicitud (Preguntas y Canal de Registro) ──────────

function getApplicationRoleSettingsKey(guildId, roleId) {
    return `guild:${guildId}:applications:role:${roleId}:settings`;
}

export async function getApplicationRoleSettings(client, guildId, roleId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            return { questions: null, logChannelId: null };
        }

        const key = getApplicationRoleSettingsKey(guildId, roleId);
        const settings = await client.db.get(key, {});
        return unwrapReplitData(settings) || { questions: null, logChannelId: null };
    } catch (error) {
        logger.error(`Error al obtener la configuración de solicitud por rol para ${guildId}:${roleId}:`, error);
        return { questions: null, logChannelId: null };
    }
}

export async function saveApplicationRoleSettings(client, guildId, roleId, settings) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para saveApplicationRoleSettings.");
            return false;
        }

        const key = getApplicationRoleSettingsKey(guildId, roleId);
        await client.db.set(key, settings);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración de solicitud por rol para ${guildId}:${roleId}:`, error);
        return false;
    }
}

export async function deleteApplicationRoleSettings(client, guildId, roleId) {
    try {
        if (!client.db || typeof client.db.delete !== "function") {
            logger.error("El cliente de base de datos no está disponible para deleteApplicationRoleSettings.");
            return false;
        }

        const key = getApplicationRoleSettingsKey(guildId, roleId);
        await client.db.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error al eliminar la configuración de solicitud por rol para ${guildId}:${roleId}:`, error);
        return false;
    }
}







export async function createApplication(client, application) {
    const { guildId, userId } = application;
    const applicationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = getApplicationKey(guildId, applicationId);
    
    const newApplication = {
        ...application,
        id: applicationId,
status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reviewedBy: null,
        reviewedAt: null,
        notes: []
    };
    
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("El cliente de base de datos no está disponible para createApplication.");
            throw new Error("Base de datos no disponible");
        }

        await client.db.set(key, newApplication);
        
        const userKey = getUserApplicationsKey(guildId, userId);
        const userApplications = await client.db.get(userKey, []);
        const unwrappedApplications = unwrapReplitData(userApplications);
        
        const applicationsArray = Array.isArray(unwrappedApplications) ? unwrappedApplications : [];
        applicationsArray.push(applicationId);
        
        await client.db.set(userKey, applicationsArray);
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Solicitud ${applicationId} creada correctamente para el usuario ${userId}`);
        }
        
        return newApplication;
    } catch (error) {
        logger.error(`Error al crear la solicitud del usuario ${userId} en el servidor ${guildId}:`, error);
        throw error;
    }
}








export async function getApplication(client, guildId, applicationId) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        await cleanupExpiredApplications(client, guildId);
        const application = await client.db.get(key, null);
        return unwrapReplitData(application);
    } catch (error) {
        logger.error(`Error al obtener la solicitud ${applicationId} en el servidor ${guildId}:`, error);
        return null;
    }
}









export async function updateApplication(client, guildId, applicationId, updates) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        const existingApplication = await getApplication(client, guildId, applicationId);
        if (!existingApplication) {
            throw new Error(`Solicitud ${applicationId} no encontrada`);
        }
        
        const updatedApplication = {
            ...existingApplication,
            ...updates,
            updatedAt: Date.now()
        };
        
        await client.db.set(key, updatedApplication);
        return updatedApplication;
    } catch (error) {
        logger.error(`Error al actualizar la solicitud ${applicationId} en el servidor ${guildId}:`, error);
        throw error;
    }
}








export async function getUserApplications(client, guildId, userId) {
    const userKey = getUserApplicationsKey(guildId, userId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.error("El cliente de base de datos no está disponible para getUserApplications.");
            return [];
        }

        await cleanupExpiredApplications(client, guildId);

        const applicationIds = await client.db.get(userKey, []);
        const unwrappedIds = unwrapReplitData(applicationIds);
        
        const idsArray = Array.isArray(unwrappedIds) ? unwrappedIds : [];
        
        const applicationPromises = idsArray.map(id => 
            getApplication(client, guildId, id)
        );
        
        const applications = await Promise.all(applicationPromises);
        return applications.filter(Boolean);
    } catch (error) {
        logger.error(`Error al obtener las solicitudes del usuario ${userId} en el servidor ${guildId}:`, error);
        return [];
    }
}












export async function getApplications(client, guildId, filters = {}) {
    const {
        status,
        userId,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        if (!client.db || typeof client.db.list !== "function") {
            logger.error("El cliente de base de datos no está disponible para getApplications.");
            return [];
        }

        await cleanupExpiredApplications(client, guildId);

        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                const keyArray = Object.keys(keys).filter(key => key.startsWith(prefix));
                keys = keyArray;
            } else {
                return [];
            }
        }
        
        const applicationKeyPattern = new RegExp(`^guild:${guildId}:applications:[^:]+$`);
        const applicationKeys = keys.filter(key => applicationKeyPattern.test(key));
        
        const applicationPromises = applicationKeys.map(key => client.db.get(key));
        let applications = (await Promise.all(applicationPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        if (status) {
            applications = applications.filter(app => app.status === status);
        }
        
        if (userId) {
            applications = applications.filter(app => app.userId === userId);
        }
        
        applications.sort((a, b) => b.createdAt - a.createdAt);
        
        return applications.slice(offset, offset + limit);
    } catch (error) {
        logger.error(`Error al obtener las solicitudes del servidor ${guildId}:`, error);
        return [];
    }
}







export function getModlogSettingsKey(guildId) {
    return `guild:${guildId}:modlog:settings`;
}







export function getModlogEntryKey(guildId, caseId) {
    return `guild:${guildId}:modlog:cases:${caseId}`;
}







export function getUserModlogKey(guildId, userId) {
    return `guild:${guildId}:modlog:users:${userId}`;
}







export async function getModlogSettings(client, guildId) {
    const key = getModlogSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        const defaultSettings = {
            enabled: false,
            channelId: null,
            ignoredChannels: [],
            ignoredUsers: [],
            ignoredActions: [],
            logBans: true,
            logKicks: true,
            logMutes: true,
            logWarns: true,
            logMessageDeletes: false,
            logMessageEdits: false,
            logChannelUpdates: true,
            logMemberUpdates: true,
            logRoleUpdates: true,
            logVoiceUpdates: true,
            logEmojiUpdates: true,
            logStickerUpdates: true,
            logInviteCreates: true,
            logInviteDeletes: true,
            logWebhookUpdates: true,
            logIntegrationUpdates: true,
            logBotActions: true,
            logPunishments: true,
            logJoins: true,
            logLeaves: true,
            logNicknameChanges: true,
            logRoleChanges: true,
            logTimeoutAdds: true,
            logTimeoutRemovals: true,
            logThreadCreates: true,
            logThreadDeletes: true,
            logThreadUpdates: true,
            logScheduledEvents: true,
            logAutomod: true,
            logStages: true,
            logGuildUpdates: true,
            logEmojiRoleUpdates: true,
            logStickerRoleUpdates: true,
            logStickerUpdates: true,
            logIntegrationRoleUpdates: true,
            logWebhookRoleUpdates: true,
            logAutoModRuleUpdates: true,
            logAutoModExecutions: true,
            logScheduledEventUpdates: true,
            logScheduledEventUsers: true,
            logScheduledEventCreates: true,
            logScheduledEventDeletes: true,
            logScheduledEventUserAdds: true,
            logScheduledEventUserRemoves: true,
            logThreadMembers: true,
            logThreadMembersUpdates: true,
            logGuildScheduledEvents: true,
            logGuildScheduledEventUsers: true,
            logGuildScheduledEventCreates: true,
            logGuildScheduledEventDeletes: true,
            logGuildScheduledEventUserAdds: true,
            logGuildScheduledEventUserRemoves: true,
            logGuildScheduledEventUpdates: true,
            logGuildScheduledEventUserUpdates: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventCreate: true,
            logGuildScheduledEventDelete: true,
            logGuildScheduledEventUpdate: true,
            logGuildScheduledEventUserAdds: true,
            logGuildScheduledEventUserRemoves: true,
            logGuildScheduledEventUserUpdates: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true
        };
        
        return { ...defaultSettings, ...unwrapped };
    } catch (error) {
        logger.error(`Error al obtener la configuración del modlog del servidor ${guildId}:`, error);
        return {
            enabled: false,
            channelId: null,
            ignoredChannels: [],
            ignoredUsers: [],
            ignoredActions: [],
            logBans: true,
            logKicks: true,
            logMutes: true,
            logWarns: true,
            logMessageDeletes: false,
            logMessageEdits: false,
            logChannelUpdates: true,
            logMemberUpdates: true,
            logRoleUpdates: true,
            logVoiceUpdates: true,
            logEmojiUpdates: true,
            logStickerUpdates: true,
            logInviteCreates: true,
            logInviteDeletes: true,
            logWebhookUpdates: true,
            logIntegrationUpdates: true,
            logBotActions: true,
            logPunishments: true,
            logJoins: true,
            logLeaves: true,
            logNicknameChanges: true,
            logRoleChanges: true,
            logTimeoutAdds: true,
            logTimeoutRemovals: true
        };
    }
}








export async function saveModlogSettings(client, guildId, settings) {
    const key = getModlogSettingsKey(guildId);
    try {
        const existingSettings = await getModlogSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración del modlog del servidor ${guildId}:`, error);
        return false;
    }
}







export async function createModlogEntry(client, entry) {
    const { guildId, userId } = entry;
    const caseId = generateCaseId();
    const key = getModlogEntryKey(guildId, caseId);
    
    const newEntry = {
        ...entry,
        caseId,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    
    try {
        await client.db.set(key, newEntry);
        
        const userKey = getUserModlogKey(guildId, userId);
        const userEntries = await client.db.get(userKey, []);
        
        if (!userEntries.includes(caseId)) {
            userEntries.push(caseId);
            await client.db.set(userKey, userEntries);
        }
        
        return newEntry;
    } catch (error) {
        logger.error(`Error al crear la entrada de modlog para el usuario ${userId} en el servidor ${guildId}:`, error);
        throw error;
    }
}








export async function getModlogEntry(client, guildId, caseId) {
    const key = getModlogEntryKey(guildId, caseId);
    try {
        const entry = await client.db.get(key, null);
        return unwrapReplitData(entry);
    } catch (error) {
        logger.error(`Error al obtener la entrada de modlog ${caseId} en el servidor ${guildId}:`, error);
        return null;
    }
}









export async function updateModlogEntry(client, guildId, caseId, updates) {
    const key = getModlogEntryKey(guildId, caseId);
    try {
        const existingEntry = await getModlogEntry(client, guildId, caseId);
        if (!existingEntry) {
            throw new Error(`Entrada de modlog ${caseId} no encontrada`);
        }
        
        const updatedEntry = {
            ...existingEntry,
            ...updates,
            updatedAt: Date.now()
        };
        
        await client.db.set(key, updatedEntry);
        return updatedEntry;
    } catch (error) {
        logger.error(`Error al actualizar la entrada de modlog ${caseId} en el servidor ${guildId}:`, error);
        throw error;
    }
}








export async function getUserModlogEntries(client, guildId, userId) {
    const userKey = getUserModlogKey(guildId, userId);
    try {
        const caseIds = await client.db.get(userKey, []);
        const entryPromises = caseIds.map(caseId => 
            getModlogEntry(client, guildId, caseId)
        );
        
        const entries = await Promise.all(entryPromises);
        return entries.filter(Boolean);
    } catch (error) {
        logger.error(`Error al obtener las entradas de modlog del usuario ${userId} en el servidor ${guildId}:`, error);
        return [];
    }
}













export async function getModlogEntries(client, guildId, filters = {}) {
    const {
        userId,
        moderatorId,
        action,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        const prefix = `guild:${guildId}:modlog:cases:`;
        const keys = await client.db.list(prefix);
        
        const entryPromises = keys.map(key => client.db.get(key));
        let entries = (await Promise.all(entryPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        if (userId) {
            entries = entries.filter(entry => entry.userId === userId);
        }
        
        if (moderatorId) {
            entries = entries.filter(entry => entry.moderatorId === moderatorId);
        }
        
        if (action) {
            entries = entries.filter(entry => entry.action === action);
        }
        
        entries.sort((a, b) => b.createdAt - a.createdAt);
        
        return entries.slice(offset, offset + limit);
    } catch (error) {
        logger.error(`Error al obtener las entradas de modlog del servidor ${guildId}:`, error);
        return [];
    }
}







export function getJoinToCreateConfigKey(guildId) {
    return `guild:${guildId}:jointocreate`;
}






export function getJoinToCreateChannelsKey(guildId) {
    return `guild:${guildId}:jointocreate:channels`;
}







export async function getJoinToCreateConfig(client, guildId) {
    if (!client.db) {
        logger.warn('Base de datos no disponible para getJoinToCreateConfig');
        return {
            enabled: false,
            triggerChannels: [],
            categoryId: null,
            channelNameTemplate: "Sala de {username}",
            userLimit: 0,
            bitrate: 64000,
            temporaryChannels: {}
        };
    }
    
    const key = getJoinToCreateConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        
        return {
            enabled: unwrapped.enabled || false,
            triggerChannels: unwrapped.triggerChannels || [],
            categoryId: unwrapped.categoryId || null,
            channelNameTemplate: unwrapped.channelNameTemplate || "Sala de {username}",
            userLimit: unwrapped.userLimit || 0,
            bitrate: unwrapped.bitrate || 64000,
            temporaryChannels: unwrapped.temporaryChannels || {},
            ...unwrapped
        };
    } catch (error) {
        logger.error(`Error al obtener la configuración de Unirse para Crear del servidor ${guildId}:`, error);
        return {
            enabled: false,
            triggerChannels: [],
            categoryId: null,
            channelNameTemplate: "{username}'s Room",
            userLimit: 0,
            bitrate: 64000,
            temporaryChannels: {}
        };
    }
}








export async function saveJoinToCreateConfig(client, guildId, config) {
    const key = getJoinToCreateConfigKey(guildId);
    try {
        const existingConfig = await getJoinToCreateConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (error) {
        logger.error(`Error al guardar la configuración de Unirse para Crear del servidor ${guildId}:`, error);
        return false;
    }
}








export async function updateJoinToCreateConfig(client, guildId, updates) {
    try {
        const currentConfig = await getJoinToCreateConfig(client, guildId);
        const updatedConfig = { ...currentConfig, ...updates };
        
        await saveJoinToCreateConfig(client, guildId, updatedConfig);
        return updatedConfig;
    } catch (error) {
        logger.error(`Error al actualizar la configuración de Unirse para Crear del servidor ${guildId}:`, error);
        throw error;
    }
}









export async function addJoinToCreateTrigger(client, guildId, channelId, options = {}) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        if (config.triggerChannels.includes(channelId)) {
            return false;
        }
        
        config.triggerChannels.push(channelId);
        config.enabled = config.triggerChannels.length > 0;
        
        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }
            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit: options.userLimit || config.userLimit,
                bitrate: options.bitrate || config.bitrate
            };
        }
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        logger.error(`Error al añadir el canal disparador de Unirse para Crear en el servidor ${guildId}:`, error);
        return false;
    }
}








export async function removeJoinToCreateTrigger(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        const index = config.triggerChannels.indexOf(channelId);
        if (index === -1) {
            return false;
        }
        
        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;
        
        if (config.channelOptions && config.channelOptions[channelId]) {
            delete config.channelOptions[channelId];
        }
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        logger.error(`Error al eliminar el canal disparador de Unirse para Crear en el servidor ${guildId}:`, error);
        return false;
    }
}










export async function registerTemporaryChannel(client, guildId, channelId, ownerId, triggerChannelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        config.temporaryChannels[channelId] = {
            ownerId,
            triggerChannelId,
            createdAt: Date.now()
        };
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        logger.error(`Error al registrar el canal temporal en el servidor ${guildId}:`, error);
        return false;
    }
}








export async function unregisterTemporaryChannel(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        if (config.temporaryChannels[channelId]) {
            delete config.temporaryChannels[channelId];
            return await saveJoinToCreateConfig(client, guildId, config);
        }
        
        return false;
    } catch (error) {
        logger.error(`Error al desregistrar el canal temporal en el servidor ${guildId}:`, error);
        return false;
    }
}








export async function getTemporaryChannelInfo(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        return config.temporaryChannels[channelId] || null;
    } catch (error) {
        logger.error(`Error al obtener la información del canal temporal en el servidor ${guildId}:`, error);
        return null;
    }
}







export function formatChannelName(template, variables) {
    let formatted = template;
    
    const replacements = {
        '{username}': variables.username || 'Usuario',
        '{user_tag}': variables.userTag || 'Usuario#0000',
        '{display_name}': variables.displayName || 'Usuario',
        '{guild_name}': variables.guildName || 'Servidor',
        '{channel_name}': variables.channelName || 'Canal de Voz'
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    formatted = formatted.replace(/[^\w\s-]/g, '').trim();
formatted = formatted.substring(0, 100);
    
    return formatted || 'Canal de Voz';
}





function generateCaseId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
}



