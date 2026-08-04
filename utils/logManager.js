const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const CustomEmbedBuilder = require('./embedBuilder');
const ConfigManager = require('./configManager');

class LogManager {
    static logsPath = path.join(__dirname, '..', 'data', 'logs');
    static currentLogFile = null;
    
    /**
     * Tipos de logs disponibles
     */
    static LogTypes = {
        TICKET_CREATE: 'ticket_create',
        TICKET_CLOSE: 'ticket_close',
        USER_BLACKLIST: 'user_blacklist',
        USER_UNBLACKLIST: 'user_unblacklist',
        CONFIG_CHANGE: 'config_change',
        ANNOUNCEMENT_CREATE: 'announcement_create',
        ANNOUNCEMENT_EDIT: 'announcement_edit',
        ANNOUNCEMENT_DELETE: 'announcement_delete',
        COMMAND_USE: 'command_use',
        ERROR: 'error',
        WARNING: 'warning',
        INFO: 'info'
    };

    /**
     * Inicializar sistema de logs
     */
    static async initialize() {
        await fs.ensureDir(this.logsPath);
        
        // Crear archivo de log del día actual
        const today = moment().format('YYYY-MM-DD');
        this.currentLogFile = path.join(this.logsPath, `${today}.json`);
        
        if (!await fs.pathExists(this.currentLogFile)) {
            await fs.writeJson(this.currentLogFile, {
                date: today,
                entries: []
            }, { spaces: 2 });
        }
    }

    /**
     * Escribir entrada de log
     * @param {string} type - Tipo de log
     * @param {string} message - Mensaje del log
     * @param {Object} metadata - Metadatos adicionales
     * @param {string} guildId - ID del servidor (opcional)
     */
    static async log(type, message, metadata = {}, guildId = null) {
        try {
            await this.initialize();
            
            const entry = {
                timestamp: new Date().toISOString(),
                type,
                message,
                metadata: {
                    ...metadata,
                    guildId
                }
            };

            // Escribir a archivo JSON
            const logData = await fs.readJson(this.currentLogFile);
            logData.entries.push(entry);
            await fs.writeJson(this.currentLogFile, logData, { spaces: 2 });

            // También log a consola con colores
            this.logToConsole(type, message, metadata);

            // Enviar a canal de logs si está configurado y es crítico
            if (guildId && this.isCriticalLog(type)) {
                await this.logToDiscord(type, message, metadata, guildId);
            }

        } catch (error) {
            console.error('❌ Error escribiendo log:', error);
        }
    }

    /**
     * Log específico para tickets
     */
    static async logTicket(action, ticketData, user, guildId) {
        const type = action === 'create' ? this.LogTypes.TICKET_CREATE : this.LogTypes.TICKET_CLOSE;
        
        await this.log(
            type,
            `Ticket ${action}: ${ticketData.id}`,
            {
                ticketId: ticketData.id,
                userId: user.id,
                username: user.username,
                ticketType: ticketData.type,
                option: ticketData.option,
                channelId: ticketData.channelId
            },
            guildId
        );
    }

    /**
     * Log específico para usuarios
     */
    static async logUserAction(action, targetUser, adminUser, reason, guildId) {
        const typeMap = {
            'blacklist': this.LogTypes.USER_BLACKLIST,
            'unblacklist': this.LogTypes.USER_UNBLACKLIST
        };

        await this.log(
            typeMap[action] || this.LogTypes.INFO,
            `User ${action}: ${targetUser.username}`,
            {
                targetUserId: targetUser.id,
                targetUsername: targetUser.username,
                adminUserId: adminUser.id,
                adminUsername: adminUser.username,
                reason: reason || 'No especificada'
            },
            guildId
        );
    }

    /**
     * Log específico para configuraciones
     */
    static async logConfigChange(key, oldValue, newValue, adminUser, guildId) {
        await this.log(
            this.LogTypes.CONFIG_CHANGE,
            `Config change: ${key}`,
            {
                configKey: key,
                oldValue: JSON.stringify(oldValue),
                newValue: JSON.stringify(newValue),
                adminUserId: adminUser.id,
                adminUsername: adminUser.username
            },
            guildId
        );
    }

    /**
     * Log específico para anuncios
     */
    static async logAnnouncementAction(action, announcementId, adminUser, guildId, details = {}) {
        const typeMap = {
            'create': this.LogTypes.ANNOUNCEMENT_CREATE,
            'edit': this.LogTypes.ANNOUNCEMENT_EDIT,
            'delete': this.LogTypes.ANNOUNCEMENT_DELETE
        };

        await this.log(
            typeMap[action] || this.LogTypes.INFO,
            `Announcement ${action}: ${announcementId}`,
            {
                announcementId,
                adminUserId: adminUser.id,
                adminUsername: adminUser.username,
                ...details
            },
            guildId
        );
    }

    /**
     * Log específico para comandos
     */
    static async logCommandUse(commandName, user, guildId, args = []) {
        await this.log(
            this.LogTypes.COMMAND_USE,
            `Command used: ${commandName}`,
            {
                command: commandName,
                userId: user.id,
                username: user.username,
                arguments: args
            },
            guildId
        );
    }

    /**
     * Log de errores
     */
    static async logError(error, context = {}, guildId = null) {
        await this.log(
            this.LogTypes.ERROR,
            `Error: ${error.message}`,
            {
                errorMessage: error.message,
                errorStack: error.stack,
                context
            },
            guildId
        );
    }

    /**
     * Determinar si un log es crítico
     */
    static isCriticalLog(type) {
        const criticalTypes = [
            this.LogTypes.ERROR,
            this.LogTypes.USER_BLACKLIST,
            this.LogTypes.CONFIG_CHANGE,
            this.LogTypes.ANNOUNCEMENT_DELETE
        ];
        
        return criticalTypes.includes(type);
    }

    /**
     * Log a consola con colores
     */
    static logToConsole(type, message, metadata) {
        const timestamp = moment().format('HH:mm:ss');
        const colors = require('colors');
        
        const typeColors = {
            [this.LogTypes.ERROR]: 'red',
            [this.LogTypes.WARNING]: 'yellow',
            [this.LogTypes.TICKET_CREATE]: 'green',
            [this.LogTypes.TICKET_CLOSE]: 'blue',
            [this.LogTypes.CONFIG_CHANGE]: 'magenta',
            [this.LogTypes.COMMAND_USE]: 'cyan'
        };

        const color = typeColors[type] || 'white';
        const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
        
        console.log(`${prefix[color]} ${message}`);
        
        if (Object.keys(metadata).length > 0) {
            console.log(`  ${JSON.stringify(metadata, null, 2)}`.gray);
        }
    }

    /**
     * Enviar log a Discord
     */
    static async logToDiscord(type, message, metadata, guildId) {
        try {
            // Obtener cliente de Discord del contexto global
            const client = require('../index.js');
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;

            const config = await ConfigManager.getGuildConfig(guildId);
            const logChannel = guild.channels.cache.find(c => c.name === config.logChannel);
            if (!logChannel) return;

            const embed = this.createLogEmbed(type, message, metadata);
            await logChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Error enviando log a Discord:', error);
        }
    }

    /**
     * Crear embed para log
     */
    static createLogEmbed(type, message, metadata) {
        const colors = {
            [this.LogTypes.ERROR]: '#FF0000',
            [this.LogTypes.WARNING]: '#FFA500',
            [this.LogTypes.TICKET_CREATE]: '#00FF00',
            [this.LogTypes.TICKET_CLOSE]: '#0099FF',
            [this.LogTypes.USER_BLACKLIST]: '#FF0000',
            [this.LogTypes.CONFIG_CHANGE]: '#9932CC'
        };

        const icons = {
            [this.LogTypes.ERROR]: '❌',
            [this.LogTypes.WARNING]: '⚠️',
            [this.LogTypes.TICKET_CREATE]: '🎫',
            [this.LogTypes.TICKET_CLOSE]: '🔒',
            [this.LogTypes.USER_BLACKLIST]: '🚫',
            [this.LogTypes.CONFIG_CHANGE]: '⚙️'
        };

        const embed = CustomEmbedBuilder.createConfirmationEmbed(
            `${icons[type] || 'ℹ️'} ${type.replace('_', ' ').toUpperCase()}`,
            message,
            'info'
        );

        if (colors[type]) {
            embed.setColor(colors[type]);
        }

        // Añadir campos de metadatos importantes
        if (metadata.userId) {
            embed.addFields({ name: 'Usuario', value: `<@${metadata.userId}>`, inline: true });
        }

        if (metadata.ticketId) {
            embed.addFields({ name: 'Ticket', value: metadata.ticketId, inline: true });
        }

        if (metadata.reason) {
            embed.addFields({ name: 'Razón', value: metadata.reason, inline: false });
        }

        return embed;
    }

    /**
     * Obtener logs por fecha
     */
    static async getLogsByDate(date) {
        const logFile = path.join(this.logsPath, `${date}.json`);
        
        if (await fs.pathExists(logFile)) {
            return await fs.readJson(logFile);
        }
        
        return null;
    }

    /**
     * Obtener logs por rango de fechas
     */
    static async getLogsByDateRange(startDate, endDate) {
        const logs = [];
        const current = moment(startDate);
        const end = moment(endDate);

        while (current.isSameOrBefore(end)) {
            const dayLogs = await this.getLogsByDate(current.format('YYYY-MM-DD'));
            if (dayLogs) {
                logs.push(dayLogs);
            }
            current.add(1, 'day');
        }

        return logs;
    }

    /**
     * Buscar logs por tipo
     */
    static async searchLogs(type, guildId = null, days = 30) {
        const startDate = moment().subtract(days, 'days').format('YYYY-MM-DD');
        const endDate = moment().format('YYYY-MM-DD');
        
        const allLogs = await this.getLogsByDateRange(startDate, endDate);
        const matchingEntries = [];

        allLogs.forEach(dayLog => {
            dayLog.entries.forEach(entry => {
                if (entry.type === type && (!guildId || entry.metadata.guildId === guildId)) {
                    matchingEntries.push({
                        ...entry,
                        date: dayLog.date
                    });
                }
            });
        });

        return matchingEntries;
    }

    /**
     * Limpiar logs antiguos
     */
    static async cleanOldLogs(daysToKeep = 90) {
        try {
            const files = await fs.readdir(this.logsPath);
            const cutoffDate = moment().subtract(daysToKeep, 'days');

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const dateStr = file.replace('.json', '');
                const fileDate = moment(dateStr, 'YYYY-MM-DD');
                
                if (fileDate.isBefore(cutoffDate)) {
                    await fs.remove(path.join(this.logsPath, file));
                    console.log(`🗑️ Eliminado log antiguo: ${file}`.yellow);
                }
            }

        } catch (error) {
            console.error('❌ Error limpiando logs antiguos:', error);
        }
    }

    /**
     * Crear reporte de actividad
     */
    static async createActivityReport(guildId, days = 7) {
        const startDate = moment().subtract(days, 'days').format('YYYY-MM-DD');
        const endDate = moment().format('YYYY-MM-DD');
        
        const allLogs = await this.getLogsByDateRange(startDate, endDate);
        const guildEntries = [];

        allLogs.forEach(dayLog => {
            dayLog.entries.forEach(entry => {
                if (entry.metadata.guildId === guildId) {
                    guildEntries.push({
                        ...entry,
                        date: dayLog.date
                    });
                }
            });
        });

        // Estadísticas por tipo
        const typeStats = {};
        guildEntries.forEach(entry => {
            typeStats[entry.type] = (typeStats[entry.type] || 0) + 1;
        });

        // Actividad por día
        const dailyStats = {};
        guildEntries.forEach(entry => {
            dailyStats[entry.date] = (dailyStats[entry.date] || 0) + 1;
        });

        return {
            period: { start: startDate, end: endDate },
            totalEntries: guildEntries.length,
            typeStats,
            dailyStats,
            entries: guildEntries.slice(-50) // Últimos 50 eventos
        };
    }
}

module.exports = LogManager;