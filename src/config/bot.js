import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // PREFIJO DEL BOT
  // =========================
  prefix: "/",

  // =========================
  // PRESENCIA DEL BOT (Lo que aparece debajo del nombre)
  // =========================
  presence: {
    // Estado online: "online", "idle" (ausente), "dnd" (no molestar), "invisible"
    status: "online",

    // Líneas de actividad
    activities: [
      {
        name: "GhoulMC.net", // Texto que verán los usuarios
        type: 0, // 0 = Jugando, 1 = Streaming, 2 = Escuchando, 3 = Viendo
      },
    ],
  },

  // =========================
  // COMPORTAMIENTO de COMANDOS
  // =========================
  commands: {
    // IDs de los dueños (se sacan de las variables de entorno)
    owners: process.env.OWNER_IDS?.split(",") || [],

    // Tiempo de espera por defecto (segundos)
    defaultCooldown: 3, 

    // Si es true, borra comandos antiguos antes de registrar nuevos
    deleteCommands: false,

    // ID del servidor de pruebas para registro rápido de Slash Commands
    testGuildId: process.env.TEST_GUILD_ID,
  },

  // =========================
  // SISTEMA DE POSTULACIONES (APPLICATIONS)
  // =========================
  applications: {
    defaultQuestions: [
      { question: "¿Cuál es tu nombre de usuario (IGN)?", required: true },
      { question: "¿Qué edad tienes?", required: true },
      { question: "¿Por qué quieres ser parte del Staff de GhoulMC?", required: true },
    ],

    // Colores de los embeds según el estado de la postulación
    statusColors: {
      pending: "#9B59B6", // Morado (Pendiente)
      approved: "#2ECC71", // Verde (Aprobado)
      denied: "#E74C3C",   // Rojo (Denegado)
    },

    applicationCooldown: 24, // Horas de espera para volver a postularse
    deleteDeniedAfter: 7,    // Días para borrar rechazadas
    deleteApprovedAfter: 30, // Días para borrar aprobadas
    managerRoles: [],        // Roles que gestionan esto
  },

  // =========================
  // COLORES Y MARCA (EMBEDS)
  // =========================
  // Esta es la paleta de colores principal para GhoulMC
  embeds: {
    colors: {
      primary: "#7d5bbe",    // Morado Ghoul Principal
      secondary: "#1a1a1a",  // Negro casi puro

      // Colores de estado estándar
      success: "#00FF7F",    // Verde Neón
      error: "#FF4500",      // Naranja-Rojo
      warning: "#F1C40F",    // Amarillo
      info: "#3498DB",       // Azul

      // Colores neutros
      light: "#F5F5F5",
      dark: "#0B0B0B",
      gray: "#7F8C8D",

      // Atajos de paleta estilo Discord
      blurple: "#5865F2",
      green: "#2ECC71",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

      // Colores específicos de funciones
      giveaway: {
        active: "#7d5bbe",
        ended: "#23272a",
      },
      ticket: {
        open: "#00FF7F",
        claimed: "#F1C40F",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#FFD700", // Oro
      birthday: "#E91E63",
      moderation: "#9B59B6",

      // Prioridad de tickets
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      text: "GhoulMC - El servidor con más alma",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: "GhoulMC Network",
      icon: null,
      url: "https://ghoulmc.net",
    },
  },

  // =========================
  // ECONOMÍA
  // =========================
  economy: {
    currency: {
      name: "GhoulCoin",
      namePlural: "GhoulCoins",
      symbol: "☠️",
    },
    startingBalance: 100,
    baseBankCapacity: 100000,
    dailyAmount: 200,
    workMin: 50,
    workMax: 250,
    begMin: 10,
    begMax: 80,
    robSuccessRate: 0.35, // 35% de éxito al robar
    robFailJailTime: 3600000, // 1 hora de cárcel
  },

  // =========================
  // SISTEMA DE TICKETS
  // =========================
  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: { emoji: "⚪", color: "#95A5A6", label: "Ninguna" },
      low: { emoji: "🟢", color: "#2ECC71", label: "Baja" },
      medium: { emoji: "🟡", color: "#F1C40F", label: "Media" },
      high: { emoji: "🔴", color: "#E74C3C", label: "Alta" },
      urgent: { emoji: "🚨", color: "#E91E63", label: "Urgente" },
    },
    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  // =========================
  // SORTEOS (GIVEAWAYS)
  // =========================
  giveaways: {
    defaultDuration: 86400000, // 24 horas
    minimumWinners: 1,
    maximumWinners: 20,
    minimumDuration: 300000, // 5 min
    maximumDuration: 2592000000, // 30 días
    allowedRoles: [],
    bypassRoles: [],
  },

  // =========================
  // VERIFICACIÓN
  // =========================
  verification: {
    defaultMessage: "¡Bienvenido a GhoulMC! Haz clic en el botón de abajo para verificarte y acceder al servidor.",
    defaultButtonText: "Verificarse",
    autoVerify: {
      defaultCriteria: "none",
      defaultAccountAgeDays: 3, // Seguridad: cuenta de al menos 3 días
      serverSizeThreshold: 1000,
      minAccountAge: 0,
      maxAccountAge: 365,
      sendDMNotification: true,
      criteria: {
        account_age: "La cuenta debe tener una antigüedad mínima",
        server_size: "Automático si el servidor es pequeño",
        none: "Todos los usuarios inmediatamente"
      }
    },
    verificationCooldown: 10000,
    maxVerificationAttempts: 3,
    attemptWindow: 60000,
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    cooldownCleanupInterval: 300000,
    maxAuditMetadataBytes: 4096,
    maxInMemoryAuditEntries: 1000,
    logAllVerifications: true,
    keepAuditTrail: true,
  },

  // =========================
  // BIENVENIDAS / DESPEDIDAS
  // =========================
  welcome: {
    defaultWelcomeMessage: "¡Bienvenido {user} a **GhoulMC**! Ya somos {memberCount} almas en el servidor.",
    defaultGoodbyeMessage: "{user} ha abandonado el cementerio. Ahora somos {memberCount} ghouls.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
  },

  // =========================
  // CANALES DE CONTADOR
  // =========================
  counters: {
    defaults: {
      name: "Contador de {name}",
      description: "Contador de servidor {name}",
      type: "voice",
      channelName: "{name}: {count}",
    },
    permissions: {
      deny: ["VIEW_CHANNEL"],
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      created: "✅ Contador **{name}** creado correctamente.",
      deleted: "🗑️ Contador **{name}** eliminado.",
      updated: "🔄 Contador **{name}** actualizado.",
    },
    types: {
      members: {
        name: "Ghouls Totales",
        description: "Miembros totales en el servidor",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "Bots",
        description: "Bots totales",
        getCount: (guild) => guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "Jugadores",
        description: "Solo humanos",
        getCount: (guild) => guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // MENSAJES GENÉRICOS DEL BOT
  // =========================
  messages: {
    noPermission: "❌ No tienes permisos para usar este comando.",
    cooldownActive: "⏳ Por favor, espera {time} antes de volver a usar este comando.",
    errorOccurred: "⚠️ Ha ocurrido un error interno al ejecutar este comando.",
    missingPermissions: "🚫 No tengo los permisos necesarios para realizar esta acción.",
    commandDisabled: "📴 Este comando ha sido desactivado temporalmente.",
    maintenanceMode: "🛠️ El bot se encuentra actualmente en modo mantenimiento.",
  },

  // =========================
  // ACTIVACIÓN DE FUNCIONES
  // =========================
  features: {
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,
    verification: true,
    reactionRoles: true,
    joinToCreate: true,
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
  },
};

/**
 * Función para validar la configuración
 */
export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Revisión de variables de entorno:');
    logger.debug('TOKEN existe:', !!(process.env.DISCORD_TOKEN || process.env.TOKEN));
    logger.debug('CLIENT_ID existe:', !!process.env.CLIENT_ID);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Falta el Token del Bot (DISCORD_TOKEN o TOKEN)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Falta el Client ID (CLIENT_ID)");
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.POSTGRES_HOST) {
      errors.push("PostgreSQL es obligatorio en producción.");
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Errores en la configuración del Bot:", configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

/**
 * Helper para obtener colores en formato hexadecimal entero
 */
export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback),
      botConfig.embeds.colors,
    );
  
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;

