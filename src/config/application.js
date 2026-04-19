import { fileURLToPath } from "url";
import path from "path";
import botConfig, { validateConfig } from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";
import { pgConfig } from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CONFIGURACIÓN CENTRAL DE LA APLICACIÓN - GHOULMC
 * Agrupa la configuración del bot, base de datos, API y registros.
 */
const appConfig = {
  // Rutas del sistema de archivos
  paths: {
    root: path.join(__dirname, "../.."),
    commands: path.join(__dirname, "../commands"),
    events: path.join(__dirname, "../events"),
    config: __dirname,
    utils: path.join(__dirname, "../utils"),
    services: path.join(__dirname, "../services"),
    handlers: path.join(__dirname, "../handlers"),
    interactions: path.join(__dirname, "../interactions"),
  },

  // Configuración del Bot (Unificada con variables de entorno)
  bot: {
    ...botConfig,
    token: process.env.DISCORD_TOKEN || process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Combinación de la configuración base con la tienda traducida de GhoulMC
    shop: {
      ...botConfig.shop,
      ...shop,
    },
  },

  // Configuración de PostgreSQL - Base de datos principal
  postgresql: {
    ...pgConfig,
  },

  // Sistema de Registros (Logging)
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: {
      enabled: process.env.LOG_TO_FILE === "true",
      path: path.join(__dirname, "../../logs"),
      maxSize: "20m",      // Tamaño máximo por archivo
      maxFiles: "14d",     // Mantener registros por 14 días
      zippedArchive: true, // Comprimir archivos antiguos
    },
    console: {
      enabled: true,
      colorize: true,
      timestamp: true,
    },
    // Integración con Sentry para reporte de errores en tiempo real
    sentry: {
      enabled: process.env.SENTRY_DSN ? true : false,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
    },
  },

  // Configuración de la API (Si el bot expone un dashboard o webhooks)
  api: {
    port: process.env.PORT || 3000,
    cors: {
      // Si hay varios dominios, se separan por comas en el .env
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    // Prevención de ataques de fuerza bruta o spam a la API
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100, // Máximo 100 peticiones por ventana
    },
  },

  // Acceso directo a la configuración de la tienda
  shop,

  // Interruptores de Funciones (Feature Toggles)
  // Permite activar o desactivar módulos enteros de GhoulMC
  features: {
    // Sistemas Core
    economy: true,        // Economía (GhoulCoins)
    leveling: true,       // Sistema de Niveles/XP
    moderation: true,     // Comandos de Moderación
    logging: true,        // Registro de acciones en canales
    welcome: true,        // Mensajes de Bienvenida/Despedida

    // Sistemas de Comunidad
    tickets: true,        // Soporte por Tickets
    giveaways: true,      // Sorteos
    birthday: true,       // Cumpleaños
    counter: true,        // Canales de contador (Miembros/Bots)

    // Seguridad y Automatización
    verification: true,   // Verificación de nuevos miembros
    reactionRoles: true,  // Roles por reacción
    joinToCreate: true,   // Canales de voz temporales

    // Utilidades y Varios
    voice: true,          // Funciones de voz
    search: true,         // Buscador
    tools: true,          // Herramientas técnicas
    utility: true,        // Utilidades generales
    community: true,      // Comandos de comunidad
    fun: true,            // Comandos de diversión

    // Música (Desactivado por defecto para ahorrar recursos)
    music: false,         
  },

  // Utilidades de entorno
  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

// Congelar el objeto para evitar modificaciones accidentales en tiempo de ejecución
Object.freeze(appConfig);

export default appConfig;
