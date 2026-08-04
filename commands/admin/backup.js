const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BackupManager = require('../../utils/backupManager');
const CustomEmbedBuilder = require('../../utils/embedBuilder');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Gestionar respaldos del bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Crear un nuevo respaldo')
                .addStringOption(option =>
                    option.setName('tipo')
                        .setDescription('Tipo de respaldo a crear')
                        .addChoices(
                            { name: 'Completo', value: 'full' },
                            { name: 'Incremental', value: 'incremental' }
                        )
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Listar respaldos disponibles'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restaurar desde un respaldo')
                .addStringOption(option =>
                    option.setName('nombre')
                        .setDescription('Nombre del respaldo a restaurar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Eliminar un respaldo')
                .addStringOption(option =>
                    option.setName('nombre')
                        .setDescription('Nombre del respaldo a eliminar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('verify')
                .setDescription('Verificar integridad de un respaldo')
                .addStringOption(option =>
                    option.setName('nombre')
                        .setDescription('Nombre del respaldo a verificar')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clean')
                .setDescription('Limpiar respaldos antiguos')
                .addIntegerOption(option =>
                    option.setName('dias')
                        .setDescription('Mantener respaldos de los últimos X días')
                        .setMinValue(7)
                        .setMaxValue(365)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('maximo')
                        .setDescription('Número máximo de respaldos a mantener')
                        .setMinValue(5)
                        .setMaxValue(200)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Ver información detallada de un respaldo')
                .addStringOption(option =>
                    option.setName('nombre')
                        .setDescription('Nombre del respaldo')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Exportar un respaldo como archivo')
                .addStringOption(option =>
                    option.setName('nombre')
                        .setDescription('Nombre del respaldo a exportar')
                        .setRequired(true))),

    adminOnly: true,

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await this.handleCreateBackup(interaction);
                    break;
                
                case 'list':
                    await this.handleListBackups(interaction);
                    break;
                
                case 'restore':
                    await this.handleRestoreBackup(interaction);
                    break;
                
                case 'delete':
                    await this.handleDeleteBackup(interaction);
                    break;
                
                case 'verify':
                    await this.handleVerifyBackup(interaction);
                    break;
                
                case 'clean':
                    await this.handleCleanBackups(interaction);
                    break;
                
                case 'info':
                    await this.handleBackupInfo(interaction);
                    break;
                
                case 'export':
                    await this.handleExportBackup(interaction);
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
            console.error('❌ Error en comando backup:', error);
            
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

    async handleCreateBackup(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const tipo = interaction.options.getString('tipo') || 'full';

        try {
            let backup;
            
            if (tipo === 'full') {
                backup = await BackupManager.createFullBackup();
            } else {
                // Para respaldo incremental, necesitamos el último respaldo
                const backups = await BackupManager.listBackups();
                if (backups.length === 0) {
                    return await interaction.editReply({
                        embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                            'Error',
                            'No hay respaldos previos para crear uno incremental. Creando respaldo completo...',
                            'warning'
                        )]
                    });
                }
                
                const lastBackup = backups[0];
                backup = await BackupManager.createIncrementalBackup(lastBackup.timestamp);
            }

            const sizeInMB = (backup.totalSize / (1024 * 1024)).toFixed(2);
            
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Respaldo Creado',
                    `**Nombre:** ${backup.name}\n**Tipo:** ${tipo === 'full' ? 'Completo' : 'Incremental'}\n**Elementos:** ${backup.itemCount}\n**Tamaño:** ${sizeInMB} MB\n**Fecha:** ${moment(backup.timestamp, 'YYYY-MM-DD_HH-mm-ss').format('DD/MM/YYYY HH:mm')}`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `No se pudo crear el respaldo: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleListBackups(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const backups = await BackupManager.listBackups();

            if (backups.length === 0) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Sin Respaldos',
                        'No hay respaldos disponibles. Usa `/backup create` para crear uno.',
                        'info'
                    )]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('💾 Respaldos Disponibles')
                .setColor('#00CED1')
                .setTimestamp();

            let description = '';
            const maxBackups = 10;

            backups.slice(0, maxBackups).forEach((backup, index) => {
                const type = backup.type || 'full';
                const typeIcon = type === 'full' ? '📦' : '📄';
                const size = backup.totalSize ? (backup.totalSize / (1024 * 1024)).toFixed(2) : '?';
                const date = moment(backup.created).format('DD/MM/YYYY HH:mm');
                
                description += `${typeIcon} **${backup.name}**\n`;
                description += `   📅 ${date} | 📊 ${size} MB | 📁 ${backup.itemCount || 0} elementos\n`;
                
                if (type === 'incremental' && backup.basedOn) {
                    description += `   🔗 Basado en: ${moment(backup.basedOn).format('DD/MM HH:mm')}\n`;
                }
                
                description += '\n';
            });

            if (backups.length > maxBackups) {
                description += `\n*... y ${backups.length - maxBackups} respaldos más*`;
            }

            embed.setDescription(description);
            embed.setFooter({ text: `Total: ${backups.length} respaldos` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al listar respaldos: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleRestoreBackup(interaction) {
        const nombre = interaction.options.getString('nombre');

        // Crear botones de confirmación para operación peligrosa
        const confirmButtons = CustomEmbedBuilder.createActionButtons([
            {
                customId: `confirm_restore_${nombre}`,
                label: 'Confirmar Restauración',
                style: 4, // Danger
                emoji: '⚠️'
            },
            {
                customId: `cancel_restore_${nombre}`,
                label: 'Cancelar',
                style: 2, // Secondary
                emoji: '❌'
            }
        ]);

        await interaction.reply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                '⚠️ Confirmación Requerida',
                `¿Estás seguro de que quieres restaurar desde "${nombre}"?\n\n**ADVERTENCIA:** Esta operación sobrescribirá todos los datos actuales.\nSe creará un respaldo automático de los datos actuales antes de la restauración.`,
                'warning'
            )],
            components: [confirmButtons],
            ephemeral: true
        });
    },

    async handleDeleteBackup(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const nombre = interaction.options.getString('nombre');

        try {
            const backups = await BackupManager.listBackups();
            const backup = backups.find(b => b.name === nombre);

            if (!backup) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        `No se encontró el respaldo "${nombre}".`,
                        'error'
                    )]
                });
            }

            // Eliminar directorio del respaldo
            const fs = require('fs-extra');
            await fs.remove(backup.path);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Respaldo Eliminado',
                    `El respaldo "${nombre}" ha sido eliminado exitosamente.`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al eliminar respaldo: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleVerifyBackup(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const nombre = interaction.options.getString('nombre');

        try {
            const verification = await BackupManager.verifyBackupIntegrity(nombre);

            if (verification.valid) {
                await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Respaldo Válido',
                        `✅ El respaldo "${nombre}" es válido.\n\n**Elementos verificados:** ${verification.itemCount}`,
                        'success'
                    )]
                });
            } else {
                let errorText = `❌ El respaldo "${nombre}" tiene problemas:\n\n`;
                
                if (verification.error) {
                    errorText += `**Error:** ${verification.error}`;
                } else if (verification.issues) {
                    errorText += `**Problemas encontrados:**\n${verification.issues.map(issue => `• ${issue}`).join('\n')}`;
                }

                await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Respaldo Inválido',
                        errorText,
                        'error'
                    )]
                });
            }

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al verificar respaldo: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleCleanBackups(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const dias = interaction.options.getInteger('dias') || 30;
        const maximo = interaction.options.getInteger('maximo') || 50;

        try {
            const deleted = await BackupManager.cleanOldBackups(dias, maximo);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Limpieza Completada',
                    `Se han eliminado ${deleted} respaldos antiguos.\n\n**Criterios:**\n• Mantener últimos ${dias} días\n• Máximo ${maximo} respaldos`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al limpiar respaldos: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleBackupInfo(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const nombre = interaction.options.getString('nombre');

        try {
            const backups = await BackupManager.listBackups();
            const backup = backups.find(b => b.name === nombre);

            if (!backup) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        `No se encontró el respaldo "${nombre}".`,
                        'error'
                    )]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`💾 Información del Respaldo`)
                .setColor('#32CD32')
                .setTimestamp();

            const sizeInMB = backup.totalSize ? (backup.totalSize / (1024 * 1024)).toFixed(2) : 'Desconocido';
            const type = backup.type || 'full';
            const typeText = type === 'full' ? 'Completo' : 'Incremental';
            
            embed.addFields(
                { name: '📋 Nombre', value: backup.name, inline: true },
                { name: '📊 Tipo', value: typeText, inline: true },
                { name: '📅 Creado', value: moment(backup.created).format('DD/MM/YYYY HH:mm'), inline: true },
                { name: '💾 Tamaño', value: `${sizeInMB} MB`, inline: true },
                { name: '📁 Elementos', value: `${backup.itemCount || 0}`, inline: true },
                { name: '🕐 Timestamp', value: backup.timestamp, inline: true }
            );

            if (backup.items && backup.items.length > 0) {
                let itemsText = '';
                backup.items.slice(0, 10).forEach(item => {
                    const itemSize = item.size ? `(${(item.size / 1024).toFixed(1)} KB)` : '';
                    itemsText += `• ${item.name} ${itemSize}\n`;
                });

                if (backup.items.length > 10) {
                    itemsText += `\n*... y ${backup.items.length - 10} elementos más*`;
                }

                embed.addFields({
                    name: '📄 Contenido',
                    value: itemsText || 'Sin información detallada',
                    inline: false
                });
            }

            if (type === 'incremental' && backup.basedOn) {
                embed.addFields({
                    name: '🔗 Respaldo Base',
                    value: moment(backup.basedOn).format('DD/MM/YYYY HH:mm'),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al obtener información: ${error.message}`,
                    'error'
                )]
            });
        }
    },

    async handleExportBackup(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const nombre = interaction.options.getString('nombre');

        try {
            const exportResult = await BackupManager.exportBackup(nombre);
            const sizeInMB = (exportResult.size / (1024 * 1024)).toFixed(2);

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Respaldo Exportado',
                    `El respaldo "${nombre}" ha sido exportado.\n\n**Archivo:** ${exportResult.exportPath.split(/[/\\]/).pop()}\n**Tamaño:** ${sizeInMB} MB\n\n*El archivo se encuentra en el servidor del bot.*`,
                    'success'
                )]
            });

        } catch (error) {
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    `Error al exportar respaldo: ${error.message}`,
                    'error'
                )]
            });
        }
    }
};