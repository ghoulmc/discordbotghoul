import { assertAllowlistedIdentifier } from '../utils/sqlIdentifiers.js';
import { EXPECTED_SCHEMA_LABEL, EXPECTED_SCHEMA_VERSION } from './schemaVersion.js';

/**
 * LISTA DE TABLAS AUTORIZADAS
 * Aquí se definen todos los "cajones" donde el bot guarda información.
 */
const configuredTables = {
    guilds: 'guilds',
    users: 'users',
    guild_users: 'guild_users',
    birthdays: 'birthdays',
    giveaways: 'giveaways',
    tickets: 'ticket_data',
    afk_status: 'afk_status',
    welcome_configs: 'welcome_configs',
    leveling_configs: 'leveling_configs',
    user_levels: 'user_levels',
    economy: 'economy',
    invite_tracking: 'invite_tracking',
    application_roles: 'application_roles',
    verification_audit: 'verification_audit',
    temp_data: 'temp_data',
    cache_data: 'cache_data',
};

const allowedTableIdentifiers = new Set(Object.values(configuredTables));

// Validación de seguridad para evitar inyecciones SQL en los nombres de las tablas
const validatedTables = Object.fromEntries(
    Object.entries(configuredTables).map(([key, value]) => [
        key,
        assertAllowlistedIdentifier(value, allowedTableIdentifiers, `Identificador de tabla PostgreSQL (${key})`),
    ])
);

/**
 * CONFIGURACIÓN DE CONEXIÓN GHOULMC
 */
export const pgConfig = {
    // URL de conexión (Prioriza la variable de entorno para seguridad)
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/ghoulmc_db',
    
    options: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'ghoulmc_db',
        user: process.env.POSTGRES_USER || 'postgres',
        password: (process.env.POSTGRES_PASSWORD || '').toString(),
        ssl: false, // Cambiar a true si tu hosting de DB requiere SSL (como Supabase o Render)
        
        // Configuración del Pool (Gestión de conexiones simultáneas)
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 20,
        min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS) || 2,
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT) || 10000,
        
        application_name: 'ghoulmc_bot',
        statement_timeout: process.env.NODE_ENV === 'production' ? 30000 : 0,
        keepalives: 1,
        keepalives_idle: 30,
        
        // Reintentos en caso de caída de conexión
        retries: parseInt(process.env.POSTGRES_RETRIES) || 3,
        backoffBase: parseInt(process.env.POSTGRES_BACKOFF_BASE) || 100,
        backoffMultiplier: parseInt(process.env.POSTGRES_BACKOFF_MULTIPLIER) || 2,
    },
    
    tables: validatedTables,
    
    /**
     * TTL (Tiempo de Vida) - ¿Cuánto tiempo guardamos datos temporales?
     * (En segundos)
     */
    defaultTTL: {
        userSession: 86400, // 24 horas
        temp: 3600,        // 1 hora
        cache: 1800,       // 30 mins
        guildConfig: null, // Permanente
        economy: null,     // Permanente
        leveling: null,    // Permanente
        giveaway: null,    // Permanente
        ticket: 604800,    // 7 días tras cerrarse
        afk: 86400,        // 24 horas
        welcome: null,
        birthday: null,
    },
    
    features: {
        pooling: true,
        ssl: false,
        metrics: true, // Recolectar datos de rendimiento
        debug: process.env.NODE_ENV === 'development',
        autoCreateTables: true, // Crea las tablas automáticamente si no existen
        autoMigrate: process.env.AUTO_MIGRATE !== 'false', // Actualiza la estructura si hay cambios
    },
    
    /**
     * Monitoreo de salud de la base de datos
     */
    healthCheck: {
        enabled: true,
        interval: 30000, // Revisar cada 30 segundos
        maxFailures: 3,
        query: 'SELECT 1', // Consulta simple para verificar que responde
    },
    
    /**
     * Configuración de Migraciones
     */
    migration: {
        enabled: true,
        table: 'schema_migrations',
        directory: 'database/migrations',
        rollbackOnFailure: false,
        expectedVersion: EXPECTED_SCHEMA_VERSION,
        expectedLabel: EXPECTED_SCHEMA_LABEL,
    }
};

export default pgConfig;
