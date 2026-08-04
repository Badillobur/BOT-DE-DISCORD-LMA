const CustomEmbedBuilder = require('./embedBuilder');
const TicketHandler = require('./ticketHandler');
const config = require('../config.json');

class ButtonHandler {
    /**
     * Manejar interacciones de botones
     */
    static async handleButtonInteraction(interaction, client) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith('close_ticket_')) {
                await this.handleCloseTicket(interaction, client);
            } else if (customId.startsWith('confirm_close_')) {
                await this.handleConfirmClose(interaction, client);
            } else if (customId.startsWith('cancel_close_')) {
                await this.handleCancelClose(interaction, client);
            } else if (customId.startsWith('confirm_delete_')) {
                await this.handleConfirmDeleteAnnouncement(interaction, client);
            } else if (customId.startsWith('cancel_delete_')) {
                await this.handleCancelDeleteAnnouncement(interaction, client);
            } else if (customId.startsWith('confirm_restore_')) {
                await this.handleConfirmRestore(interaction, client);
            } else if (customId.startsWith('cancel_restore_')) {
                await this.handleCancelRestore(interaction, client);
            }
        } catch (error) {
            console.error('❌ Error manejando botón:', error);
            
            const errorMessage = {
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al procesar tu acción.',
                    'error'
                )],
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    /**
     * Manejar cierre de ticket
     */
    static async handleCloseTicket(interaction, client) {
        const ticketId = interaction.customId.replace('close_ticket_', '');
        
        // Verificar permisos
        const hasPermission = this.checkClosePermission(interaction);
        if (!hasPermission) {
            return await interaction.reply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Sin Permisos',
                    'No tienes permisos para cerrar este ticket.',
                    'error'
                )],
                ephemeral: true
            });
        }

        // Crear botones de confirmación
        const confirmButtons = CustomEmbedBuilder.createActionButtons([
            {
                customId: `confirm_close_${ticketId}`,
                label: 'Confirmar',
                style: 4, // Danger
                emoji: '✅'
            },
            {
                customId: `cancel_close_${ticketId}`,
                label: 'Cancelar',
                style: 2, // Secondary
                emoji: '❌'
            }
        ]);

        await interaction.reply({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Confirmar Cierre',
                '¿Estás seguro de que quieres cerrar este ticket?\n\n**Esta acción no se puede deshacer.**',
                'warning'
            )],
            components: [confirmButtons],
            ephemeral: true
        });
    }

    /**
     * Confirmar cierre de ticket
     */
    static async handleConfirmClose(interaction, client) {
        const ticketId = interaction.customId.replace('confirm_close_', '');
        
        await interaction.deferReply({ ephemeral: true });

        try {
            // Cerrar ticket en la base de datos
            const ticket = await TicketHandler.closeTicket(ticketId, interaction.user);
            
            if (!ticket) {
                return await interaction.editReply({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        'No se pudo encontrar el ticket.',
                        'error'
                    )]
                });
            }

            // Enviar mensaje de cierre en el canal
            const closeEmbed = CustomEmbedBuilder.createConfirmationEmbed(
                'Ticket Cerrado',
                `Este ticket ha sido cerrado por <@${interaction.user.id}>\n\n**Fecha de cierre:** ${new Date().toLocaleString()}\n\nEl canal será eliminado en 10 segundos.`,
                'info'
            );

            await interaction.channel.send({ embeds: [closeEmbed] });

            // Log del cierre
            await TicketHandler.logTicketAction(
                interaction.guild, 
                'close', 
                ticket, 
                interaction.user
            );

            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Ticket Cerrado',
                    'El ticket ha sido cerrado exitosamente.',
                    'success'
                )]
            });

            // Eliminar canal después de 10 segundos
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error('❌ Error eliminando canal:', error);
                }
            }, 10000);

        } catch (error) {
            console.error('❌ Error cerrando ticket:', error);
            await interaction.editReply({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al cerrar el ticket.',
                    'error'
                )]
            });
        }
    }

    /**
     * Cancelar cierre de ticket
     */
    static async handleCancelClose(interaction, client) {
        await interaction.update({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Operación Cancelada',
                'El cierre del ticket ha sido cancelado.',
                'info'
            )],
            components: []
        });
    }

    /**
     * Verificar permisos para cerrar ticket
     */
    static checkClosePermission(interaction) {
        // El dueño del servidor siempre puede cerrar
        if (interaction.user.id === interaction.guild.ownerId) return true;

        // Verificar si tiene rol de admin
        const hasAdminRole = interaction.member.roles.cache.some(role => 
            config.adminRoles.includes(role.name)
        );

        if (hasAdminRole) return true;

        // Verificar si es el creador del ticket
        const tickets = require('../data/tickets.json');
        const ticket = Object.values(tickets).find(t => 
            t.channelId === interaction.channel.id
        );

        return ticket && ticket.userId === interaction.user.id;
    }

    /**
     * Confirmar eliminación de anuncio
     */
    static async handleConfirmDeleteAnnouncement(interaction, client) {
        const announcementId = interaction.customId.replace('confirm_delete_', '');
        
        try {
            const fs = require('fs-extra');
            const path = require('path');
            
            const configPath = path.join(__dirname, '..', 'config.json');
            const config = await fs.readJson(configPath);
            
            if (!config.announcements[announcementId]) {
                return await interaction.update({
                    embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                        'Error',
                        'El anuncio ya no existe.',
                        'error'
                    )],
                    components: []
                });
            }

            // Eliminar anuncio
            delete config.announcements[announcementId];
            await fs.writeJson(configPath, config, { spaces: 2 });

            await interaction.update({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Anuncio Eliminado',
                    `El anuncio "${announcementId}" ha sido eliminado exitosamente.`,
                    'success'
                )],
                components: []
            });

        } catch (error) {
            console.error('❌ Error eliminando anuncio:', error);
            await interaction.update({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error',
                    'Hubo un error al eliminar el anuncio.',
                    'error'
                )],
                components: []
            });
        }
    }

    /**
     * Cancelar eliminación de anuncio
     */
    static async handleCancelDeleteAnnouncement(interaction, client) {
        await interaction.update({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Operación Cancelada',
                'La eliminación del anuncio ha sido cancelada.',
                'info'
            )],
            components: []
        });
    }

    /**
     * Confirmar restauración de respaldo
     */
    static async handleConfirmRestore(interaction, client) {
        const backupName = interaction.customId.replace('confirm_restore_', '');
        
        await interaction.update({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Restaurando...',
                `Iniciando restauración desde "${backupName}". Esto puede tomar unos minutos...`,
                'warning'
            )],
            components: []
        });

        try {
            const BackupManager = require('./backupManager');
            const LogManager = require('./logManager');
            
            const result = await BackupManager.restoreFromBackup(backupName);
            
            // Log de la restauración
            await LogManager.log(
                LogManager.LogTypes.INFO,
                `Backup restored: ${backupName}`,
                {
                    backupName,
                    restoredItems: result.restored,
                    adminUserId: interaction.user.id,
                    adminUsername: interaction.user.username,
                    preRestoreBackup: result.preRestoreBackup
                },
                interaction.guild.id
            );

            await interaction.followUp({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Restauración Completada',
                    `**Respaldo restaurado:** ${backupName}\n**Elementos restaurados:** ${result.restored.length}\n**Respaldo pre-restauración:** ${result.preRestoreBackup}\n\n**IMPORTANTE:** Reinicia el bot para aplicar los cambios.`,
                    'success'
                )],
                ephemeral: true
            });

        } catch (error) {
            console.error('❌ Error en restauración:', error);
            await interaction.followUp({
                embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                    'Error en Restauración',
                    `No se pudo completar la restauración: ${error.message}`,
                    'error'
                )],
                ephemeral: true
            });
        }
    }

    /**
     * Cancelar restauración de respaldo
     */
    static async handleCancelRestore(interaction, client) {
        await interaction.update({
            embeds: [CustomEmbedBuilder.createConfirmationEmbed(
                'Restauración Cancelada',
                'La operación de restauración ha sido cancelada.',
                'info'
            )],
            components: []
        });
    }
}

module.exports = ButtonHandler;