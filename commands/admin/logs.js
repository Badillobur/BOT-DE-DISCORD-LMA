const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const LogManager = require('../../utils/logManager');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Gestionar y ver logs del bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Ver logs recientes')
                .addStringOption(option =>
                    option.setName('tipo')
                        .setDescription('Tipo de logs a mostrar')
                        .addChoices(
                            { name: 'Todos', value: 'all' },
                            { name: 'Tickets', value: 'ticket_create,ticket_close' },
                            { name: 'Usuarios', value: 'user_blacklist,user_unblacklist' },
                            { name: 'Configuración', value: 'config_change' },
                            { name: 'Errores', value: 'error' },
                            { name: 'Comandos', value: 'command_use' }
                        )
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Días hacia atrás para buscar (máximo 30)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Buscar en logs por usuario')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario a buscar en los logs')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Días hacia atrás para buscar (máximo 30)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Exportar logs como archivo')
                .addStringOption(option =>
                    option.setName('fecha')
                        .setDescription('Fecha específica (YYYY-MM-DD)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('report')
                .setDescription('Generar reporte de actividad')
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Período en días (máximo 30)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clean')
                .setDescription('Limpiar logs antiguos')
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Mantener logs de los últimos X días')
                        .setMinValue(7)
                        .setMaxValue(365)
                        .setRequired(false))),

    adminOnly: true,

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'view':
                    await this.handleViewLogs(interaction);
                    break;
                
                case 'search':
                    await this.handleSearchLogs(interaction);
                    break;
                
                case 'export':
                    await this.handleExportLogs(interaction);
                    break;
                
                case 'report':
                    await this.handleActivityReport(interaction);
                    break;
                
                case 'clean':
                    await this.handleCleanLogs(interaction);
                    break;
                
                default:
                    await interaction.reply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'Subcomando no válido.',
                            'error'
                        )],
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('❌ Error en comando logs:', error);
            
            const errorMessage = {
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al ejecutar el comando.',
                    'error'
                )],
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply(errorMessage);
            }
        }
    },

    async handleViewLogs(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const tipo = interaction.options.getString('tipo') || 'all';
        const dias = interaction.options.getInteger('dias') || 7;
        const guildId = interaction.guild.id;

        try {
            let entries = [];

            if (tipo === 'all') {
                // Obtener todos los logs del servidor
                const startDate = moment().subtract(dias, 'days').format('YYYY-MM-DD');
                const endDate = moment().format('YYYY-MM-DD');
                const allLogs = await LogManager.getLogsByDateRange(startDate, endDate);
                
                allLogs.forEach(dayLog => {
                    dayLog.entries.forEach(entry => {
                        if (entry.metadata.guildId === guildId) {
                            entries.push({
                                ...entry,
                                date: dayLog.date
                            });
                        }
                    });
                });
            } else {
                // Buscar tipos específicos
                const types = tipo.split(',');
                for (const logType of types) {
                    const typeEntries = await LogManager.searchLogs(logType.trim(), guildId, dias);
                    entries = entries.concat(typeEntries);
                }
            }

            // Ordenar por timestamp (más reciente primero)
            entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (entries.length === 0) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Sin Resultados',
                        `No se encontraron logs del tipo "${tipo}" en los últimos ${dias} días.`,
                        'info'
                    )]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Logs del Servidor (${dias} días)`)
                .setColor('#0099FF')
                .setTimestamp();

            let description = '';
            const maxEntries = 15;
            const displayEntries = entries.slice(0, maxEntries);

            displayEntries.forEach(entry => {
                const time = moment(entry.timestamp).format('DD/MM HH:mm');
                const typeIcon = this.getLogTypeIcon(entry.type);
                
                description += `${typeIcon} **${time}** - ${entry.message}\n`;
                
                if (entry.metadata.userId) {
                    description += `   👤 <@${entry.metadata.userId}>\n`;
                }
                
                description += '\n';
            });

            if (entries.length > maxEntries) {
                description += `\n*... y ${entries.length - maxEntries} entradas más*`;
            }

            embed.setDescription(description);
            embed.setFooter({ text: `Total: ${entries.length} entradas encontradas` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al obtener logs: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleSearchLogs(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const usuario = interaction.options.getUser('usuario');
        const dias = interaction.options.getInteger('dias') || 7;
        const guildId = interaction.guild.id;

        try {
            const startDate = moment().subtract(dias, 'days').format('YYYY-MM-DD');
            const endDate = moment().format('YYYY-MM-DD');
            const allLogs = await LogManager.getLogsByDateRange(startDate, endDate);
            
            const userEntries = [];

            allLogs.forEach(dayLog => {
                dayLog.entries.forEach(entry => {
                    if (entry.metadata.guildId === guildId && 
                        (entry.metadata.userId === usuario.id || entry.metadata.targetUserId === usuario.id)) {
                        userEntries.push({
                            ...entry,
                            date: dayLog.date
                        });
                    }
                });
            });

            userEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (userEntries.length === 0) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Sin Resultados',
                        `No se encontraron logs para ${usuario.username} en los últimos ${dias} días.`,
                        'info'
                    )]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Logs de ${usuario.username}`)
                .setThumbnail(usuario.displayAvatarURL())
                .setColor('#9932CC')
                .setTimestamp();

            let description = '';
            const maxEntries = 10;

            userEntries.slice(0, maxEntries).forEach(entry => {
                const time = moment(entry.timestamp).format('DD/MM HH:mm');
                const typeIcon = this.getLogTypeIcon(entry.type);
                
                description += `${typeIcon} **${time}** - ${entry.message}\n`;
                
                if (entry.metadata.reason) {
                    description += `   📝 Razón: ${entry.metadata.reason}\n`;
                }
                
                description += '\n';
            });

            if (userEntries.length > maxEntries) {
                description += `\n*... y ${userEntries.length - maxEntries} entradas más*`;
            }

            embed.setDescription(description);
            embed.setFooter({ text: `Total: ${userEntries.length} entradas encontradas` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al buscar logs: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleExportLogs(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const fecha = interaction.options.getString('fecha');

        try {
            // Validar formato de fecha
            if (!moment(fecha, 'YYYY-MM-DD', true).isValid()) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        'Formato de fecha inválido. Use YYYY-MM-DD (ej: 2024-01-15)',
                        'error'
                    )]
                });
            }

            const logs = await LogManager.getLogsByDate(fecha);

            if (!logs) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Sin Datos',
                        `No hay logs disponibles para la fecha ${fecha}.`,
                        'info'
                    )]
                });
            }

            // Filtrar logs del servidor actual
            const guildId = interaction.guild.id;
            const guildLogs = logs.entries.filter(entry => entry.metadata.guildId === guildId);

            if (guildLogs.length === 0) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Sin Datos',
                        `No hay logs de este servidor para la fecha ${fecha}.`,
                        'info'
                    )]
                });
            }

            // Crear archivo de exportación
            const exportData = {
                guild: {
                    id: guildId,
                    name: interaction.guild.name
                },
                date: fecha,
                exportedAt: new Date().toISOString(),
                totalEntries: guildLogs.length,
                entries: guildLogs
            };

            const jsonContent = JSON.stringify(exportData, null, 2);
            const fileName = `logs-${interaction.guild.name.replace(/[^a-zA-Z0-9]/g, '_')}-${fecha}.json`;

            const attachment = new AttachmentBuilder(
                Buffer.from(jsonContent, 'utf-8'),
                { name: fileName }
            );

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Logs Exportados',
                    `Se han exportado ${guildLogs.length} entradas de log del ${fecha}.\n\n**Archivo:** ${fileName}\n**Tamaño:** ${(jsonContent.length / 1024).toFixed(2)} KB`,
                    'success'
                )],
                files: [attachment]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al exportar logs: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleActivityReport(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const dias = interaction.options.getInteger('dias') || 7;
        const guildId = interaction.guild.id;

        try {
            const report = await LogManager.createActivityReport(guildId, dias);

            const embed = new EmbedBuilder()
                .setTitle(`📊 Reporte de Actividad (${dias} días)`)
                .setColor('#FFD700')
                .setTimestamp();

            // Estadísticas generales
            embed.addFields({
                name: '📈 Resumen',
                value: `**Total de eventos:** ${report.totalEntries}\n**Período:** ${report.period.start} - ${report.period.end}`,
                inline: false
            });

            // Estadísticas por tipo
            if (Object.keys(report.typeStats).length > 0) {
                let typeStatsText = '';
                Object.entries(report.typeStats)
                    .sort(([,a], [,b]) => b - a)
                    .forEach(([type, count]) => {
                        const icon = this.getLogTypeIcon(type);
                        typeStatsText += `${icon} **${type.replace('_', ' ')}:** ${count}\n`;
                    });
                
                embed.addFields({
                    name: '📋 Por Tipo de Evento',
                    value: typeStatsText,
                    inline: true
                });
            }

            // Actividad por día
            if (Object.keys(report.dailyStats).length > 0) {
                let dailyText = '';
                Object.entries(report.dailyStats)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 7)
                    .forEach(([date, count]) => {
                        const formattedDate = moment(date).format('DD/MM');
                        dailyText += `**${formattedDate}:** ${count} eventos\n`;
                    });
                
                embed.addFields({
                    name: '📅 Actividad Diaria',
                    value: dailyText,
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al generar reporte: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleCleanLogs(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const dias = interaction.options.getInteger('dias') || 90;

        try {
            const deletedCount = await LogManager.cleanOldLogs(dias);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Limpieza Completada',
                    `Se han eliminado ${deletedCount} archivos de log antiguos.\nSe mantienen los logs de los últimos ${dias} días.`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al limpiar logs: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    getLogTypeIcon(type) {
        const icons = {
            'ticket_create': '🎫',
            'ticket_close': '🔒',
            'user_blacklist': '🚫',
            'user_unblacklist': '✅',
            'config_change': '⚙️',
            'announcement_create': '📢',
            'announcement_edit': '✏️',
            'announcement_delete': '🗑️',
            'command_use': '🔧',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        
        return icons[type] || '📝';
    }
};