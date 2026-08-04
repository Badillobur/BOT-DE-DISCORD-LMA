const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // Manejar comandos slash
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ No se encontró el comando ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('❌ Error ejecutando comando:', error);
                
                const errorMessage = { 
                    content: '❌ Hubo un error al ejecutar este comando!', 
                    ephemeral: true 
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }

        // Manejar selecciones de menú (tickets)
        if (interaction.isStringSelectMenu()) {
            const ticketHandler = require('../utils/ticketHandler');
            await ticketHandler.handleTicketSelection(interaction, client);
        }

        // Manejar botones
        if (interaction.isButton()) {
            const buttonHandler = require('../utils/buttonHandler');
            await buttonHandler.handleButtonInteraction(interaction, client);
        }

        // Manejar modales
        if (interaction.isModalSubmit()) {
            const modalHandler = require('../utils/modalHandler');
            await modalHandler.handleModalSubmit(interaction, client);
        }
    },
};